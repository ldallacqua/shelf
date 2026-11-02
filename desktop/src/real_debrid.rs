//! Real-Debrid (ADR 007, phase 3), the only code that knows its addresses. It runs on this computer
//! because its terms keep it off a server. Signing in is its device code, with the client id it offers
//! open-source apps, never its private token. What that gives is kept in Windows' Credential Manager and
//! never reaches a page: `Account` is all a page is told.

use std::sync::Mutex;
use std::time::Duration;

use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::commands::now;

const API: &str = "https://api.real-debrid.com";
/// The id Real-Debrid offers open-source apps, public by its nature.
const OPEN_SOURCE_CLIENT: &str = "X245A4XAIBGVM";
const DEVICE_GRANT: &str = "http://oauth.net/grant_type/device/1.0";
const SIGN_IN_PAGE: &str = "https://real-debrid.com/device";
const SIGN_IN_HOST: &str = "real-debrid.com";
/// A token this close to its end is refreshed first.
const ENDS_SOON_MS: u64 = 60_000;

/// Where the API is: a development build can be pointed at `pnpm desktop:check`'s stand-in.
fn base() -> String {
    #[cfg(debug_assertions)]
    if let Ok(base) = std::env::var("SHELF_REAL_DEBRID") {
        return base;
    }
    API.to_string()
}

/// What can go wrong with Real-Debrid, in the words the download's card has a sentence for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trouble {
    SignedOut,
    NotPremium,
    /// Its filters won't have this one.
    Blocked,
    /// It doesn't open this host, or can't now.
    Host,
    /// The file is no longer there.
    Gone,
    /// Too much just now: its limits, or its service.
    Busy,
    /// It said no, for another reason.
    Declined,
    /// It didn't answer.
    Network,
}

/// Its documented error codes, then the HTTP status where a body says nothing.
fn trouble_of(status: StatusCode, body: &[u8]) -> Trouble {
    #[derive(Deserialize)]
    struct Said {
        error_code: Option<i64>,
    }
    let code = serde_json::from_slice::<Said>(body)
        .ok()
        .and_then(|said| said.error_code);
    match code {
        Some(8) => Trouble::SignedOut,
        Some(20) => Trouble::NotPremium,
        Some(28 | 35) => Trouble::Blocked,
        Some(16..=19) => Trouble::Host,
        Some(7 | 24) => Trouble::Gone,
        Some(5 | 21 | 23 | 25 | 34 | 36) => Trouble::Busy,
        Some(_) => Trouble::Declined,
        None => match status.as_u16() {
            401 => Trouble::SignedOut,
            404 => Trouble::Gone,
            429 => Trouble::Busy,
            500.. => Trouble::Network,
            _ => Trouble::Declined,
        },
    }
}

/// Where the sign-in is kept. Windows' Credential Manager, or in a development build run with a profile
/// of its own, a file there, so `pnpm desktop:check` never touches the real one.
pub trait Vault: Send + Sync {
    fn load(&self) -> Option<String>;
    fn save(&self, text: &str) -> bool;
    fn clear(&self);
}

#[cfg(windows)]
pub struct CredentialManager;

#[cfg(windows)]
impl CredentialManager {
    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new("com.ldallacqua.shelf", "real-debrid").ok()
    }
}

#[cfg(windows)]
impl Vault for CredentialManager {
    fn load(&self) -> Option<String> {
        Self::entry()?.get_password().ok()
    }
    fn save(&self, text: &str) -> bool {
        Self::entry().is_some_and(|entry| entry.set_password(text).is_ok())
    }
    fn clear(&self) {
        if let Some(entry) = Self::entry() {
            let _ = entry.delete_credential();
        }
    }
}

#[cfg(debug_assertions)]
pub struct FileVault(pub std::path::PathBuf);

