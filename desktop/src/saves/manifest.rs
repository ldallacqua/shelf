//! Where games keep their saves: the Ludusavi manifest (ADR 008, section 3), compiled from
//! PCGamingWiki. The app reads it from its own address, with its `ETag`, when a page asks about a
//! game's saves and what it has is over a week old. Shelf ships no copy and serves none.
//!
//! The YAML is 17.7 MB (7 Nov 2026). It is read a game at a time, each top-level key on its own, so
//! reading it costs little memory, and only what Shelf uses is kept, as `save-manifest.json`.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::sources::words_in;

/// Where the manifest is published.
pub const ADDRESS: &str =
    "https://raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml";
const FILE: &str = "save-manifest.json";
/// What the app has is read again after this, when a page next asks.
const FRESH_FOR_MS: u64 = 7 * 24 * 60 * 60_000;
/// A failed reading is tried again after this, not at every page.
const RETRY_AFTER_MS: u64 = 60 * 60_000;
/// Far more than it is, and less than a mistake.
const MOST_BYTES: u64 = 128 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(120);
/// The placeholders a Windows path may start from (`paths::Token`).
const STARTS: [&str; 9] = [
    "<base>",
    "<root>",
    "<home>",
    "<winAppData>",
    "<winLocalAppData>",
    "<winLocalAppDataLow>",
    "<winDocuments>",
    "<winPublic>",
    "<winProgramData>",
];

/// A game the manifest knows saves for, as Shelf keeps it.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub title: String,
    #[serde(default)]
    pub steam: Vec<u64>,
    #[serde(default)]
    pub install_dirs: Vec<String>,
    /// Its save paths that apply to Windows, as the manifest writes them.
    #[serde(default)]
    pub files: Vec<String>,
    /// It keeps saves in the registry too, which Shelf doesn't carry yet.
    #[serde(default)]
    pub registry: bool,
    /// The stores that carry its saves themselves.
    #[serde(default)]
    pub cloud: Vec<String>,
}

/// What `save-manifest.json` holds.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Index {
    pub version: u32,
    pub etag: Option<String>,
    /// When it was last read or confirmed unchanged, in milliseconds since 1970.
    pub read_at: u64,
    pub games: Vec<Entry>,
    /// Another name for a game, and the title it stands for.
    #[serde(default)]
    pub aliases: BTreeMap<String, String>,
    /// Games the reading had to leave out, to say how much it trusts itself.
    #[serde(default)]
    pub skipped: usize,
}

#[derive(Deserialize, Default)]
struct RawGame {
    #[serde(default)]
    files: BTreeMap<String, Option<RawPath>>,
    #[serde(default, rename = "installDir")]
    install_dir: BTreeMap<String, serde::de::IgnoredAny>,
    #[serde(default)]
    registry: BTreeMap<String, Option<RawPath>>,
    steam: Option<RawSteam>,
    id: Option<RawIds>,
    alias: Option<String>,
    cloud: Option<BTreeMap<String, bool>>,
}

#[derive(Deserialize, Default)]
struct RawPath {
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    when: Vec<RawWhen>,
}

#[derive(Deserialize, Default)]
struct RawWhen {
    os: Option<String>,
}

#[derive(Deserialize)]
struct RawSteam {
    id: Option<u64>,
}

#[derive(Deserialize)]
struct RawIds {
    #[serde(default, rename = "steamExtra")]
    steam_extra: Vec<u64>,
}

impl RawPath {
    /// A save, not a setting: tagged `save`, or not tagged at all.
    fn save(&self) -> bool {
        self.tags.is_empty() || self.tags.iter().any(|tag| tag == "save")
    }

    /// On Windows, or anywhere: DOS games run there too.
    fn windows(&self) -> bool {
        self.when.is_empty()
            || self.when.iter().any(|when| {
                when.os
                    .as_deref()
                    .is_none_or(|os| os == "windows" || os == "dos")
            })
    }
}

/// The manifest's top-level keys, each with what is under it. Under a key everything is indented,
/// so a line that starts at its first column starts the next game.
fn games_in(text: &str) -> impl Iterator<Item = &str> {
    let mut starts: Vec<usize> = Vec::new();
    let mut at = 0;
    for line in text.split_inclusive('\n') {
        let first = line.chars().next();
        let starts_a_game = first.is_some_and(|c| !matches!(c, ' ' | '\t' | '#' | '\r' | '\n'))
            && !line.starts_with("---")
            && !line.starts_with("...");
        if starts_a_game {
            starts.push(at);
        }
        at += line.len();
    }
    let ends: Vec<usize> = starts.iter().skip(1).copied().chain([text.len()]).collect();
    starts
        .into_iter()
        .zip(ends)
        .map(move |(start, end)| &text[start..end])
}

