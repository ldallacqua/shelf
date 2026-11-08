//! OneDrive and Google Drive as this PC's place for saves (ADR 008, phase 5), the only code that knows their
//! addresses. Each is reached with a sign-in of mine, on the service's own page, for the narrowest access
//! it offers: OneDrive's app folder (`Files.ReadWrite.AppFolder`, `Apps/Shelf` and nothing else), and in
//! Google Drive only what Shelf made (`drive.file`), which I still see and can download. What the sign-in
//! gives is kept in Windows' Credential Manager and never reaches a page: an account's name is all a page
//! is told. Shelf's own server never sees any of it.
//!
//! Shelf has to be registered with each service for this, which only the owner can do: a build is given
//! the registrations' ids when it is made (`SHELF_ONEDRIVE_CLIENT_ID`, `SHELF_GOOGLE_CLIENT_ID` and
//! `SHELF_GOOGLE_CLIENT_SECRET`, from `.env.local`), and a build without one doesn't offer that service.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use reqwest::{Client, RequestBuilder, Response, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::sync::Notify;

use super::remote::{Away, Remote, RemoteFile};
use super::sign_in::{self, Ended};
use crate::vault::Vault;

/// A service a PC's snapshots can go to.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Service {
    #[serde(rename = "onedrive")]
    OneDrive,
    #[serde(rename = "google-drive")]
    GoogleDrive,
}

impl Service {
    pub const ALL: [Service; 2] = [Service::OneDrive, Service::GoogleDrive];

    /// Its name, as people know it.
    pub fn name(self) -> &'static str {
        match self {
            Service::OneDrive => "OneDrive",
            Service::GoogleDrive => "Google Drive",
        }
    }

    /// Its word in commands, files and Credential Manager.
    pub fn key(self) -> &'static str {
        match self {
            Service::OneDrive => "onedrive",
            Service::GoogleDrive => "google-drive",
        }
    }

    pub fn of(key: &str) -> Option<Service> {
        Service::ALL
            .into_iter()
            .find(|service| service.key() == key)
    }

    /// Credential Manager's entry for its sign-in.
    pub fn vault_name(self) -> &'static str {
        match self {
            Service::OneDrive => "saves-onedrive",
            Service::GoogleDrive => "saves-google-drive",
        }
    }
}

/// Where a service is, and Shelf's registration with it.
#[derive(Clone, Debug)]
struct Setup {
    client_id: String,
    /// Google's for an app on a computer, which it says isn't a secret there; Microsoft's has none.
    client_secret: Option<String>,
    authorize: String,
    token: String,
    api: String,
    revoke: Option<String>,
    /// The address the browser comes back to: Microsoft takes `localhost` at any port, Google `127.0.0.1`.
    host: &'static str,
    scope: &'static str,
}

/// A value given to the build, or in a development build to the app when it starts.
fn given(name: &str, built: Option<&'static str>) -> Option<String> {
    #[cfg(debug_assertions)]
    if let Ok(value) = std::env::var(name) {
        return Some(value).filter(|value| !value.is_empty());
    }
    let _ = name;
    built.map(str::to_string).filter(|value| !value.is_empty())
}

fn setup(service: Service) -> Option<Setup> {
    // A development build can be pointed at a stand-in for both.
    #[cfg(debug_assertions)]
    let stand_in = std::env::var("SHELF_CLOUD_STAND_IN").ok();
    #[cfg(not(debug_assertions))]
    let stand_in: Option<String> = None;
    let (client_id, client_secret) = match service {
        Service::OneDrive => (
            given(
                "SHELF_ONEDRIVE_CLIENT_ID",
                option_env!("SHELF_ONEDRIVE_CLIENT_ID"),
            )?,
            None,
        ),
        Service::GoogleDrive => (
            given(
                "SHELF_GOOGLE_CLIENT_ID",
                option_env!("SHELF_GOOGLE_CLIENT_ID"),
            )?,
            Some(given(
                "SHELF_GOOGLE_CLIENT_SECRET",
                option_env!("SHELF_GOOGLE_CLIENT_SECRET"),
            )?),
        ),
    };
    Some(setup_with(
        service,
        client_id,
        client_secret,
        stand_in.as_deref(),
    ))
}

/// A service's addresses, or a stand-in's in its place, with Shelf's registration.
fn setup_with(
    service: Service,
    client_id: String,
    client_secret: Option<String>,
    stand_in: Option<&str>,
) -> Setup {
    let at = |real: &str, path: &str| match stand_in {
        Some(base) => format!("{base}/{}{path}", service.key()),
        None => format!("{real}{path}"),
    };
    match service {
        Service::OneDrive => Setup {
            client_id,
            client_secret,
            authorize: at(
                "https://login.microsoftonline.com",
                "/common/oauth2/v2.0/authorize",
            ),
            token: at(
                "https://login.microsoftonline.com",
                "/common/oauth2/v2.0/token",
            ),
            api: at("https://graph.microsoft.com", "/v1.0"),
            revoke: None,
            host: "localhost",
            scope: "openid profile offline_access Files.ReadWrite.AppFolder",
        },
        Service::GoogleDrive => Setup {
            client_id,
            client_secret,
            authorize: at("https://accounts.google.com", "/o/oauth2/v2/auth"),
            token: at("https://oauth2.googleapis.com", "/token"),
            api: at("https://www.googleapis.com", ""),
            revoke: Some(at("https://oauth2.googleapis.com", "/revoke")),
            host: "127.0.0.1",
            scope: "openid email https://www.googleapis.com/auth/drive.file",
        },
    }
}

/// What a sign-in gives, which stays on this side.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tokens {
    access: String,
    refresh: String,
    /// When `access` ends, in milliseconds since 1970.
    ends_at: u64,
    account: String,
}

/// A token this close to its end is refreshed first.
const ENDS_SOON_MS: u64 = 60_000;
/// A file is sent in pieces this large: a multiple of what both services ask (320 KiB and 256 KiB), the
/// smallest such in tests.
const PIECE: usize = if cfg!(test) {
    1280 * 1024
} else {
    10 * 1024 * 1024
};
/// The folder in Google Drive, in My Drive, that holds a folder per game.
const DRIVE_FOLDER: &str = "Shelf saves";
const FOLDER_TYPE: &str = "application/vnd.google-apps.folder";

fn now() -> u64 {
    crate::commands::now()
}