#[cfg(debug_assertions)]
impl Vault for FileVault {
    fn load(&self) -> Option<String> {
        std::fs::read_to_string(&self.0).ok()
    }
    fn save(&self, text: &str) -> bool {
        std::fs::write(&self.0, text).is_ok()
    }
    fn clear(&self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// What a sign-in gives, which stays on this side.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Tokens {
    client_id: String,
    client_secret: String,
    access: String,
    refresh: String,
    /// When `access` ends, in milliseconds since 1970.
    ends_at: u64,
    username: String,
    premium: bool,
    until: Option<String>,
}

/// A sign-in under way.
#[derive(Clone)]
struct Waiting {
    device_code: String,
    user_code: String,
    url: String,
}

/// All a page is told about Real-Debrid.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum Account {
    Out,
    Waiting {
        code: String,
        url: String,
    },
    In {
        username: String,
        premium: bool,
        until: Option<String>,
    },
}

#[derive(Deserialize)]
struct DeviceCode {
    device_code: String,
    user_code: String,
    interval: Option<u64>,
    expires_in: Option<u64>,
    verification_url: Option<String>,
}

#[derive(Deserialize)]
struct Credentials {
    client_id: String,
    client_secret: String,
}

#[derive(Deserialize)]
struct TokenAnswer {
    access_token: String,
    refresh_token: String,
    expires_in: u64,
}

#[derive(Deserialize)]
struct User {
    username: String,
    #[serde(rename = "type")]
    kind: Option<String>,
    expiration: Option<String>,
}

/// A link Real-Debrid has opened.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct Unrestricted {
    pub filename: String,
    pub filesize: Option<u64>,
    pub download: String,
}

#[derive(Clone, Debug, Deserialize)]
pub struct TorrentFile {
    pub path: String,
    pub bytes: u64,
    pub selected: u8,
}

/// A torrent on its servers.
#[derive(Clone, Debug, Deserialize)]
pub struct Torrent {
    pub status: String,
    #[serde(default)]
    pub progress: f64,
    #[serde(default)]
    pub links: Vec<String>,
    #[serde(default)]
    pub files: Vec<TorrentFile>,
}

pub struct RealDebrid {
    base: String,
    client: Client,
    vault: Box<dyn Vault>,
    tokens: Mutex<Option<Tokens>>,
    waiting: Mutex<Option<Waiting>>,
    refreshing: tokio::sync::Mutex<()>,
}

impl RealDebrid {
    pub fn open(vault: Box<dyn Vault>, version: &str) -> reqwest::Result<Self> {
        Self::at(base(), vault, version)
    }