/// What Shelf keeps of the manifest. A game whose YAML can't be read is left out and counted, rather
/// than losing the rest.
pub fn parse(text: &str) -> Index {
    let mut index = Index {
        version: 1,
        ..Index::default()
    };
    for game in games_in(text) {
        // Most games say nothing of their saves: they are passed over without being read.
        let worth = game.contains("\n  files:")
            || game.contains("\n  alias:")
            || game.contains("\n  registry:");
        if !worth {
            continue;
        }
        let Ok(read) = serde_yaml_ng::from_str::<BTreeMap<String, RawGame>>(game) else {
            index.skipped += 1;
            continue;
        };
        for (title, raw) in read {
            if let Some(alias) = raw.alias {
                index.aliases.insert(title, alias);
                continue;
            }
            let files: Vec<String> = raw
                .files
                .iter()
                .filter(|(path, how)| {
                    let how = how.as_ref();
                    how.is_none_or(|how| how.save() && how.windows())
                        && STARTS.iter().any(|start| path.starts_with(start))
                })
                .map(|(path, _)| path.clone())
                .collect();
            let registry = raw
                .registry
                .values()
                .any(|how| how.as_ref().is_none_or(RawPath::save));
            if files.is_empty() && !registry {
                continue;
            }
            let mut steam: Vec<u64> = raw.steam.and_then(|steam| steam.id).into_iter().collect();
            steam.extend(raw.id.map(|ids| ids.steam_extra).unwrap_or_default());
            index.games.push(Entry {
                title,
                steam,
                install_dirs: raw.install_dir.into_keys().collect(),
                files,
                registry,
                cloud: raw
                    .cloud
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|(_, carried)| *carried)
                    .map(|(store, _)| store)
                    .collect(),
            });
        }
    }
    index
}

/// A title as two spellings of one name agree: the same words, punctuation aside (no looser).
pub fn title_key(title: &str) -> String {
    words_in(title).join(" ")
}

/// What the manifest has for a game a page names.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Found {
    pub entry: Option<Entry>,
    /// Other games that answer to the same Steam app or title, for the person to choose from.
    pub others: Vec<String>,
}

/// An index ready to be asked.
pub struct Lookup {
    index: Index,
    by_steam: HashMap<u64, usize>,
    by_title: HashMap<String, Vec<usize>>,
    by_name: HashMap<String, usize>,
}

impl Lookup {
    pub fn new(index: Index) -> Self {
        let mut by_steam = HashMap::new();
        let mut by_title: HashMap<String, Vec<usize>> = HashMap::new();
        let mut by_name = HashMap::new();
        for (at, game) in index.games.iter().enumerate() {
            for id in &game.steam {
                by_steam.entry(*id).or_insert(at);
            }
            by_title.entry(title_key(&game.title)).or_default().push(at);
            by_name.insert(game.title.clone(), at);
        }
        for (alias, title) in &index.aliases {
            if let Some(&at) = by_name.get(title) {
                let found = by_title.entry(title_key(alias)).or_default();
                if !found.contains(&at) {
                    found.push(at);
                }
            }
        }
        Lookup {
            index,
            by_steam,
            by_title,
            by_name,
        }
    }

    pub fn index(&self) -> &Index {
        &self.index
    }

    /// A game by its Steam apps first, then by its title's words. `chosen`, a title the person picked
    /// before, wins over both.
    pub fn find(&self, title: &str, apps: &[String], chosen: Option<&str>) -> Found {
        let mut ats: Vec<usize> = Vec::new();
        if let Some(at) = chosen.and_then(|chosen| self.by_name.get(chosen)) {
            ats.push(*at);
        }
        for app in apps {
            if let Some(&at) = app.parse().ok().and_then(|id: u64| self.by_steam.get(&id))
                && !ats.contains(&at)
            {
                ats.push(at);
            }
        }
        for &at in self.by_title.get(&title_key(title)).into_iter().flatten() {
            if !ats.contains(&at) {
                ats.push(at);
            }
        }
        let mut games = ats.into_iter().map(|at| &self.index.games[at]);
        Found {
            entry: games.next().cloned(),
            others: games.map(|game| game.title.clone()).collect(),
        }
    }
}