/// One service, signed in or not.
pub struct Cloud {
    pub service: Service,
    setup: Option<Setup>,
    client: Client,
    vault: Box<dyn Vault>,
    tokens: Mutex<Option<Tokens>>,
    refreshing: tokio::sync::Mutex<()>,
    /// A sign-in under way, which Cancel ends.
    signing_in: Mutex<Option<Arc<Notify>>>,
    /// Google Drive's folders, found once: `Shelf saves`, and each game's in it.
    drive_root: Mutex<Option<String>>,
    drive_games: Mutex<HashMap<String, Vec<String>>>,
}

impl Cloud {
    pub fn open(service: Service, vault: Box<dyn Vault>, version: &str) -> Self {
        Self::with(service, setup(service), vault, version)
    }

    fn with(service: Service, setup: Option<Setup>, vault: Box<dyn Vault>, version: &str) -> Self {
        let client = Client::builder()
            .user_agent(format!("Shelf/{version}"))
            .connect_timeout(Duration::from_secs(15))
            // A large piece on a slow line takes a while; nothing waits on it but the snapshot.
            .timeout(Duration::from_secs(10 * 60))
            .build()
            .unwrap_or_default();
        let tokens = vault
            .load()
            .and_then(|text| serde_json::from_str(&text).ok());
        Cloud {
            service,
            setup,
            client,
            vault,
            tokens: Mutex::new(tokens),
            refreshing: tokio::sync::Mutex::new(()),
            signing_in: Mutex::new(None),
            drive_root: Mutex::new(None),
            drive_games: Mutex::new(HashMap::new()),
        }
    }

    /// Whether this build is registered with the service.
    pub fn available(&self) -> bool {
        self.setup.is_some()
    }

    /// The account signed in, by its email or the name it signs in with.
    pub fn account(&self) -> Option<String> {
        self.tokens
            .lock()
            .unwrap()
            .as_ref()
            .map(|held| held.account.clone())
    }

    pub fn signing_in(&self) -> bool {
        self.signing_in.lock().unwrap().is_some()
    }

    fn keep(&self, held: Tokens) {
        self.vault
            .save(&serde_json::to_string(&held).unwrap_or_default());
        *self.tokens.lock().unwrap() = Some(held);
    }

    fn forget(&self) {
        self.vault.clear();
        *self.tokens.lock().unwrap() = None;
        *self.drive_root.lock().unwrap() = None;
        self.drive_games.lock().unwrap().clear();
    }

    /// Signs in on the service's own page, which `open` opens in the default browser, and waits for it to
    /// come back. Returns the account's name.
    pub async fn sign_in(&self, open: impl FnOnce(&str) -> bool) -> Result<String, Ended> {
        let setup = self.setup.clone().ok_or(Ended::Unavailable)?;
        let cancel = Arc::new(Notify::new());
        {
            let mut under_way = self.signing_in.lock().unwrap();
            // A second sign-in ends the first: only the latest page's answer is waited for.
            if let Some(earlier) = under_way.replace(cancel.clone()) {
                earlier.notify_one();
            }
        }
        let result = self.sign_in_with(&setup, open, cancel.clone()).await;
        let mut under_way = self.signing_in.lock().unwrap();
        if under_way
            .as_ref()
            .is_some_and(|now| Arc::ptr_eq(now, &cancel))
        {
            *under_way = None;
        }
        result
    }

    async fn sign_in_with(
        &self,
        setup: &Setup,
        open: impl FnOnce(&str) -> bool,
        cancel: Arc<Notify>,
    ) -> Result<String, Ended> {
        let verifier = sign_in::random();
        let state = sign_in::random();
        let listening = sign_in::listen(setup.host)
            .await
            .map_err(|_| Ended::Unreachable)?;
        let redirect = format!("http://{}:{}/", setup.host, listening.port);
        let mut url = url::Url::parse(&setup.authorize).map_err(|_| Ended::Refused)?;
        {
            let mut query = url.query_pairs_mut();
            query
                .append_pair("client_id", &setup.client_id)
                .append_pair("response_type", "code")
                .append_pair("redirect_uri", &redirect)
                .append_pair("scope", setup.scope)
                .append_pair("state", &state)
                .append_pair("code_challenge", &sign_in::challenge(&verifier))
                .append_pair("code_challenge_method", "S256");
            match self.service {
                Service::OneDrive => {
                    query
                        .append_pair("response_mode", "query")
                        .append_pair("prompt", "select_account");
                }
                Service::GoogleDrive => {
                    // A refresh token, asked for each time: Google gives one only on consent.
                    query
                        .append_pair("access_type", "offline")
                        .append_pair("prompt", "consent");
                }
            }
        }
        if !open(url.as_str()) {
            return Err(Ended::Unreachable);
        }
        let code = sign_in::wait(listening, &state, cancel).await?;
        let mut form = vec![
            ("grant_type", "authorization_code"),
            ("code", code.as_str()),
            ("redirect_uri", redirect.as_str()),
            ("client_id", setup.client_id.as_str()),
            ("code_verifier", verifier.as_str()),
        ];
        if let Some(secret) = &setup.client_secret {
            form.push(("client_secret", secret));
        }
        if self.service == Service::OneDrive {
            form.push(("scope", setup.scope));
        }
        let answer = sign_in::tokens(&self.client, &setup.token, &form).await?;
        let refresh = answer.refresh_token.ok_or(Ended::Refused)?;
        let account = answer
            .id_token
            .as_deref()
            .and_then(sign_in::account_of)
            .unwrap_or_else(|| self.service.name().to_string());
        self.forget();
        self.keep(Tokens {
            access: answer.access_token,
            refresh,
            ends_at: now() + answer.expires_in * 1000,
            account: account.clone(),
        });
        Ok(account)
    }

    /// Stops waiting for the browser.
    pub fn cancel_sign_in(&self) {
        if let Some(under_way) = self.signing_in.lock().unwrap().take() {
            under_way.notify_one();
        }
    }

    /// Ends the sign-in at the service where it can be ended (Google), and forgets it here whether or not.
    pub async fn sign_out(&self) {
        self.cancel_sign_in();
        let refresh = self
            .tokens
            .lock()
            .unwrap()
            .as_ref()
            .map(|held| held.refresh.clone());
        if let (Some(refresh), Some(revoke)) = (
            refresh,
            self.setup.as_ref().and_then(|setup| setup.revoke.clone()),
        ) {
            let _ = sign_in::tokens(&self.client, &revoke, &[("token", refresh.as_str())]).await;
        }
        self.forget();
    }