    fn at(base: String, vault: Box<dyn Vault>, version: &str) -> reqwest::Result<Self> {
        let client = Client::builder()
            .user_agent(format!("Shelf/{version}"))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30))
            .build()?;
        let tokens = vault
            .load()
            .and_then(|text| serde_json::from_str(&text).ok());
        Ok(RealDebrid {
            base,
            client,
            vault,
            tokens: Mutex::new(tokens),
            waiting: Mutex::new(None),
            refreshing: tokio::sync::Mutex::new(()),
        })
    }

    pub fn signed_in(&self) -> bool {
        self.tokens.lock().unwrap().is_some()
    }

    fn oauth(&self, path: &str, query: &[(&str, &str)]) -> Option<Url> {
        let mut url = Url::parse(&format!("{}/oauth/v2/{path}", self.base)).ok()?;
        url.query_pairs_mut().extend_pairs(query);
        Some(url)
    }

    /// What is known of the account, freshly asked if it can be.
    pub async fn account(&self) -> Account {
        if let Some(waiting) = self.waiting.lock().unwrap().as_ref() {
            return Account::Waiting {
                code: waiting.user_code.clone(),
                url: waiting.url.clone(),
            };
        }
        if self.signed_in()
            && let Ok(user) = self.user().await
        {
            let mut tokens = self.tokens.lock().unwrap();
            if let Some(held) = tokens.as_mut() {
                held.username = user.username;
                held.premium = user.kind.as_deref() == Some("premium");
                held.until = user.expiration;
                self.vault
                    .save(&serde_json::to_string(&*held).unwrap_or_default());
            }
        }
        match self.tokens.lock().unwrap().as_ref() {
            Some(held) => Account::In {
                username: held.username.clone(),
                premium: held.premium,
                until: held.until.clone(),
            },
            None => Account::Out,
        }
    }

    /// Asks for a code for the person to enter on Real-Debrid's own page, and waits on its answer on a
    /// task of its own: the page only asks how that is going.
    pub async fn begin_sign_in(self: std::sync::Arc<Self>) -> Result<Account, Trouble> {
        let url = self
            .oauth(
                "device/code",
                &[
                    ("client_id", OPEN_SOURCE_CLIENT),
                    ("new_credentials", "yes"),
                ],
            )
            .ok_or(Trouble::Declined)?;
        let answer = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| Trouble::Network)?;
        let status = answer.status();
        let body = answer.bytes().await.map_err(|_| Trouble::Network)?;
        if !status.is_success() {
            return Err(trouble_of(status, &body));
        }
        let code: DeviceCode = serde_json::from_slice(&body).map_err(|_| Trouble::Network)?;
        let waiting = Waiting {
            device_code: code.device_code,
            user_code: code.user_code,
            url: sign_in_page(code.verification_url.as_deref()),
        };
        let account = Account::Waiting {
            code: waiting.user_code.clone(),
            url: waiting.url.clone(),
        };
        *self.waiting.lock().unwrap() = Some(waiting.clone());
        let every = Duration::from_secs(code.interval.unwrap_or(5).max(1));
        let lasts = Duration::from_secs(code.expires_in.unwrap_or(1800));
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            me.wait_for_sign_in(waiting.device_code, every, lasts).await;
        });
        Ok(account)
    }

    /// Asks every few seconds until the person has entered the code, it runs out, or Cancel.
    async fn wait_for_sign_in(&self, device_code: String, every: Duration, lasts: Duration) {
        let deadline = std::time::Instant::now() + lasts;
        loop {
            tokio::time::sleep(every).await;
            let current = self
                .waiting
                .lock()
                .unwrap()
                .as_ref()
                .is_some_and(|waiting| waiting.device_code == device_code);
            if !current {
                return;
            }
            if std::time::Instant::now() >= deadline {
                *self.waiting.lock().unwrap() = None;
                return;
            }
            if self.finish_sign_in(&device_code).await.is_ok() {
                *self.waiting.lock().unwrap() = None;
                return;
            }
        }
    }

    /// Errors until the person has entered the code.
    async fn finish_sign_in(&self, device_code: &str) -> Result<(), Trouble> {
        let url = self
            .oauth(
                "device/credentials",
                &[("client_id", OPEN_SOURCE_CLIENT), ("code", device_code)],
            )
            .ok_or(Trouble::Declined)?;
        let answer = self
            .client
            .get(url)
            .send()
            .await
            .map_err(|_| Trouble::Network)?;
        if !answer.status().is_success() {
            return Err(Trouble::Declined);
        }
        let body = answer.bytes().await.map_err(|_| Trouble::Network)?;
        let credentials: Credentials =
            serde_json::from_slice(&body).map_err(|_| Trouble::Network)?;
        let token = self
            .token(
                &credentials.client_id,
                &credentials.client_secret,
                device_code,
            )
            .await?;
        let held = Tokens {
            client_id: credentials.client_id,
            client_secret: credentials.client_secret,
            access: token.access_token,
            refresh: token.refresh_token,
            ends_at: now() + token.expires_in * 1000,
            username: String::new(),
            premium: false,
            until: None,
        };
        self.keep(held);
        let user = self.user().await;
        // Copied out first: `keep` takes this same lock, which an `if let` here would still hold.
        let held = self.tokens.lock().unwrap().clone();
        if let (Ok(user), Some(held)) = (user, held) {
            self.keep(Tokens {
                username: user.username,
                premium: user.kind.as_deref() == Some("premium"),
                until: user.expiration,
                ..held
            });
        }
        Ok(())
    }

    fn keep(&self, held: Tokens) {
        self.vault
            .save(&serde_json::to_string(&held).unwrap_or_default());
        *self.tokens.lock().unwrap() = Some(held);
    }

    fn forget(&self) {
        self.vault.clear();
        *self.tokens.lock().unwrap() = None;
    }

    async fn token(
        &self,
        client_id: &str,
        client_secret: &str,
        code: &str,
    ) -> Result<TokenAnswer, Trouble> {
        let url = self.oauth("token", &[]).ok_or(Trouble::Declined)?;
        let answer = self
            .client
            .post(url)
            .header(
                reqwest::header::CONTENT_TYPE,
                "application/x-www-form-urlencoded",
            )
            .body(form(&[
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("code", code),
                ("grant_type", DEVICE_GRANT),
            ]))
            .send()
            .await
            .map_err(|_| Trouble::Network)?;
        let status = answer.status();
        let body = answer.bytes().await.map_err(|_| Trouble::Network)?;
        if !status.is_success() {
            return Err(trouble_of(status, &body));
        }
        serde_json::from_slice(&body).map_err(|_| Trouble::Network)
    }

    /// Stops waiting for a code to be entered.
    pub fn cancel_sign_in(&self) {
        *self.waiting.lock().unwrap() = None;
    }

    /// Ends the token at Real-Debrid if it answers, and forgets it here whether or not it does.
    pub async fn sign_out(&self) {
        self.cancel_sign_in();
        let _ = self.ask(Method::GET, "disable_access_token", None).await;
        self.forget();
    }

    /// A token that is good now, refreshed if it is ending or `stale`. Only a refusal signs out: without a
    /// connection, the sign-in is kept.
    async fn access(&self, stale: Option<&str>) -> Result<String, Trouble> {
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
        let Some((token, _)) = good(self) else {
            return Err(Trouble::SignedOut);
        };
        if let Some(token) = token {
            return Ok(token);
        }
        let _one_at_a_time = self.refreshing.lock().await;
        // Another may have refreshed it while this one waited.
        let Some((token, held)) = good(self) else {
            return Err(Trouble::SignedOut);
        };
        if let Some(token) = token {
            return Ok(token);
        }
        match self
            .token(&held.client_id, &held.client_secret, &held.refresh)
            .await
        {
            Ok(answer) => {
                let access = answer.access_token.clone();
                self.keep(Tokens {
                    access: answer.access_token,
                    refresh: answer.refresh_token,
                    ends_at: now() + answer.expires_in * 1000,
                    ..held
                });
                Ok(access)
            }
            Err(Trouble::Network) => Err(Trouble::Network),
            Err(_) => {
                self.forget();
                Err(Trouble::SignedOut)
            }
        }
    }

    /// A call to the API, with the token, refreshing it once if it is refused.
    async fn ask(
        &self,
        method: Method,
        path: &str,
        body: Option<String>,
    ) -> Result<Vec<u8>, Trouble> {
        let url = format!("{}/rest/1.0/{path}", self.base);
        let mut token = self.access(None).await?;
        let mut again = true;
        loop {
            let mut request = self
                .client
                .request(method.clone(), &url)
                .bearer_auth(&token);
            if let Some(body) = &body {
                request = request
                    .header(
                        reqwest::header::CONTENT_TYPE,
                        "application/x-www-form-urlencoded",
                    )
                    .body(body.clone());
            }
            let answer = request.send().await.map_err(|_| Trouble::Network)?;
            let status = answer.status();
            let bytes = answer.bytes().await.map_err(|_| Trouble::Network)?;
            if status.is_success() {
                return Ok(bytes.to_vec());
            }
            let trouble = trouble_of(status, &bytes);
            if trouble == Trouble::SignedOut && again {
                again = false;
                token = self.access(Some(&token)).await?;
                continue;
            }
            return Err(trouble);
        }
    }

    async fn user(&self) -> Result<User, Trouble> {
        let body = self.ask(Method::GET, "user", None).await?;
        serde_json::from_slice(&body).map_err(|_| Trouble::Network)
    }

    /// A link to a file, from a host's link or one of a torrent's. It doesn't last, so it is asked for
    /// just before it is used.
    pub async fn unrestrict(&self, link: &str) -> Result<Unrestricted, Trouble> {
        let body = self
            .ask(
                Method::POST,
                "unrestrict/link",
                Some(form(&[("link", link)])),
            )
            .await?;
        serde_json::from_slice(&body).map_err(|_| Trouble::Network)
    }

    /// The account's torrent with this hash, if it has one: adding it twice takes a second place.
    pub async fn torrent_with_hash(&self, hash: &str) -> Result<Option<String>, Trouble> {
        #[derive(Deserialize)]
        struct Row {
            id: String,
            hash: String,
        }
        let body = self.ask(Method::GET, "torrents?limit=1000", None).await?;
        // An account with no torrents answers with nothing at all.
        if body.is_empty() {
            return Ok(None);
        }
        let rows: Vec<Row> = serde_json::from_slice(&body).map_err(|_| Trouble::Network)?;
        Ok(rows
            .into_iter()
            .find(|row| row.hash.eq_ignore_ascii_case(hash))
            .map(|row| row.id))
    }

    pub async fn add_magnet(&self, magnet: &str) -> Result<String, Trouble> {
        #[derive(Deserialize)]
        struct Added {
            id: String,
        }
        let body = self
            .ask(
                Method::POST,
                "torrents/addMagnet",
                Some(form(&[("magnet", magnet)])),
            )
            .await?;
        let added: Added = serde_json::from_slice(&body).map_err(|_| Trouble::Network)?;
        Ok(added.id)
    }

    pub async fn torrent(&self, id: &str) -> Result<Torrent, Trouble> {
        let body = self
            .ask(Method::GET, &format!("torrents/info/{id}"), None)
            .await?;
        serde_json::from_slice(&body).map_err(|_| Trouble::Network)
    }

    /// Every file: a game's come as a set, and Real-Debrid starts nothing until this is said.
    pub async fn select_all(&self, id: &str) -> Result<(), Trouble> {
        self.ask(
            Method::POST,
            &format!("torrents/selectFiles/{id}"),
            Some(form(&[("files", "all")])),
        )
        .await
        .map(|_| ())
    }

    pub async fn delete_torrent(&self, id: &str) {
        let _ = self
            .ask(Method::DELETE, &format!("torrents/delete/{id}"), None)
            .await;
    }
}