/// Why the manifest couldn't be had.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Failure {
    /// Not reached, or it answered with something else.
    Unreachable,
    /// What came isn't the manifest.
    Unreadable,
}

/// Where the manifest is read from: its address, or in a development build, a stand-in.
fn address() -> String {
    #[cfg(debug_assertions)]
    if let Ok(address) = std::env::var("SHELF_SAVE_MANIFEST") {
        return address;
    }
    ADDRESS.to_string()
}

enum Fetched {
    Unchanged,
    Read { text: String, etag: Option<String> },
}

async fn fetch(address: &str, etag: Option<&str>, version: &str) -> Result<Fetched, Failure> {
    // A file, for tests and `pnpm desktop:check`, in a development build only.
    #[cfg(debug_assertions)]
    if let Some(path) = address.strip_prefix("file:") {
        let text = fs::read_to_string(path).map_err(|_| Failure::Unreachable)?;
        return Ok(Fetched::Read { text, etag: None });
    }
    let client = reqwest::Client::builder()
        .timeout(TIMEOUT)
        .user_agent(format!("ShelfForWindows/{version}"))
        .build()
        .map_err(|_| Failure::Unreachable)?;
    let mut asked = client.get(address);
    if let Some(etag) = etag {
        asked = asked.header(reqwest::header::IF_NONE_MATCH, etag);
    }
    let mut answer = asked.send().await.map_err(|_| Failure::Unreachable)?;
    if answer.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(Fetched::Unchanged);
    }
    if !answer.status().is_success() {
        return Err(Failure::Unreachable);
    }
    if answer
        .content_length()
        .is_some_and(|length| length > MOST_BYTES)
    {
        return Err(Failure::Unreadable);
    }
    let etag = answer
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut bytes = Vec::new();
    while let Some(chunk) = answer.chunk().await.map_err(|_| Failure::Unreachable)? {
        bytes.extend_from_slice(&chunk);
        if bytes.len() as u64 > MOST_BYTES {
            return Err(Failure::Unreadable);
        }
    }
    let text = String::from_utf8(bytes).map_err(|_| Failure::Unreadable)?;
    Ok(Fetched::Read { text, etag })
}

/// The manifest on this computer, read again when it is old.
pub struct Manifest {
    file: PathBuf,
    held: Mutex<Option<Arc<Lookup>>>,
    failed_at: Mutex<Option<u64>>,
    /// One reading at a time: a second page asking waits for the first.
    reading: tokio::sync::Mutex<()>,
}

impl Manifest {
    pub fn open(folder: &Path) -> Self {
        Manifest {
            file: folder.join(FILE),
            held: Mutex::new(None),
            failed_at: Mutex::new(None),
            reading: tokio::sync::Mutex::new(()),
        }
    }

    #[cfg(test)]
    fn kept(&self) -> Option<Index> {
        let text = fs::read_to_string(&self.file).ok()?;
        serde_json::from_str(&text).ok()
    }