    /// A token good now, refreshed if it is ending or `stale`. Only a refusal signs out: without a
    /// connection, the sign-in is kept.
    async fn access(&self, stale: Option<&str>) -> Result<String, Away> {
        let fresh = |held: &Tokens| {
            stale != Some(held.access.as_str()) && held.ends_at > now() + ENDS_SOON_MS
        };
        let good = |this: &Self| {
            this.tokens
                .lock()
                .unwrap()
                .as_ref()
                .map(|held| (fresh(held).then(|| held.access.clone()), held.clone()))
        };
        let (token, _) = good(self).ok_or(Away::SignedOut)?;
        if let Some(token) = token {
            return Ok(token);
        }
        let _one_at_a_time = self.refreshing.lock().await;
        let (token, held) = good(self).ok_or(Away::SignedOut)?;
        if let Some(token) = token {
            return Ok(token);
        }
        let setup = self.setup.clone().ok_or(Away::SignedOut)?;
        let mut form = vec![
            ("grant_type", "refresh_token"),
            ("refresh_token", held.refresh.as_str()),
            ("client_id", setup.client_id.as_str()),
        ];
        if let Some(secret) = &setup.client_secret {
            form.push(("client_secret", secret));
        }
        if self.service == Service::OneDrive {
            form.push(("scope", setup.scope));
        }
        match sign_in::tokens(&self.client, &setup.token, &form).await {
            Ok(answer) => {
                let access = answer.access_token.clone();
                self.keep(Tokens {
                    access: answer.access_token,
                    // Microsoft gives a new one each time; Google keeps the first.
                    refresh: answer.refresh_token.unwrap_or(held.refresh.clone()),
                    ends_at: now() + answer.expires_in * 1000,
                    ..held
                });
                Ok(access)
            }
            Err(Ended::Unreachable) => Err(Away::Unreachable),
            Err(_) => {
                self.forget();
                Err(Away::SignedOut)
            }
        }
    }

    /// A call with the token, refreshed once if it is refused.
    async fn call(
        &self,
        build: impl Fn(&Client, &str) -> RequestBuilder,
    ) -> Result<Response, Away> {
        let mut token = self.access(None).await?;
        let mut again = true;
        loop {
            let response = build(&self.client, &token)
                .send()
                .await
                .map_err(|_| Away::Unreachable)?;
            if response.status() == StatusCode::UNAUTHORIZED && again {
                again = false;
                token = self.access(Some(&token)).await?;
                continue;
            }
            return Ok(response);
        }
    }

    fn api(&self) -> Result<&str, Away> {
        self.setup
            .as_ref()
            .map(|setup| setup.api.as_str())
            .ok_or(Away::SignedOut)
    }

    /// The JSON of a successful answer, or why it failed.
    async fn json<T: for<'de> Deserialize<'de>>(response: Response) -> Result<T, Away> {
        let status = response.status();
        let bytes = response.bytes().await.map_err(|_| Away::Unreachable)?;
        if !status.is_success() {
            return Err(away_of(status, &bytes));
        }
        serde_json::from_slice(&bytes).map_err(|_| Away::Unreachable)
    }

    /// Writes an answer's body into `to` as it comes.
    async fn save_to(mut response: Response, to: &Path) -> Result<(), Away> {
        let status = response.status();
        if !status.is_success() {
            let bytes = response.bytes().await.unwrap_or_default();
            return Err(away_of(status, &bytes));
        }
        let mut file = fs::File::create(to).map_err(|_| Away::Unreachable)?;
        while let Some(piece) = response.chunk().await.map_err(|_| Away::Unreachable)? {
            std::io::Write::write_all(&mut file, &piece).map_err(|_| Away::Unreachable)?;
        }
        std::io::Write::flush(&mut file).map_err(|_| Away::Unreachable)
    }

    /// Sends a file to an upload session, a piece at a time, as both services take one: each piece says
    /// where it goes. The last piece's answer is the file's.
    async fn send_pieces(
        &self,
        session: &str,
        from: &Path,
        token: Option<&str>,
    ) -> Result<(), Away> {
        let mut file = fs::File::open(from).map_err(|_| Away::Unreachable)?;
        let total = file.metadata().map_err(|_| Away::Unreachable)?.len();
        let mut start = 0u64;
        loop {
            let mut piece = vec![0u8; PIECE.min((total - start) as usize)];
            file.read_exact(&mut piece).map_err(|_| Away::Unreachable)?;
            let end = start + piece.len() as u64;
            let mut request = self
                .client
                .put(session)
                .header(reqwest::header::CONTENT_LENGTH, piece.len())
                .header(
                    reqwest::header::CONTENT_RANGE,
                    format!("bytes {start}-{}/{total}", end - 1),
                )
                .body(piece);
            if let Some(token) = token {
                request = request.bearer_auth(token);
            }
            let response = request.send().await.map_err(|_| Away::Unreachable)?;
            let status = response.status();
            let last = end >= total;
            // More is expected: Microsoft says 202, Google 308.
            let more = status == StatusCode::ACCEPTED || status.as_u16() == 308;
            if last && status.is_success() && status != StatusCode::ACCEPTED {
                return Ok(());
            }
            if !last && more {
                start = end;
                continue;
            }
            let bytes = response.bytes().await.unwrap_or_default();
            return Err(away_of(status, &bytes));
        }
    }

    // --- OneDrive: Microsoft Graph, the app's own folder ---------------------------------------------

    fn in_app_folder(&self, path: &str) -> Result<String, Away> {
        Ok(format!("{}/me/drive/special/approot:/{path}", self.api()?))
    }

    async fn onedrive_files(&self, entry: &str) -> Result<Vec<RemoteFile>, Away> {
        #[derive(Deserialize)]
        struct Item {
            name: String,
            #[serde(default)]
            size: u64,
            file: Option<serde_json::Value>,
        }
        #[derive(Deserialize)]
        struct Page {
            value: Vec<Item>,
            #[serde(rename = "@odata.nextLink")]
            next: Option<String>,
        }
        let mut next = Some(format!(
            "{}:/children?$select=name,size,file&$top=999",
            self.in_app_folder(entry)?
        ));
        let mut files = Vec::new();
        while let Some(address) = next.take() {
            let response = self
                .call(|client, token| client.get(&address).bearer_auth(token))
                .await?;
            // No folder yet: nothing sent of this game.
            if response.status() == StatusCode::NOT_FOUND {
                return Ok(Vec::new());
            }
            let page: Page = Self::json(response).await?;
            files.extend(
                page.value
                    .into_iter()
                    .filter(|item| item.file.is_some())
                    .map(|item| RemoteFile {
                        id: item.name.clone(),
                        name: item.name,
                        size: item.size,
                    }),
            );
            next = page.next;
        }
        Ok(files)
    }