fn form(pairs: &[(&str, &str)]) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .extend_pairs(pairs)
        .finish()
}

/// Where to send the person: what the API says if it is Real-Debrid's own site, since this becomes a
/// link on a page, and otherwise the page it documents.
fn sign_in_page(said: Option<&str>) -> String {
    said.and_then(|text| Url::parse(text).ok())
        .filter(|url| url.scheme() == "https" && url.host_str() == Some(SIGN_IN_HOST))
        .map_or_else(|| SIGN_IN_PAGE.to_string(), |url| url.to_string())
}

/// A magnet's hash, in lower case, if it names one.
pub fn hash_of(magnet: &str) -> Option<String> {
    Url::parse(magnet)
        .ok()?
        .query_pairs()
        .find_map(|(key, value)| {
            (key == "xt")
                .then(|| value.strip_prefix("urn:btih:").map(str::to_ascii_lowercase))
                .flatten()
        })
}

#[cfg(test)]
pub mod double {
    //! A stand-in for Real-Debrid on this computer: tests never talk to the real one.
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::Arc;

    pub struct Memory(pub Mutex<Option<String>>);

    impl Vault for Arc<Memory> {
        fn load(&self) -> Option<String> {
            self.0.lock().unwrap().clone()
        }
        fn save(&self, text: &str) -> bool {
            *self.0.lock().unwrap() = Some(text.to_string());
            true
        }
        fn clear(&self) {
            *self.0.lock().unwrap() = None;
        }
    }