    fn keep(&self, index: &Index) -> io::Result<()> {
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder)?;
        }
        let next = self.file.with_extension("json.next");
        fs::write(&next, serde_json::to_vec(index).map_err(io::Error::other)?)?;
        fs::rename(&next, &self.file)
    }

    /// The manifest, read again first if what is here is over a week old. A reading that fails keeps
    /// what is here, and only fails if there is nothing.
    pub async fn lookup(&self, version: &str, now: u64) -> Result<Arc<Lookup>, Failure> {
        let _one = self.reading.lock().await;
        let held = self.held.lock().unwrap().clone();
        let have = match held {
            Some(lookup) => Some(lookup),
            None => {
                let file = self.file.clone();
                tauri::async_runtime::spawn_blocking(move || {
                    let index = serde_json::from_slice::<Index>(&fs::read(&file).ok()?).ok()?;
                    Some(Arc::new(Lookup::new(index)))
                })
                .await
                .ok()
                .flatten()
            }
        };
        let fresh = have
            .as_ref()
            .is_some_and(|lookup| now.saturating_sub(lookup.index().read_at) < FRESH_FOR_MS);
        let failed_lately = self
            .failed_at
            .lock()
            .unwrap()
            .is_some_and(|at| now.saturating_sub(at) < RETRY_AFTER_MS);
        if fresh || (failed_lately && have.is_some()) {
            *self.held.lock().unwrap() = have.clone();
            return have.ok_or(Failure::Unreachable);
        }
        let etag = have.as_ref().and_then(|lookup| lookup.index().etag.clone());
        let read = match fetch(&address(), etag.as_deref(), version).await {
            Ok(Fetched::Unchanged) => have.as_ref().map(|lookup| {
                let mut index = lookup.index().clone();
                index.read_at = now;
                index
            }),
            Ok(Fetched::Read { text, etag }) => {
                let index = tauri::async_runtime::spawn_blocking(move || {
                    let mut index = parse(&text);
                    index.etag = etag;
                    index.read_at = now;
                    index
                })
                .await
                .ok();
                // Nothing of any use in it is not the manifest.
                index.filter(|index| !index.games.is_empty())
            }
            Err(_) => None,
        };
        match read {
            Some(index) => {
                if let Err(error) = self.keep(&index) {
                    eprintln!("could not keep the list of save locations: {error}");
                }
                let lookup = Arc::new(Lookup::new(index));
                *self.held.lock().unwrap() = Some(lookup.clone());
                *self.failed_at.lock().unwrap() = None;
                Ok(lookup)
            }
            None => {
                *self.failed_at.lock().unwrap() = Some(now);
                *self.held.lock().unwrap() = have.clone();
                have.ok_or(Failure::Unreachable)
            }
        }
    }

    /// What was read last, without reading anything: for the steps after `lookup` in one command.
    pub fn held(&self) -> Option<Arc<Lookup>> {
        self.held.lock().unwrap().clone()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The manifest's shape, as the real one has it, with made-up games, written by hand.
    pub const STAND_IN: &str = include_str!("../../../fixtures/saves/manifest.yaml");

    fn index() -> Index {
        parse(STAND_IN)
    }

    #[test]
    fn keeps_windows_saves_and_leaves_the_rest() {
        let index = index();
        let titles: Vec<&str> = index.games.iter().map(|game| game.title.as_str()).collect();
        assert_eq!(
            titles,
            [
                "A Game",
                "Another Game",
                "Registry Game",
                "Made-up Stand-in"
            ]
        );
        let game = &index.games[0];
        assert_eq!(game.files, ["<winAppData>/A Game/saves"]);
        assert_eq!(game.install_dirs, ["AGame"]);
        assert_eq!(game.steam, [1000001]);
        assert_eq!(game.cloud, ["steam"]);
        assert_eq!(index.games[1].steam, [1000002, 1000003]);
        assert_eq!(
            index.games[1].files,
            ["<base>/save/*.sav", "<winDocuments>/My Games/Another Game"]
        );
        assert!(index.games[2].registry);
        assert!(index.games[2].files.is_empty());
        assert_eq!(index.skipped, 1);
        assert_eq!(index.aliases["A Game: Remastered"], "A Game");
    }

    #[test]
    fn finds_a_game_by_its_steam_app_then_by_its_words() {
        let lookup = Lookup::new(index());
        let by_app = lookup.find("Something Else", &["1000003".into()], None);
        assert_eq!(by_app.entry.unwrap().title, "Another Game");
        let by_words = lookup.find("ANOTHER game", &[], None);
        assert_eq!(by_words.entry.unwrap().title, "Another Game");
        let by_alias = lookup.find("A Game - Remastered", &[], None);
        assert_eq!(by_alias.entry.unwrap().title, "A Game");
        // No looser: a word missing is not the game.
        assert_eq!(lookup.find("Another", &[], None).entry, None);
        let both = lookup.find("A Game", &["1000002".into()], None);
        assert_eq!(both.entry.unwrap().title, "Another Game");
        assert_eq!(both.others, ["A Game"]);
        let chosen = lookup.find("A Game", &["1000002".into()], Some("A Game"));
        assert_eq!(chosen.entry.unwrap().title, "A Game");
    }

    #[test]
    fn a_game_starts_only_at_the_first_column() {
        let text = "---\n\"A\":\n  files:\n    x: {}\n# a comment\nB:\n  steam:\n    id: 1\n";
        let games: Vec<&str> = games_in(text).collect();
        assert_eq!(games.len(), 2);
        assert!(games[0].starts_with("\"A\":"));
        assert!(games[0].contains("# a comment"));
        assert!(games[1].starts_with("B:"));
    }

    #[test]
    fn what_is_kept_reads_back() {
        let folder = crate::saves::paths::tests::folder("manifest-kept");
        let manifest = Manifest::open(&folder);
        let mut index = index();
        index.read_at = 5;
        manifest.keep(&index).unwrap();
        let again = manifest.kept().unwrap();
        assert_eq!(again.games, index.games);
        assert_eq!(again.read_at, 5);
        fs::remove_dir_all(folder).unwrap();
    }
}