    async fn onedrive_download(&self, entry: &str, name: &str, to: &Path) -> Result<(), Away> {
        let address = format!(
            "{}:/content",
            self.in_app_folder(&format!("{entry}/{name}"))?
        );
        // Graph answers with where the bytes are; the client follows, and never takes the token along.
        let response = self
            .call(|client, token| client.get(&address).bearer_auth(token))
            .await?;
        Self::save_to(response, to).await
    }

    async fn onedrive_upload(&self, entry: &str, name: &str, from: &Path) -> Result<(), Away> {
        #[derive(Deserialize)]
        struct Session {
            #[serde(rename = "uploadUrl")]
            upload_url: String,
        }
        let address = format!(
            "{}:/createUploadSession",
            self.in_app_folder(&format!("{entry}/{name}"))?
        );
        let body =
            serde_json::json!({ "item": { "@microsoft.graph.conflictBehavior": "replace" } });
        let response = self
            .call(|client, token| client.post(&address).bearer_auth(token).json(&body))
            .await?;
        let session: Session = Self::json(response).await?;
        // The session's address carries its own right to write: no token goes with it.
        self.send_pieces(&session.upload_url, from, None).await
    }

    async fn onedrive_delete(&self, entry: &str, name: &str) -> Result<(), Away> {
        let address = self.in_app_folder(&format!("{entry}/{name}"))?;
        let response = self
            .call(|client, token| client.delete(&address).bearer_auth(token))
            .await?;
        gone_or(response).await
    }

    // --- Google Drive: what Shelf made, in `Shelf saves` --------------------------------------------

    /// Folders by name under a parent, oldest first: two PCs may each have made one at the same moment.
    async fn drive_folders(&self, name: &str, parent: &str) -> Result<Vec<String>, Away> {
        #[derive(Deserialize)]
        struct Found {
            id: String,
        }
        #[derive(Deserialize)]
        struct Page {
            files: Vec<Found>,
        }
        let mut address = url::Url::parse(&format!("{}/drive/v3/files", self.api()?))
            .map_err(|_| Away::Unreachable)?;
        address
            .query_pairs_mut()
            .append_pair(
                "q",
                &format!(
                    "name = '{name}' and '{parent}' in parents and mimeType = '{FOLDER_TYPE}' and trashed = false"
                ),
            )
            .append_pair("fields", "files(id)")
            .append_pair("orderBy", "createdTime")
            .append_pair("spaces", "drive");
        let response = self
            .call(|client, token| client.get(address.as_str()).bearer_auth(token))
            .await?;
        let page: Page = Self::json(response).await?;
        Ok(page.files.into_iter().map(|found| found.id).collect())
    }

    async fn drive_make_folder(&self, name: &str, parent: &str) -> Result<String, Away> {
        #[derive(Deserialize)]
        struct Made {
            id: String,
        }
        let address = format!("{}/drive/v3/files?fields=id", self.api()?);
        let body =
            serde_json::json!({ "name": name, "mimeType": FOLDER_TYPE, "parents": [parent] });
        let response = self
            .call(|client, token| client.post(&address).bearer_auth(token).json(&body))
            .await?;
        let made: Made = Self::json(response).await?;
        Ok(made.id)
    }

    /// `Shelf saves`, in My Drive: found, or made when `make`.
    async fn drive_root(&self, make: bool) -> Result<Option<String>, Away> {
        if let Some(root) = self.drive_root.lock().unwrap().clone() {
            return Ok(Some(root));
        }
        let mut found = self.drive_folders(DRIVE_FOLDER, "root").await?;
        if found.is_empty() && make {
            found.push(self.drive_make_folder(DRIVE_FOLDER, "root").await?);
        }
        let root = found.into_iter().next();
        (*self.drive_root.lock().unwrap()).clone_from(&root);
        Ok(root)
    }

    /// A game's folders in `Shelf saves`: found, or one made when `make`.
    async fn drive_game(&self, entry: &str, make: bool) -> Result<Vec<String>, Away> {
        if let Some(known) = self.drive_games.lock().unwrap().get(entry).cloned()
            && !known.is_empty()
        {
            return Ok(known);
        }
        let Some(root) = self.drive_root(make).await? else {
            return Ok(Vec::new());
        };
        let mut found = self.drive_folders(entry, &root).await?;
        if found.is_empty() && make {
            found.push(self.drive_make_folder(entry, &root).await?);
        }
        if !found.is_empty() {
            self.drive_games
                .lock()
                .unwrap()
                .insert(entry.to_string(), found.clone());
        }
        Ok(found)
    }

    async fn drive_files(&self, entry: &str) -> Result<Vec<RemoteFile>, Away> {
        #[derive(Deserialize)]
        struct Found {
            id: String,
            name: String,
            size: Option<String>,
        }
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Page {
            files: Vec<Found>,
            next_page_token: Option<String>,
        }
        let mut files = Vec::new();
        for folder in self.drive_game(entry, false).await? {
            let mut page_token: Option<String> = None;
            loop {
                let mut address = url::Url::parse(&format!("{}/drive/v3/files", self.api()?))
                    .map_err(|_| Away::Unreachable)?;
                {
                    let mut query = address.query_pairs_mut();
                    query
                        .append_pair(
                            "q",
                            &format!(
                                "'{folder}' in parents and trashed = false and mimeType != '{FOLDER_TYPE}'"
                            ),
                        )
                        .append_pair("fields", "nextPageToken,files(id,name,size)")
                        .append_pair("pageSize", "1000")
                        .append_pair("spaces", "drive");
                    if let Some(page_token) = &page_token {
                        query.append_pair("pageToken", page_token);
                    }
                }
                let response = self
                    .call(|client, token| client.get(address.as_str()).bearer_auth(token))
                    .await?;
                let page: Page = Self::json(response).await?;
                for found in page.files {
                    // Names aren't unique in Drive: the first of a name is the one.
                    if files
                        .iter()
                        .any(|file: &RemoteFile| file.name == found.name)
                    {
                        continue;
                    }
                    files.push(RemoteFile {
                        size: found.size.and_then(|size| size.parse().ok()).unwrap_or(0),
                        name: found.name,
                        id: found.id,
                    });
                }
                page_token = page.next_page_token;
                if page_token.is_none() {
                    break;
                }
            }
        }
        Ok(files)
    }