    pub fn memory(text: Option<&str>) -> Arc<Memory> {
        Arc::new(Memory(Mutex::new(text.map(str::to_string))))
    }

    /// A request as a handler sees it: `GET /rest/1.0/user`, what it carried, and its token.
    pub struct Asked {
        pub line: String,
        pub body: String,
        pub token: Option<String>,
    }

    pub fn answer(status: &str, body: &str) -> Vec<u8> {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        )
        .into_bytes()
    }

    /// Answers every request with `handler`, for as long as the test runs.
    pub fn serve(handler: impl Fn(&Asked) -> Vec<u8> + Send + 'static) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { return };
                let mut buffer = vec![0; 16 * 1024];
                let Ok(size) = stream.read(&mut buffer) else {
                    continue;
                };
                let text = String::from_utf8_lossy(&buffer[..size]).into_owned();
                let (head, body) = text.split_once("\r\n\r\n").unwrap_or((&text, ""));
                let mut lines = head.lines();
                let first = lines.next().unwrap_or("");
                let line = first.rsplit_once(' ').map_or(first, |(start, _)| start);
                let token = lines.find_map(|each| {
                    each.to_ascii_lowercase()
                        .starts_with("authorization: bearer ")
                        .then(|| each["authorization: bearer ".len()..].to_string())
                });
                let asked = Asked {
                    line: line.to_string(),
                    body: body.to_string(),
                    token,
                };
                let _ = stream.write_all(&handler(&asked));
            }
        });
        address
    }

    pub fn signed_in_tokens(ends_at: u64) -> String {
        serde_json::to_string(&Tokens {
            client_id: "made-up-client".into(),
            client_secret: "made-up-secret".into(),
            access: "made-up-access".into(),
            refresh: "made-up-refresh".into(),
            ends_at,
            username: "made-up".into(),
            premium: true,
            until: None,
        })
        .unwrap()
    }

    pub fn at(address: String, vault: Arc<Memory>) -> Arc<RealDebrid> {
        Arc::new(RealDebrid::at(address, Box::new(vault), "0.0.0").unwrap())
    }
}