    async fn drive_download(&self, id: &str, to: &Path) -> Result<(), Away> {
        let address = format!("{}/drive/v3/files/{id}?alt=media", self.api()?);
        let response = self
            .call(|client, token| client.get(&address).bearer_auth(token))
            .await?;
        Self::save_to(response, to).await
    }

    async fn drive_upload(&self, entry: &str, name: &str, from: &Path) -> Result<(), Away> {
        let folder = self
            .drive_game(entry, true)
            .await?
            .into_iter()
            .next()
            .ok_or(Away::Unreachable)?;
        let total = fs::metadata(from).map_err(|_| Away::Unreachable)?.len();
        let address = format!(
            "{}/upload/drive/v3/files?uploadType=resumable&fields=id",
            self.api()?
        );
        let body = serde_json::json!({ "name": name, "parents": [folder] });
        let response = self
            .call(|client, token| {
                client
                    .post(&address)
                    .bearer_auth(token)
                    .header("X-Upload-Content-Length", total)
                    .json(&body)
            })
            .await?;
        let status = response.status();
        let session = response
            .headers()
            .get(reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);
        let Some(session) = session.filter(|_| status.is_success()) else {
            let bytes = response.bytes().await.unwrap_or_default();
            return Err(away_of(status, &bytes));
        };
        let token = self.access(None).await?;
        self.send_pieces(&session, from, Some(&token)).await
    }

    async fn drive_delete(&self, id: &str) -> Result<(), Away> {
        let address = format!("{}/drive/v3/files/{id}", self.api()?);
        let response = self
            .call(|client, token| client.delete(&address).bearer_auth(token))
            .await?;
        gone_or(response).await
    }
}

/// A delete that found nothing there has done what it was asked.
async fn gone_or(response: Response) -> Result<(), Away> {
    let status = response.status();
    if status.is_success() || status == StatusCode::NOT_FOUND {
        return Ok(());
    }
    let bytes = response.bytes().await.unwrap_or_default();
    Err(away_of(status, &bytes))
}

/// Why a service said no: a sign-in it no longer takes, no room, or anything else, which waits and is
/// tried again.
fn away_of(status: StatusCode, body: &[u8]) -> Away {
    let said = String::from_utf8_lossy(body);
    match status.as_u16() {
        401 => Away::SignedOut,
        507 => Away::Full,
        403 if said.contains("storageQuotaExceeded") || said.contains("quotaLimitReached") => {
            Away::Full
        }
        _ => Away::Unreachable,
    }
}

/// The services' calls are made from threads that read disks, never a page's: each waits for its answer.
impl Remote for Cloud {
    fn files(&self, entry: &str) -> Result<Vec<RemoteFile>, Away> {
        tauri::async_runtime::block_on(async {
            match self.service {
                Service::OneDrive => self.onedrive_files(entry).await,
                Service::GoogleDrive => self.drive_files(entry).await,
            }
        })
    }

    fn download(&self, entry: &str, file: &RemoteFile, to: &Path) -> Result<(), Away> {
        tauri::async_runtime::block_on(async {
            match self.service {
                Service::OneDrive => self.onedrive_download(entry, &file.name, to).await,
                Service::GoogleDrive => self.drive_download(&file.id, to).await,
            }
        })
    }

    fn upload(&self, entry: &str, name: &str, from: &Path) -> Result<(), Away> {
        tauri::async_runtime::block_on(async {
            match self.service {
                Service::OneDrive => self.onedrive_upload(entry, name, from).await,
                Service::GoogleDrive => self.drive_upload(entry, name, from).await,
            }
        })
    }

    fn delete(&self, entry: &str, file: &RemoteFile) -> Result<(), Away> {
        tauri::async_runtime::block_on(async {
            match self.service {
                Service::OneDrive => self.onedrive_delete(entry, &file.name).await,
                Service::GoogleDrive => self.drive_delete(&file.id).await,
            }
        })
    }
}

#[cfg(test)]
pub mod double {
    //! OneDrive and Google Drive on this computer, as far as Shelf uses them: tests never talk to the real
    //! ones. One stand-in answers both, each under its own word, as `SHELF_CLOUD_STAND_IN` expects.
    use std::collections::HashMap;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::{Arc, Mutex};

    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;

    /// A request as the stand-in read it.
    pub struct Asked {
        pub method: String,
        pub target: String,
        pub headers: HashMap<String, String>,
        pub body: Vec<u8>,
    }

    impl Asked {
        pub fn token(&self) -> Option<&str> {
            self.headers
                .get("authorization")
                .and_then(|value| value.strip_prefix("Bearer "))
        }

        pub fn form(&self) -> HashMap<String, String> {
            url::form_urlencoded::parse(&self.body)
                .map(|(key, value)| (key.into_owned(), value.into_owned()))
                .collect()
        }

        pub fn query(&self) -> HashMap<String, String> {
            url::Url::parse(&format!("http://stand.in{}", self.target))
                .map(|url| {
                    url.query_pairs()
                        .map(|(key, value)| (key.into_owned(), value.into_owned()))
                        .collect()
                })
                .unwrap_or_default()
        }

        pub fn path(&self) -> &str {
            self.target.split('?').next().unwrap_or("")
        }
    }

    /// An answer: status, headers, body.
    pub type Answer = (u16, Vec<(String, String)>, Vec<u8>);