#[cfg(test)]
mod tests {
    use super::double::*;
    use super::*;
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Instant;

    const FAR_OFF: u64 = u64::MAX / 2;

    fn block<T>(work: impl Future<Output = T>) -> T {
        tauri::async_runtime::block_on(work)
    }

    fn in_with(handler: impl Fn(&Asked) -> Vec<u8> + Send + 'static) -> Arc<RealDebrid> {
        at(serve(handler), memory(Some(&signed_in_tokens(FAR_OFF))))
    }

    #[test]
    fn reads_its_errors() {
        let said = |code: i64| {
            trouble_of(
                StatusCode::FORBIDDEN,
                format!(r#"{{"error":"x","error_code":{code}}}"#).as_bytes(),
            )
        };
        assert_eq!(said(8), Trouble::SignedOut);
        assert_eq!(said(20), Trouble::NotPremium);
        assert_eq!(said(35), Trouble::Blocked);
        assert_eq!(said(16), Trouble::Host);
        assert_eq!(said(19), Trouble::Host);
        assert_eq!(said(24), Trouble::Gone);
        assert_eq!(said(23), Trouble::Busy);
        assert_eq!(said(34), Trouble::Busy);
        assert_eq!(said(14), Trouble::Declined);
        assert_eq!(
            trouble_of(StatusCode::TOO_MANY_REQUESTS, b""),
            Trouble::Busy
        );
        assert_eq!(
            trouble_of(StatusCode::BAD_GATEWAY, b"<html>"),
            Trouble::Network
        );
        assert_eq!(trouble_of(StatusCode::NOT_FOUND, b""), Trouble::Gone);
    }

    #[test]
    fn a_page_is_only_ever_sent_to_its_own_site() {
        assert_eq!(
            sign_in_page(Some("https://real-debrid.com/device")),
            "https://real-debrid.com/device"
        );
        for elsewhere in [
            Some("https://real-debrid.com.evil.example/device"),
            Some("http://real-debrid.com/device"),
            Some("javascript:alert(1)"),
            Some("not an address"),
            None,
        ] {
            assert_eq!(sign_in_page(elsewhere), SIGN_IN_PAGE, "{elsewhere:?}");
        }
    }

    #[test]
    fn reads_a_magnets_hash() {
        assert_eq!(
            hash_of("magnet:?dn=x&xt=urn:btih:ABCDEF0123").as_deref(),
            Some("abcdef0123")
        );
        assert_eq!(hash_of("magnet:?dn=x"), None);
        assert_eq!(hash_of("not a magnet"), None);
    }

    /// Answers the device flow, refusing credentials until asked `after` times.
    fn sign_in_double(after: usize) -> String {
        let asked = AtomicUsize::new(0);
        serve(move |request| {
            let line = request.line.as_str();
            if line.contains("/oauth/v2/device/code") {
                assert!(line.contains("client_id=X245A4XAIBGVM"));
                assert!(line.contains("new_credentials=yes"));
                answer(
                    "200 OK",
                    r#"{"device_code":"DEVICE","user_code":"MADE-UP","interval":1,"expires_in":60,"verification_url":"https://real-debrid.com/device"}"#,
                )
            } else if line.contains("/oauth/v2/device/credentials") {
                if asked.fetch_add(1, Ordering::Relaxed) < after {
                    answer("403 Forbidden", r#"{"error":"not yet","error_code":9}"#)
                } else {
                    answer(
                        "200 OK",
                        r#"{"client_id":"BOUND","client_secret":"SECRET"}"#,
                    )
                }
            } else if line.contains("/oauth/v2/token") {
                assert!(request.body.contains("client_id=BOUND"));
                assert!(request.body.contains("code=DEVICE"));
                assert!(request.body.contains("grant_type=http"));
                answer(
                    "200 OK",
                    r#"{"access_token":"TOKEN","refresh_token":"REFRESH","expires_in":3600,"token_type":"Bearer"}"#,
                )
            } else if line.ends_with("/rest/1.0/user") {
                assert_eq!(request.token.as_deref(), Some("TOKEN"));
                answer(
                    "200 OK",
                    r#"{"username":"made-up","type":"premium","expiration":"2027-01-01T00:00:00.000Z"}"#,
                )
            } else {
                answer("404 Not Found", "")
            }
        })
    }

    #[test]
    fn signs_in_by_a_code_and_keeps_only_what_it_gave_in_the_vault() {
        let vault = memory(None);
        let rd = at(sign_in_double(1), vault.clone());
        let first = block(rd.clone().begin_sign_in()).unwrap();
        assert_eq!(
            first,
            Account::Waiting {
                code: "MADE-UP".into(),
                url: "https://real-debrid.com/device".into()
            }
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        while !rd.signed_in() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        let deadline = Instant::now() + Duration::from_secs(10);
        while rd.waiting.lock().unwrap().is_some() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        let account = block(rd.account());
        assert_eq!(
            account,
            Account::In {
                username: "made-up".into(),
                premium: true,
                until: Some("2027-01-01T00:00:00.000Z".into())
            }
        );
        // What a page is told holds nothing of what the vault does.
        let view = serde_json::to_string(&account).unwrap();
        for secret in ["TOKEN", "REFRESH", "SECRET", "BOUND", "DEVICE"] {
            assert!(!view.contains(secret), "{secret}");
        }
        let kept = vault.load().unwrap();
        assert!(kept.contains("TOKEN") && kept.contains("REFRESH"));
    }

    #[test]
    fn stops_waiting_when_asked() {
        let rd = at(sign_in_double(usize::MAX), memory(None));
        block(rd.clone().begin_sign_in()).unwrap();
        rd.cancel_sign_in();
        assert_eq!(block(rd.account()), Account::Out);
    }

    #[test]
    fn comes_back_signed_in_from_the_vault_and_never_without_one() {
        let rd = at(
            "http://127.0.0.1:9".into(),
            memory(Some(&signed_in_tokens(FAR_OFF))),
        );
        assert!(rd.signed_in());
        let rd = at("http://127.0.0.1:9".into(), memory(Some("{ half")));
        assert!(!rd.signed_in());
        let rd = at("http://127.0.0.1:9".into(), memory(None));
        assert_eq!(
            block(rd.unrestrict("https://a.example/x")),
            Err(Trouble::SignedOut)
        );
    }

    #[test]
    fn refreshes_a_token_ending_soon() {
        let vault = memory(Some(&signed_in_tokens(0)));
        let rd = at(
            serve(|request| {
                if request.line.contains("/oauth/v2/token") {
                    assert!(request.body.contains("code=made-up-refresh"));
                    answer(
                        "200 OK",
                        r#"{"access_token":"NEW","refresh_token":"NEWER","expires_in":3600}"#,
                    )
                } else {
                    assert_eq!(request.token.as_deref(), Some("NEW"));
                    answer("200 OK", r#"{"username":"made-up"}"#)
                }
            }),
            vault.clone(),
        );
        assert!(block(rd.user()).is_ok());
        assert!(vault.load().unwrap().contains("NEWER"));
    }

    #[test]
    fn a_token_refused_is_refreshed_once() {
        let rd = in_with(|request| {
            if request.line.contains("/oauth/v2/token") {
                answer(
                    "200 OK",
                    r#"{"access_token":"NEW","refresh_token":"NEWER","expires_in":3600}"#,
                )
            } else if request.token.as_deref() == Some("NEW") {
                answer("200 OK", r#"{"username":"made-up"}"#)
            } else {
                answer(
                    "401 Unauthorized",
                    r#"{"error":"bad_token","error_code":8}"#,
                )
            }
        });
        assert!(block(rd.user()).is_ok());
    }

    #[test]
    fn a_refresh_refused_signs_out_and_says_so() {
        let vault = memory(Some(&signed_in_tokens(0)));
        let rd = at(
            serve(|_| answer("403 Forbidden", r#"{"error":"nope","error_code":9}"#)),
            vault.clone(),
        );
        assert_eq!(block(rd.user()).err(), Some(Trouble::SignedOut));
        assert!(!rd.signed_in());
        assert_eq!(vault.load(), None);
    }

    #[test]
    fn without_a_connection_the_sign_in_is_kept() {
        let vault = memory(Some(&signed_in_tokens(0)));
        let rd = at("http://127.0.0.1:9".into(), vault.clone());
        assert_eq!(block(rd.user()).err(), Some(Trouble::Network));
        assert!(rd.signed_in());
        assert!(vault.load().is_some());
    }

    #[test]
    fn signing_out_ends_the_token_and_forgets_it() {
        let ended = Arc::new(AtomicUsize::new(0));
        let seen = ended.clone();
        let vault = memory(Some(&signed_in_tokens(FAR_OFF)));
        let rd = at(
            serve(move |request| {
                if request.line.ends_with("disable_access_token") {
                    seen.fetch_add(1, Ordering::Relaxed);
                }
                answer("204 No Content", "")
            }),
            vault.clone(),
        );
        block(rd.sign_out());
        assert_eq!(ended.load(Ordering::Relaxed), 1);
        assert_eq!(block(rd.account()), Account::Out);
        assert_eq!(vault.load(), None);
    }

    #[test]
    fn opens_a_link() {
        let rd = in_with(|request| {
            assert_eq!(request.line, "POST /rest/1.0/unrestrict/link");
            assert_eq!(request.body, "link=https%3A%2F%2Fhost.example%2Fa");
            answer(
                "200 OK",
                r#"{"filename":"a.zip","filesize":5,"download":"https://dl.example/a.zip"}"#,
            )
        });
        assert_eq!(
            block(rd.unrestrict("https://host.example/a")).unwrap(),
            Unrestricted {
                filename: "a.zip".into(),
                filesize: Some(5),
                download: "https://dl.example/a.zip".into()
            }
        );
    }

    #[test]
    fn finds_a_torrent_it_already_has() {
        let rd = in_with(|_| {
            answer(
                "200 OK",
                r#"[{"id":"T1","hash":"ABC"},{"id":"T2","hash":"def"}]"#,
            )
        });
        assert_eq!(
            block(rd.torrent_with_hash("def")).unwrap().as_deref(),
            Some("T2")
        );
        assert_eq!(
            block(rd.torrent_with_hash("abc")).unwrap().as_deref(),
            Some("T1")
        );
        assert_eq!(block(rd.torrent_with_hash("zzz")).unwrap(), None);
        let rd = in_with(|_| answer("200 OK", ""));
        assert_eq!(block(rd.torrent_with_hash("def")).unwrap(), None);
    }
}