    fn read(stream: &mut TcpStream) -> Option<Asked> {
        let mut reader = BufReader::new(stream.try_clone().ok()?);
        let mut first = String::new();
        reader.read_line(&mut first).ok()?;
        let mut parts = first.split_whitespace();
        let method = parts.next()?.to_string();
        let target = parts.next()?.to_string();
        let mut headers = HashMap::new();
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).ok()?;
            let line = line.trim_end();
            if line.is_empty() {
                break;
            }
            if let Some((name, value)) = line.split_once(':') {
                headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
            }
        }
        let length = headers
            .get("content-length")
            .and_then(|length| length.parse().ok())
            .unwrap_or(0);
        let mut body = vec![0; length];
        reader.read_exact(&mut body).ok()?;
        Some(Asked {
            method,
            target,
            headers,
            body,
        })
    }

    /// Answers every request with `handler`, for as long as the test runs.
    pub fn serve(handler: impl Fn(&Asked, &str) -> Answer + Send + Sync + 'static) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let base = address.clone();
        let handler = Arc::new(handler);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { return };
                let handler = handler.clone();
                let base = base.clone();
                std::thread::spawn(move || {
                    let Some(asked) = read(&mut stream) else {
                        return;
                    };
                    let (status, headers, body) = handler(&asked, &base);
                    let mut text = format!("HTTP/1.1 {status} Stand-in\r\n");
                    for (name, value) in headers {
                        text.push_str(&format!("{name}: {value}\r\n"));
                    }
                    text.push_str(&format!(
                        "Content-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    ));
                    let _ = stream.write_all(text.as_bytes());
                    let _ = stream.write_all(&body);
                });
            }
        });
        address
    }

    pub fn json(status: u16, value: serde_json::Value) -> Answer {
        (
            status,
            vec![("Content-Type".into(), "application/json".into())],
            serde_json::to_vec(&value).unwrap(),
        )
    }

    /// A file there: its id, its game, its name and its bytes.
    #[derive(Clone)]
    pub struct Kept {
        pub id: String,
        pub parent: String,
        pub name: String,
        pub bytes: Vec<u8>,
        pub folder: bool,
    }

    /// An upload under way: its folder, its name, and what has come.
    pub type Upload = (String, String, Vec<u8>);

    /// What the stand-in holds and what it was asked: one account, its files, and the sign-in's state.
    #[derive(Default)]
    pub struct Account {
        pub files: Mutex<Vec<Kept>>,
        /// Uploads under way: where each goes, and what has come.
        pub sessions: Mutex<HashMap<String, Upload>>,
        /// PKCE's challenge, as the browser brought it.
        pub challenge: Mutex<Option<String>>,
        /// The access token it takes now.
        pub access: Mutex<String>,
        pub refreshed: Mutex<u32>,
        pub revoked: Mutex<Vec<String>>,
        pub next: Mutex<u32>,
    }

    impl Account {
        fn id(&self) -> String {
            let mut next = self.next.lock().unwrap();
            *next += 1;
            format!("id{next}")
        }

        pub fn names(&self) -> Vec<String> {
            let mut names: Vec<String> = self
                .files
                .lock()
                .unwrap()
                .iter()
                .filter(|file| !file.folder)
                .map(|file| file.name.clone())
                .collect();
            names.sort();
            names
        }

        fn token_answer(&self, asked: &Asked, secret: bool) -> Answer {
            let form = asked.form();
            if secret && form.get("client_secret").map(String::as_str) != Some("made-up-secret") {
                return json(401, serde_json::json!({ "error": "invalid_client" }));
            }
            match form.get("grant_type").map(String::as_str) {
                Some("authorization_code") => {
                    let challenge = self.challenge.lock().unwrap().clone();
                    let verifier = form.get("code_verifier").cloned().unwrap_or_default();
                    if form.get("code").map(String::as_str) != Some("made-up-code")
                        || challenge.as_deref()
                            != Some(super::super::sign_in::challenge(&verifier).as_str())
                    {
                        return json(400, serde_json::json!({ "error": "invalid_grant" }));
                    }
                    *self.access.lock().unwrap() = "access-1".into();
                    let claims = URL_SAFE_NO_PAD
                        .encode(br#"{"email":"someone@example.com","preferred_username":"someone@example.com"}"#);
                    json(
                        200,
                        serde_json::json!({
                            "access_token": "access-1",
                            "refresh_token": "refresh-1",
                            "expires_in": 3600,
                            "id_token": format!("h.{claims}.s"),
                        }),
                    )
                }
                Some("refresh_token")
                    if form.get("refresh_token").map(String::as_str) == Some("refresh-1") =>
                {
                    *self.refreshed.lock().unwrap() += 1;
                    *self.access.lock().unwrap() = "access-2".into();
                    json(
                        200,
                        serde_json::json!({ "access_token": "access-2", "expires_in": 3600 }),
                    )
                }
                _ => json(400, serde_json::json!({ "error": "invalid_grant" })),
            }
        }

        fn signed(&self, asked: &Asked) -> bool {
            asked.token() == Some(self.access.lock().unwrap().as_str())
        }

        /// Takes a piece of an upload; the file is there once the last has come.
        fn piece(&self, session: &str, asked: &Asked, more: u16) -> Answer {
            let range = asked
                .headers
                .get("content-range")
                .cloned()
                .unwrap_or_default();
            let total: usize = range
                .rsplit_once('/')
                .and_then(|(_, total)| total.parse().ok())
                .unwrap_or(0);
            let mut sessions = self.sessions.lock().unwrap();
            let Some((parent, name, bytes)) = sessions.get_mut(session) else {
                return json(404, serde_json::json!({}));
            };
            bytes.extend_from_slice(&asked.body);
            if bytes.len() < total {
                return (more, vec![], vec![]);
            }
            let kept = Kept {
                id: self.id(),
                parent: parent.clone(),
                name: name.clone(),
                bytes: bytes.clone(),
                folder: false,
            };
            sessions.remove(session);
            let mut files = self.files.lock().unwrap();
            files.retain(|file| !(file.parent == kept.parent && file.name == kept.name));
            files.push(kept);
            json(201, serde_json::json!({}))
        }

        /// Microsoft Graph's app folder, under `/onedrive`: a folder per game, by name.
        pub fn onedrive(&self, asked: &Asked, base: &str) -> Answer {
            let path = asked.path().trim_start_matches("/onedrive");
            if path == "/common/oauth2/v2.0/token" {
                return self.token_answer(asked, false);
            }
            if let Some(session) = path.strip_prefix("/session/") {
                return self.piece(session, asked, 202);
            }
            if !self.signed(asked) {
                return json(
                    401,
                    serde_json::json!({ "error": { "code": "InvalidAuthenticationToken" } }),
                );
            }
            let Some(rest) = path.strip_prefix("/v1.0/me/drive/special/approot:/") else {
                return json(404, serde_json::json!({}));
            };
            let rest = rest.replace(':', "");
            let files = self.files.lock().unwrap().clone();
            if let Some(entry) = rest.strip_suffix("/children") {
                let in_it: Vec<serde_json::Value> = files
                    .iter()
                    .filter(|file| file.parent == entry)
                    .map(|file| serde_json::json!({ "name": file.name, "size": file.bytes.len(), "file": {} }))
                    .collect();
                if in_it.is_empty() {
                    return json(
                        404,
                        serde_json::json!({ "error": { "code": "itemNotFound" } }),
                    );
                }
                return json(200, serde_json::json!({ "value": in_it }));
            }
            if let Some(at) = rest.strip_suffix("/createUploadSession") {
                let (entry, name) = at.split_once('/').unwrap();
                let session = self.id();
                self.sessions
                    .lock()
                    .unwrap()
                    .insert(session.clone(), (entry.into(), name.into(), Vec::new()));
                return json(
                    200,
                    serde_json::json!({ "uploadUrl": format!("{base}/onedrive/session/{session}") }),
                );
            }
            let (at, content) = match rest.strip_suffix("/content") {
                Some(at) => (at.to_string(), true),
                None => (rest.clone(), false),
            };
            let (entry, name) = at.split_once('/').unwrap_or(("", ""));
            let found = files
                .iter()
                .find(|file| file.parent == entry && file.name == name);
            match (asked.method.as_str(), content, found) {
                ("GET", true, Some(file)) => (200, vec![], file.bytes.clone()),
                ("DELETE", false, Some(file)) => {
                    let id = file.id.clone();
                    self.files.lock().unwrap().retain(|each| each.id != id);
                    (204, vec![], vec![])
                }
                _ => json(
                    404,
                    serde_json::json!({ "error": { "code": "itemNotFound" } }),
                ),
            }
        }

        /// Google Drive's v3 API, under `/google-drive`: folders by id, files only Shelf made.
        pub fn google(&self, asked: &Asked, base: &str) -> Answer {
            let path = asked.path().trim_start_matches("/google-drive");
            match path {
                "/token" => return self.token_answer(asked, true),
                "/revoke" => {
                    self.revoked
                        .lock()
                        .unwrap()
                        .push(asked.form().get("token").cloned().unwrap_or_default());
                    return (200, vec![], vec![]);
                }
                _ => {}
            }
            if let Some(session) = path.strip_prefix("/session/") {
                return self.piece(session, asked, 308);
            }
            if !self.signed(asked) {
                return json(401, serde_json::json!({ "error": { "code": 401 } }));
            }
            let body: serde_json::Value = serde_json::from_slice(&asked.body).unwrap_or_default();
            match (asked.method.as_str(), path) {
                ("GET", "/drive/v3/files") => {
                    let q = asked.query().get("q").cloned().unwrap_or_default();
                    let quoted: Vec<&str> = q.split('\'').skip(1).step_by(2).collect();
                    let files = self.files.lock().unwrap().clone();
                    let found: Vec<serde_json::Value> = if q.starts_with("name = ") {
                        // A folder by name in a parent.
                        files
                            .iter()
                            .filter(|file| {
                                file.folder && file.name == quoted[0] && file.parent == quoted[1]
                            })
                            .map(|file| serde_json::json!({ "id": file.id }))
                            .collect()
                    } else {
                        files
                            .iter()
                            .filter(|file| !file.folder && file.parent == quoted[0])
                            .map(|file| serde_json::json!({ "id": file.id, "name": file.name, "size": file.bytes.len().to_string() }))
                            .collect()
                    };
                    json(200, serde_json::json!({ "files": found }))
                }
                ("POST", "/drive/v3/files") => {
                    let id = self.id();
                    self.files.lock().unwrap().push(Kept {
                        id: id.clone(),
                        parent: body["parents"][0].as_str().unwrap_or("").into(),
                        name: body["name"].as_str().unwrap_or("").into(),
                        bytes: Vec::new(),
                        folder: true,
                    });
                    json(200, serde_json::json!({ "id": id }))
                }
                ("POST", "/upload/drive/v3/files") => {
                    let session = self.id();
                    self.sessions.lock().unwrap().insert(
                        session.clone(),
                        (
                            body["parents"][0].as_str().unwrap_or("").into(),
                            body["name"].as_str().unwrap_or("").into(),
                            Vec::new(),
                        ),
                    );
                    (
                        200,
                        vec![(
                            "Location".into(),
                            format!("{base}/google-drive/session/{session}"),
                        )],
                        vec![],
                    )
                }
                (method, at) if at.starts_with("/drive/v3/files/") => {
                    let id = at.trim_start_matches("/drive/v3/files/");
                    let files = self.files.lock().unwrap().clone();
                    match (method, files.iter().find(|file| file.id == id)) {
                        ("GET", Some(file)) => (200, vec![], file.bytes.clone()),
                        ("DELETE", Some(_)) => {
                            self.files.lock().unwrap().retain(|file| file.id != id);
                            (204, vec![], vec![])
                        }
                        _ => json(404, serde_json::json!({})),
                    }
                }
                _ => json(404, serde_json::json!({})),
            }
        }
    }

    /// The stand-in for both, and its two accounts.
    pub fn both() -> (String, Arc<Account>, Arc<Account>) {
        let onedrive = Arc::new(Account::default());
        let google = Arc::new(Account::default());
        let (one, two) = (onedrive.clone(), google.clone());
        let base = serve(move |asked, base| {
            if asked.target.starts_with("/onedrive") {
                one.onedrive(asked, base)
            } else {
                two.google(asked, base)
            }
        });
        (base, onedrive, google)
    }

    /// A browser that signs in at once: it takes the page's address and goes back to Shelf with a code,
    /// keeping the challenge for the token address to check.
    pub fn browser(account: Arc<Account>) -> impl FnOnce(&str) -> bool {
        move |address: &str| {
            let url = url::Url::parse(address).unwrap();
            let query: HashMap<String, String> = url
                .query_pairs()
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            *account.challenge.lock().unwrap() = query.get("code_challenge").cloned();
            let back = url::Url::parse(&query["redirect_uri"]).unwrap();
            let port = back.port().unwrap();
            let state = query["state"].clone();
            std::thread::spawn(move || {
                let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
                let _ = stream.write_all(
                    format!(
                        "GET /?code=made-up-code&state={state} HTTP/1.1\r\nHost: localhost\r\n\r\n"
                    )
                    .as_bytes(),
                );
                let mut page = String::new();
                let _ = stream.read_to_string(&mut page);
            });
            true
        }
    }
}

#[cfg(test)]
mod tests {
    use super::double::*;
    use super::*;
    use crate::saves::paths::tests::folder;
    use crate::saves::remote::Mirror;
    use crate::vault::Memory;

    fn signed_in(
        service: Service,
        base: &str,
        account: &Arc<Account>,
        vault: Arc<Memory>,
    ) -> Cloud {
        let secret = (service == Service::GoogleDrive).then(|| "made-up-secret".to_string());
        let cloud = Cloud::with(
            service,
            Some(setup_with(
                service,
                "made-up-client".into(),
                secret,
                Some(base),
            )),
            Box::new(vault),
            "0.0.0",
        );
        let named =
            tauri::async_runtime::block_on(cloud.sign_in(browser(account.clone()))).unwrap();
        assert_eq!(named, "someone@example.com");
        cloud
    }

    fn round_trip(service: Service) {
        let (base, onedrive, google) = both();
        let account = if service == Service::OneDrive {
            onedrive
        } else {
            google
        };
        let vault = Arc::new(Memory::default());
        let cloud = signed_in(service, &base, &account, vault.clone());
        assert_eq!(cloud.account().as_deref(), Some("someone@example.com"));
        // Kept in the vault, never with a password.
        assert!(
            vault
                .0
                .lock()
                .unwrap()
                .as_deref()
                .unwrap()
                .contains("refresh-1")
        );

        let root = folder(&format!("cloud-{}", service.key()));
        // Large enough to go in three pieces.
        let big: Vec<u8> = (0..3_000_000u32).map(|at| (at % 251) as u8).collect();
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("big.zip"), &big).unwrap();
        fs::write(root.join("small.json"), b"{}").unwrap();
        cloud
            .upload("entry-1", "big.zip", &root.join("big.zip"))
            .unwrap();
        cloud
            .upload("entry-1", "small.json", &root.join("small.json"))
            .unwrap();
        assert_eq!(account.names(), ["big.zip", "small.json"]);
        let files = cloud.files("entry-1").unwrap();
        let file = files.iter().find(|file| file.name == "big.zip").unwrap();
        assert_eq!(file.size, big.len() as u64);
        cloud
            .download("entry-1", file, &root.join("back.zip"))
            .unwrap();
        assert_eq!(fs::read(root.join("back.zip")).unwrap(), big);
        // The token is refused: refreshed once, and asked again.
        let refreshed = |account: &Account| *account.refreshed.lock().unwrap();
        *account.access.lock().unwrap() = "taken-back".into();
        assert_eq!(cloud.files("entry-1").unwrap().len(), 2);
        assert_eq!(refreshed(&account), 1);
        // A token past its time is refreshed before it is used.
        {
            let mut tokens = cloud.tokens.lock().unwrap();
            tokens.as_mut().unwrap().ends_at = 0;
        }
        assert_eq!(cloud.files("entry-1").unwrap().len(), 2);
        assert_eq!(refreshed(&account), 2);
        let small = cloud
            .files("entry-1")
            .unwrap()
            .into_iter()
            .find(|file| file.name == "small.json")
            .unwrap();
        cloud.delete("entry-1", &small).unwrap();
        assert_eq!(account.names(), ["big.zip"]);
        assert!(cloud.files("entry-2").unwrap().is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn onedrive_signs_in_with_pkce_and_reads_writes_and_deletes_in_its_app_folder() {
        round_trip(Service::OneDrive);
    }

    #[test]
    fn google_drive_signs_in_with_pkce_and_reads_writes_and_deletes_what_shelf_made() {
        round_trip(Service::GoogleDrive);
    }

    #[test]
    fn a_snapshot_goes_through_google_drive_into_a_folder_of_its_game() {
        let (base, _, google) = both();
        let cloud = signed_in(
            Service::GoogleDrive,
            &base,
            &google,
            Arc::new(Memory::default()),
        );
        let root = folder("cloud-mirror");
        let made = root.join("made");
        fs::create_dir_all(&made).unwrap();
        fs::write(made.join("x.zip"), b"zip").unwrap();
        cloud
            .upload("entry-1", "x.zip", &made.join("x.zip"))
            .unwrap();
        cloud
            .upload("entry-2", "x.zip", &made.join("x.zip"))
            .unwrap();
        let files = google.files.lock().unwrap().clone();
        let folders: Vec<&Kept> = files.iter().filter(|file| file.folder).collect();
        // `Shelf saves`, in My Drive, and one folder for each game in it.
        assert_eq!(folders.len(), 3);
        let shelf = folders
            .iter()
            .find(|file| file.name == "Shelf saves")
            .unwrap();
        assert_eq!(shelf.parent, "root");
        assert!(
            folders
                .iter()
                .any(|file| file.name == "entry-1" && file.parent == shelf.id)
        );
        let mirror = Mirror {
            remote: &cloud,
            cache: root.join("cache"),
        };
        assert!(mirror.lists("entry-1").unwrap().is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn signing_out_ends_the_sign_in_where_it_can_and_forgets_it_here() {
        let (base, onedrive, google) = both();
        let vault = Arc::new(Memory::default());
        let cloud = signed_in(Service::GoogleDrive, &base, &google, vault.clone());
        tauri::async_runtime::block_on(cloud.sign_out());
        assert_eq!(google.revoked.lock().unwrap().as_slice(), ["refresh-1"]);
        assert_eq!(cloud.account(), None);
        assert!(vault.0.lock().unwrap().is_none());
        assert_eq!(cloud.files("entry-1"), Err(Away::SignedOut));
        // Microsoft has no address for it: it is forgotten here.
        let cloud = signed_in(
            Service::OneDrive,
            &base,
            &onedrive,
            Arc::new(Memory::default()),
        );
        tauri::async_runtime::block_on(cloud.sign_out());
        assert_eq!(cloud.account(), None);
    }

    #[test]
    fn a_build_without_a_registration_offers_no_sign_in() {
        let cloud = Cloud::with(
            Service::OneDrive,
            None,
            Box::new(Arc::new(Memory::default())),
            "0.0.0",
        );
        assert!(!cloud.available());
        assert_eq!(
            tauri::async_runtime::block_on(cloud.sign_in(|_| true)),
            Err(Ended::Unavailable)
        );
    }

    #[test]
    fn a_service_s_refusals_are_what_waits_for() {
        assert_eq!(away_of(StatusCode::UNAUTHORIZED, b""), Away::SignedOut);
        assert_eq!(away_of(StatusCode::INSUFFICIENT_STORAGE, b""), Away::Full);
        assert_eq!(
            away_of(
                StatusCode::FORBIDDEN,
                br#"{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}"#
            ),
            Away::Full
        );
        assert_eq!(
            away_of(StatusCode::SERVICE_UNAVAILABLE, b""),
            Away::Unreachable
        );
        assert_eq!(Service::of("google-drive"), Some(Service::GoogleDrive));
        assert_eq!(Service::of("dropbox"), None);
    }
}
