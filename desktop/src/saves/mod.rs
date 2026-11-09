//! A game's saves, carried in snapshots (ADR 008). What was decided for each game is `saves.json`, by
//! entry id, in the app's folder; snapshots go to this PC's place, which until one is chosen is the
//! app's own `saves\` folder. Shelf's server never sees any of it.

pub mod cloud;
pub mod manifest;
pub mod notice;
pub mod paths;
pub mod progress;
pub mod remote;
pub mod restore;
pub mod sign_in;
pub mod snapshot;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};

use cloud::{Cloud, Service};
use manifest::{Entry, Lookup};
use paths::{Folders, GameAt, Pattern};
use remote::{Away, Mirror, Remote};
use restore::Target;
use snapshot::{Here, Item, Known, List, Making, Unmade, Verdict};

const FILE: &str = "saves.json";
const JOURNAL: &str = "save-restore.json";
/// The folder Shelf keeps inside the one chosen as this PC's place (ADR 008, section 8).
pub const PLACE_NAME: &str = "Shelf saves";
/// What was here before a restore is kept this long, and never fewer than the last few.
const BACKUPS_FOR_MS: u64 = 30 * 24 * 60 * 60_000;
const BACKUPS_AT_LEAST: usize = 5;

/// Why nothing was done, in a word a page has a sentence for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Refusal {
    Invalid,
    /// No file is chosen for the game on this computer.
    Unset,
    /// The game is running, or starting.
    Running,
    /// A backup or restore of it is going.
    Busy,
    /// No saves were found to back up.
    Empty,
    /// Over the largest snapshot the caps allow.
    Large,
    /// A folder that holds more than a game's saves.
    Wide,
    /// The game's own folder, or one above it: a restore there could take the game away.
    #[serde(rename = "game-folder")]
    GameFolder,
    /// A folder outside the game's and this PC's folders, which would mean nothing on another PC.
    Outside,
    /// The snapshot isn't there.
    Missing,
    /// Its archive isn't what its list says, or a path in it isn't the game's.
    Damaged,
    /// A file changed while it was read.
    Changed,
    /// The list of save locations couldn't be read, and there is none here.
    Unreachable,
    Failed,
}

/// The caps, the same for every game (ADR 008, section 4).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Caps {
    /// The largest snapshot, in megabytes.
    pub most_mb: u32,
    /// How many are kept per game.
    pub kept: u32,
}

impl Default for Caps {
    fn default() -> Self {
        Caps {
            most_mb: 500,
            kept: 20,
        }
    }
}

impl Caps {
    pub const FEWEST_KEPT: u32 = 3;
    pub const MOST_KEPT: u32 = 200;
    pub const SMALLEST_MB: u32 = 10;
    pub const LARGEST_MB: u32 = 10_240;

    /// Within what Settings offers: a page can't set history below three.
    pub fn bounded(self) -> Caps {
        Caps {
            most_mb: self.most_mb.clamp(Self::SMALLEST_MB, Self::LARGEST_MB),
            kept: self.kept.clamp(Self::FEWEST_KEPT, Self::MOST_KEPT),
        }
    }

    pub fn most_bytes(self) -> u64 {
        u64::from(self.most_mb) * 1024 * 1024
    }
}

/// What last happened to a game's saves, to say on its page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Last {
    pub at: u64,
    pub did: Did,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub why: Option<Refusal>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Did {
    BackedUp,
    /// Backed up on this computer, the place not reached: it is copied there once it can be.
    Waiting,
    Unchanged,
    Restored,
    Failed,
}

/// What was decided for one game on this computer.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSaves {
    pub on: bool,
    pub title: String,
    /// The Steam apps a page last named it by: what the app looks it up with when no page asks, after a
    /// session and before Play.
    #[serde(default)]
    pub apps: Vec<String>,
    /// The manifest's game, when the person chose among several.
    #[serde(default)]
    pub manifest: Option<String>,
    /// The game's folder, when the person chose another than the one worked out.
    #[serde(default)]
    pub base: Option<PathBuf>,
    /// Folders the person added, written from a placeholder.
    #[serde(default)]
    pub added: Vec<String>,
    /// The manifest's paths the person took away.
    #[serde(default)]
    pub removed: Vec<String>,
    #[serde(default)]
    pub known: Option<Known>,
    #[serde(default)]
    pub last: Option<Last>,
}

/// What `saves.json` holds. `version` is for whatever reads it next.
#[derive(Default, Serialize, Deserialize)]
struct Kept {
    version: u32,
    #[serde(default)]
    caps: Caps,
    #[serde(default)]
    games: BTreeMap<String, GameSaves>,
    /// The folder chosen as this PC's place, when one is (ADR 008, section 8).
    #[serde(default)]
    place: Option<PathBuf>,
    /// The service chosen as this PC's place instead, when one is (phase 5).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cloud: Option<Service>,
}

/// One of a game's locations on this computer.
#[derive(Clone, Debug)]
pub struct Location {
    pub pattern: Pattern,
    /// As kept: the manifest's text, or the folder the person added.
    pub text: String,
    pub added: bool,
    /// Its folder is too wide to hold, so only the files its last part names are the game's.
    pub files_only: bool,
    /// Too wide however it is read: neither backed up nor written.
    pub refused: bool,
}

impl Location {
    fn read(text: &str, added: bool, folders: &Folders, game: &GameAt) -> Option<Location> {
        let pattern = paths::pattern(text, game, folders, added)?;
        let mut root = pattern.token.folder(folders, game)?;
        let mut rest = 0;
        for part in &pattern.parts {
            if !added && part.contains(['*', '?', '[']) {
                break;
            }
            root.push(part);
            rest += 1;
        }
        let globs = pattern.parts.len() - rest;
        let wide = paths::too_wide(&root, folders, game);
        // A wide folder is the game's only through files its last part names, such as `<base>/*.sav`.
        let files_only = wide && globs == 1;
        let refused = wide && globs != 1;
        Some(Location {
            pattern,
            text: text.to_string(),
            added,
            files_only,
            refused,
        })
    }

    /// Whether a path from a snapshot is this location's.
    pub fn holds(&self, path: &str) -> bool {
        if self.refused {
            return false;
        }
        if self.files_only {
            let parts = path.split_once('>').map_or(0, |(_, rest)| {
                rest.split('/').filter(|part| !part.is_empty()).count()
            });
            return parts == self.pattern.parts.len() && self.pattern.holds(path);
        }
        self.pattern.holds(path)
    }

    /// The files it holds on this computer now.
    pub fn files(&self, folders: &Folders, game: &GameAt) -> Vec<PathBuf> {
        if self.refused {
            return Vec::new();
        }
        let mut files = Vec::new();
        for found in self.pattern.matches(folders, game) {
            if found.is_file() {
                files.push(found);
            } else if !self.files_only && found.is_dir() && !paths::too_wide(&found, folders, game)
            {
                walk(&found, &mut files, 0);
            }
            if files.len() > snapshot::MOST_FILES {
                break;
            }
        }
        files
    }
}

fn walk(folder: &Path, files: &mut Vec<PathBuf>, depth: usize) {
    if depth > 32 || files.len() > snapshot::MOST_FILES {
        return;
    }
    let Ok(entries) = fs::read_dir(folder) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if paths::reparse_point(&path) {
            continue;
        }
        if path.is_dir() {
            walk(&path, files, depth + 1);
        } else if path.is_file() {
            files.push(path);
        }
    }
}

/// A game, set up on this computer for one question: where it is, and where its saves are.
pub struct Setup {
    pub game: GameAt,
    pub entry: Option<Entry>,
    pub others: Vec<String>,
    pub locations: Vec<Location>,
}

/// The game's folder: the nearest folder above its file named as one of its `installDir`s, or else the
/// file's own folder (ADR 008, section 3).
pub fn base_of(file: &Path, install_dirs: &[String]) -> Option<PathBuf> {
    let folder = file.parent()?;
    for above in folder.ancestors() {
        let named = above.file_name().is_some_and(|name| {
            let name = name.to_string_lossy().to_lowercase();
            install_dirs.iter().any(|dir| dir.to_lowercase() == name)
        });
        if named {
            return Some(above.to_path_buf());
        }
    }
    Some(folder.to_path_buf())
}

/// The record a restore leaves until it is finished: an app that starts and finds it puts the backup
/// back first.
#[derive(Serialize, Deserialize)]
struct Journal {
    entry: String,
    backup: PathBuf,
    /// What the backup holds, and where each goes back to.
    files: Vec<(Item, PathBuf)>,
    /// Every file the restore may have written or taken away.
    touched: Vec<PathBuf>,
}

/// A game's saves being backed up or restored: one at a time per game.
pub struct Busy<'a> {
    saves: &'a Saves,
    entry: String,
}

impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.saves.board.clear(&self.entry);
        self.saves.busy.lock().unwrap().remove(&self.entry);
    }
}

/// Where a game's saves stand, from section 5's table: what the page says beside the history.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum State {
    /// No saves here, and no snapshot.
    Nothing,
    /// The latest snapshot holds what is here.
    InStep,
    /// What is here has changed since the latest snapshot.
    Changed,
    /// The latest snapshot is newer than what is here.
    Behind,
    /// Both moved, or two snapshots are the latest: the person chooses.
    Choose,
}

/// What was asked of a game's saves, as a page shows it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub on: bool,
    /// The manifest's game, if it has one, and the others that answer to the same name.
    pub matched: Option<String>,
    pub others: Vec<String>,
    pub registry: bool,
    pub cloud: Vec<String>,
    /// Whether the list of save locations could be read at all.
    pub manifest: bool,
    pub base: Option<String>,
    pub locations: Vec<LocationView>,
    pub files: usize,
    pub bytes: u64,
    pub snapshots: Vec<SnapshotView>,
    /// The latest snapshots: one, or several when a choice waits.
    pub heads: Vec<String>,
    /// When the saves here last changed, to show beside the place's in a choice.
    pub changed_at: Option<u64>,
    pub state: State,
    pub last: Option<Last>,
    pub busy: bool,
    pub caps: Caps,
    /// This PC's place: a folder, or a service by its name; None is this computer alone.
    pub place: Option<String>,
    /// Whether the place is a service, OneDrive or Google Drive, rather than a folder.
    pub service: bool,
    pub reachable: bool,
    /// Why the place couldn't be used, when it couldn't.
    pub away: Option<Away>,
}

/// What the look at a game's saves before Play did (ADR 008, section 7), as Play's page says it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "did", rename_all = "kebab-case")]
pub enum Checked {
    /// Nothing to do: the latest snapshot holds what is here, or there is nothing anywhere.
    InStep,
    /// This PC played without a snapshot after: one is made now.
    BackedUp,
    /// Another PC played since: its snapshot is put back, what was here backed up first.
    Restored,
    /// The place can't be reached, or is signed out of: the game starts with what is here.
    Unreachable { why: Away },
    /// Two copies differ: Play waits for the person to choose.
    Choose,
    /// The look went wrong: the game starts with what is here, and the page says why.
    Failed { why: Refusal },
}

/// What a backup after a session found that needs the person, for a notification. Nothing is said when
/// all went well.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Needs {
    /// The snapshot just made and another PC's are both the latest: the next Play asks.
    Choice,
    /// Made on this PC, the place out of reach.
    Waiting,
    /// Made on this PC: the service the place is no longer takes the sign-in.
    SignedOut,
    /// Made on this PC: the place has no room left.
    Full,
    Failed(Refusal),
}

/// This PC's place, as Settings shows it.
#[derive(Debug, Serialize)]
pub struct PlaceView {
    /// The folder Shelf keeps there, when a folder is the place.
    pub folder: Option<String>,
    /// The service, when one is the place (phase 5).
    pub cloud: Option<Service>,
    pub reachable: bool,
    pub away: Option<Away>,
    /// The services this build can sign in to, and who is signed in to each.
    pub services: Vec<ServiceView>,
}

/// A service as Settings offers it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceView {
    pub service: Service,
    /// The account signed in, by its email or the name it signs in with.
    pub account: Option<String>,
    /// Waiting for the browser to come back from the service's page.
    pub signing_in: bool,
}

/// Where this PC's snapshots go now.
enum Where {
    /// The app's own `saves\` folder.
    Here,
    /// `Shelf saves` in the folder chosen, and the folder chosen.
    Folder(PathBuf, PathBuf),
    Cloud(Service),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationView {
    pub text: String,
    pub shown: String,
    pub added: bool,
    pub files: usize,
    pub bytes: u64,
    pub refused: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotView {
    pub id: String,
    pub created_at: u64,
    pub device: Option<String>,
    pub files: usize,
    pub bytes: u64,
    /// It holds what this PC has now.
    pub here: bool,
    /// Made here and not yet at the place, which couldn't be reached: it goes as soon as it can.
    pub waiting: bool,
}

pub struct Saves {
    folder: PathBuf,
    kept: Mutex<Kept>,
    busy: Mutex<HashSet<String>>,
    /// Each file's hash, by its path, size and time: a file that hasn't changed isn't read again.
    hashes: Mutex<HashMap<String, (u64, u64, String)>>,
    pub manifest: manifest::Manifest,
    pub folders: Folders,
    device: Option<String>,
    /// The services signed in to through Settings, for their sign-ins (phase 5).
    pub clouds: Vec<Arc<Cloud>>,
    /// How each service is reached: its `Cloud`, or in a test, a stand-in.
    remotes: Vec<(Service, Arc<dyn Remote>)>,
    /// What the place last said, when it was a service that couldn't be used.
    away: Mutex<Option<Away>>,
    /// The service's trouble the person was last told of, so it is said once (`to_announce`).
    told: Mutex<Option<(Service, Away)>>,
    /// How far each game's backup or restore has got, for the page (`progress.rs`).
    pub board: Arc<progress::Board>,
}

impl Saves {
    /// What is kept in `folder`. A file that can't be read is put aside, not lost.
    pub fn open(folder: &Path, folders: Folders, device: Option<String>) -> Self {
        let file = folder.join(FILE);
        let kept = match fs::read_to_string(&file) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| {
                let _ = fs::rename(&file, folder.join("saves.unreadable.json"));
                Kept::default()
            }),
            Err(_) => Kept::default(),
        };
        Saves {
            folder: folder.to_path_buf(),
            kept: Mutex::new(kept),
            busy: Mutex::new(HashSet::new()),
            hashes: Mutex::new(HashMap::new()),
            manifest: manifest::Manifest::open(folder),
            folders,
            device,
            clouds: Vec::new(),
            remotes: Vec::new(),
            away: Mutex::new(None),
            told: Mutex::new(None),
            board: Arc::default(),
        }
    }

    /// A service Settings can sign in to and choose.
    pub fn add_cloud(&mut self, cloud: Arc<Cloud>) {
        cloud.watch(self.board.clone());
        self.remotes.push((cloud.service, cloud.clone()));
        self.clouds.push(cloud);
    }

    /// A stand-in for a service, signed in, for tests.
    #[cfg(test)]
    pub fn add_remote(&mut self, service: Service, remote: Arc<dyn Remote>) {
        self.remotes.push((service, remote));
    }

    fn remote(&self, service: Service) -> Option<Arc<dyn Remote>> {
        self.remotes
            .iter()
            .find(|(each, _)| *each == service)
            .map(|(_, remote)| remote.clone())
    }

    pub fn cloud(&self, service: Service) -> Option<Arc<Cloud>> {
        self.clouds
            .iter()
            .find(|cloud| cloud.service == service)
            .cloned()
    }

    /// Whether a service can be used now: signed in, or a test's stand-in.
    fn signed_in(&self, service: Service) -> bool {
        match self.cloud(service) {
            Some(cloud) => cloud.account().is_some(),
            None => self.remote(service).is_some(),
        }
    }

    fn save(&self, kept: &Kept) -> io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let next = self.folder.join("saves.json.next");
        let text = serde_json::to_string_pretty(&Kept {
            version: 1,
            caps: kept.caps,
            games: kept.games.clone(),
            place: kept.place.clone(),
            cloud: kept.cloud,
        })
        .map_err(io::Error::other)?;
        fs::write(&next, text)?;
        fs::rename(&next, self.folder.join(FILE))
    }

    fn change(&self, entry: &str, change: impl FnOnce(&mut GameSaves)) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        change(kept.games.entry(entry.to_string()).or_default());
        self.save(&kept).map_err(|_| Refusal::Failed)
    }

    pub fn game(&self, entry: &str) -> GameSaves {
        self.kept
            .lock()
            .unwrap()
            .games
            .get(entry)
            .cloned()
            .unwrap_or_default()
    }

    pub fn caps(&self) -> Caps {
        self.kept.lock().unwrap().caps
    }

    pub fn set_caps(&self, caps: Caps) -> Result<Caps, Refusal> {
        let mut kept = self.kept.lock().unwrap();
        kept.caps = caps.bounded();
        self.save(&kept).map_err(|_| Refusal::Failed)?;
        Ok(kept.caps)
    }

    /// This PC's place (ADR 008, section 8): a folder named `Shelf saves` in the folder chosen, unless that
    /// is the one chosen. None until a folder is.
    pub fn place_root(&self) -> Option<PathBuf> {
        let chosen = self.kept.lock().unwrap().place.clone()?;
        Some(root_in(&chosen))
    }

    fn place_now(&self) -> Where {
        let kept = self.kept.lock().unwrap();
        match (&kept.cloud, &kept.place) {
            (Some(service), _) => Where::Cloud(*service),
            (None, Some(chosen)) => Where::Folder(root_in(chosen), chosen.clone()),
            (None, None) => Where::Here,
        }
    }

    /// Whether a place other than this computer is chosen: what can't reach it waits here.
    fn chosen(&self) -> bool {
        !matches!(self.place_now(), Where::Here)
    }

    /// Why the place can't be used now, as far as is known without asking it: a folder that isn't there, a
    /// service signed out of, or what the service last said.
    fn away_now(&self) -> Option<Away> {
        match self.place_now() {
            Where::Here => None,
            Where::Folder(_, chosen) => (!chosen.is_dir()).then_some(Away::Unreachable),
            Where::Cloud(service) if !self.signed_in(service) => Some(Away::SignedOut),
            Where::Cloud(_) => *self.away.lock().unwrap(),
        }
    }

    /// What this PC's service needs from the person that they haven't been told yet: to sign in again, or
    /// room (ADR 008, section 8). Said once, until it passes. A line down passes by itself and isn't said,
    /// nor a folder away, which may be a USB drive unplugged on purpose: the header shows both.
    pub fn to_announce(&self) -> Option<(Service, Away)> {
        let now = match (self.place_now(), self.away_now()) {
            (Where::Cloud(service), Some(away @ (Away::SignedOut | Away::Full))) => {
                Some((service, away))
            }
            _ => None,
        };
        let mut told = self.told.lock().unwrap();
        if *told == now {
            return None;
        }
        *told = now;
        now
    }

    /// Asks this PC's service whether it still takes the sign-in (`Cloud::check`). Nothing for a folder.
    pub fn check_sign_in(&self) {
        if let Where::Cloud(service) = self.place_now()
            && let Some(cloud) = self.cloud(service)
        {
            cloud.check();
        }
    }

    /// Notes what a service said, for the next look.
    fn noted<T>(&self, said: Result<T, Away>) -> Result<T, Away> {
        *self.away.lock().unwrap() = said.as_ref().err().copied();
        said
    }

    fn mirror<'a>(&self, service: Service, remote: &'a dyn Remote) -> Mirror<'a> {
        Mirror {
            remote,
            cache: self.folder.join("saves-cloud").join(service.key()),
        }
    }

    /// Where this PC's snapshots of a game are written straight into: this computer's folder, or the folder
    /// chosen while it can be reached. A service is sent to from what waits here.
    fn direct(&self, entry: &str) -> Option<PathBuf> {
        match self.place_now() {
            Where::Here => Some(self.local(entry)),
            Where::Folder(root, chosen) => chosen.is_dir().then(|| root.join(entry)),
            Where::Cloud(_) => None,
        }
    }

    /// Where this PC's snapshots of a game go, when that is a folder: the place, or until one is chosen, the
    /// app's own folder.
    pub fn place(&self, entry: &str) -> PathBuf {
        match self.place_root() {
            Some(root) => root.join(entry),
            None => self.local(entry),
        }
    }

    fn local(&self, entry: &str) -> PathBuf {
        self.folder.join("saves").join(entry)
    }

    /// Snapshots made while the place couldn't be reached, or on their way to a service, waiting on this
    /// computer.
    fn waiting(&self, entry: &str) -> PathBuf {
        self.folder.join("saves-waiting").join(entry)
    }

    /// The place's snapshots of a game, or why it can't be read.
    fn place_lists(&self, entry: &str) -> Result<Vec<List>, Away> {
        match self.place_now() {
            Where::Here => Ok(snapshot::whole(&self.local(entry))),
            Where::Folder(root, chosen) if chosen.is_dir() => {
                Ok(snapshot::whole(&root.join(entry)))
            }
            Where::Folder(..) => Err(Away::Unreachable),
            Where::Cloud(service) => {
                if !self.signed_in(service) {
                    return Err(Away::SignedOut);
                }
                let remote = self.remote(service).ok_or(Away::SignedOut)?;
                self.noted(self.mirror(service, remote.as_ref()).lists(entry))
            }
        }
    }

    /// Every snapshot of a game that counts: the place's, and those waiting here for it, newest first; and
    /// why the place couldn't be read, when it couldn't.
    fn lists_and_away(&self, entry: &str) -> (Vec<List>, Option<Away>) {
        let (mut lists, away) = match self.place_lists(entry) {
            Ok(lists) => (lists, None),
            Err(away) => (Vec::new(), Some(away)),
        };
        for waiting in snapshot::whole(&self.waiting(entry)) {
            if !lists.iter().any(|list| list.id == waiting.id) {
                lists.push(waiting);
            }
        }
        lists.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
        (lists, away)
    }

    /// Every snapshot of a game that counts: the place's, and those waiting here for it. Newest first.
    pub fn lists(&self, entry: &str) -> Vec<List> {
        self.lists_and_away(entry).0
    }

    /// Where a snapshot's files are on this computer: waiting here, or in the place, read from a service
    /// first when it is one.
    fn folder_of(&self, entry: &str, list: &List) -> Option<PathBuf> {
        let both = |folder: &Path| {
            folder.join(format!("{}.json", list.id)).is_file()
                && folder.join(format!("{}.zip", list.id)).is_file()
        };
        let waiting = self.waiting(entry);
        if both(&waiting) {
            return Some(waiting);
        }
        match self.place_now() {
            Where::Cloud(service) => {
                let remote = self.remote(service)?;
                self.noted(self.mirror(service, remote.as_ref()).fetch(entry, list))
                    .ok()
            }
            _ => Some(self.place(entry)).filter(|folder| both(folder)),
        }
    }

    /// Sends what waited here to the place, now it can be reached, and lets go of it here. To a service,
    /// the oldest past the caps go there afterwards, as they do in a folder when a snapshot is written.
    pub fn send_waiting(&self, entry: &str) {
        let waiting = self.waiting(entry);
        let sending = snapshot::whole(&waiting);
        if sending.is_empty() {
            return;
        }
        let let_go = |list: &List| {
            let _ = fs::remove_file(waiting.join(format!("{}.json", list.id)));
            let _ = fs::remove_file(waiting.join(format!("{}.zip", list.id)));
        };
        match self.place_now() {
            Where::Here => {}
            Where::Folder(root, chosen) => {
                if !chosen.is_dir() {
                    return;
                }
                // A folder's copy is a moment's, and only a service's bytes are counted.
                self.board.set(entry, progress::Step::Sending, 0, None);
                for list in &sending {
                    if snapshot::copy(&waiting, &root.join(entry), list).is_ok() {
                        let_go(list);
                    }
                }
            }
            Where::Cloud(service) => {
                let Some(remote) = self.remote(service) else {
                    return;
                };
                if !self.signed_in(service) {
                    return;
                }
                let mirror = self.mirror(service, remote.as_ref());
                let title = self.game(entry).title;
                // Oldest first, so a list's parent is there before it.
                let mut sent = Vec::new();
                for list in sending.iter().rev() {
                    if self
                        .noted(mirror.send(entry, &title, &waiting, list))
                        .is_err()
                    {
                        break;
                    }
                    let_go(list);
                    sent.push(list.id.as_str());
                }
                if !sent.is_empty()
                    && let Ok(there) = self.noted(mirror.lists(entry))
                {
                    let kept = self.caps().kept as usize;
                    let past: Vec<&str> = snapshot::past_the_caps(&there, kept, &sent)
                        .iter()
                        .map(|list| list.id.as_str())
                        .collect();
                    let _ = self.noted(mirror.remove(entry, &past));
                }
            }
        }
    }

    /// Sends what waits here for every game, as after a service is chosen: on a thread of its own.
    pub fn send_all_waiting(&self) {
        let Ok(games) = fs::read_dir(self.folder.join("saves-waiting")) else {
            return;
        };
        for game in games.filter_map(Result::ok) {
            let entry = game.file_name().to_string_lossy().into_owned();
            if crate::ids::entry(&entry) {
                self.send_waiting(&entry);
            }
        }
    }

    /// This PC's place, as Settings shows it.
    pub fn place_view(&self) -> PlaceView {
        let (folder, cloud) = match self.place_now() {
            Where::Here => (None, None),
            Where::Folder(root, _) => (Some(root.display().to_string()), None),
            Where::Cloud(service) => (None, Some(service)),
        };
        let away = self.away_now();
        PlaceView {
            folder,
            cloud,
            reachable: away.is_none(),
            away,
            services: self
                .clouds
                .iter()
                .filter(|cloud| cloud.available())
                .map(|cloud| ServiceView {
                    service: cloud.service,
                    account: cloud.account(),
                    signing_in: cloud.signing_in(),
                })
                .collect(),
        }
    }

    /// The folders holding this PC's history now: the app's own, and the folder chosen, when it can be
    /// reached. What a new place takes along.
    fn history(&self) -> Vec<(String, PathBuf)> {
        let mut folders = vec![self.folder.join("saves")];
        if let Where::Folder(root, chosen) = self.place_now()
            && chosen.is_dir()
        {
            folders.push(root);
        }
        let mut games = Vec::new();
        for folder in folders {
            let Ok(each) = fs::read_dir(&folder) else {
                continue;
            };
            for game in each.filter_map(Result::ok) {
                let entry = game.file_name().to_string_lossy().into_owned();
                if crate::ids::entry(&entry) {
                    games.push((entry, game.path()));
                }
            }
        }
        games
    }

    /// Chooses a folder as this PC's place. This computer's history goes with it, as new files only, so
    /// nothing there is replaced. Never inside Windows, Program Files or the app's own folder.
    pub fn choose_place(&self, chosen: &Path) -> Result<PlaceView, Refusal> {
        let at = paths::key(chosen);
        let refused = [&self.folders.windows, &self.folders.app]
            .into_iter()
            .flatten()
            .chain(self.folders.program_files.iter())
            .any(|each| paths::inside_or_same(&at, &paths::key(each)));
        if refused || !chosen.is_dir() {
            return Err(Refusal::Wide);
        }
        let history = self.history();
        {
            let mut kept = self.kept.lock().unwrap();
            kept.place = Some(chosen.to_path_buf());
            kept.cloud = None;
            self.save(&kept).map_err(|_| Refusal::Failed)?;
        }
        let root = self.place_root().ok_or(Refusal::Failed)?;
        fs::create_dir_all(&root).map_err(|_| Refusal::Unreachable)?;
        for (entry, from) in history {
            for list in snapshot::whole(&from) {
                let _ = snapshot::copy(&from, &root.join(&entry), &list);
            }
        }
        Ok(self.place_view())
    }

    /// Chooses a service signed in to as this PC's place (phase 5). This computer's history goes with it:
    /// it waits here, and is sent as each game is next looked at, or by `send_all_waiting`.
    pub fn choose_cloud(&self, service: Service) -> Result<PlaceView, Refusal> {
        if !self.signed_in(service) {
            return Err(Refusal::Unset);
        }
        let history = self.history();
        {
            let mut kept = self.kept.lock().unwrap();
            kept.cloud = Some(service);
            kept.place = None;
            self.save(&kept).map_err(|_| Refusal::Failed)?;
        }
        *self.away.lock().unwrap() = None;
        for (entry, from) in history {
            for list in snapshot::whole(&from) {
                let _ = snapshot::copy(&from, &self.waiting(&entry), &list);
            }
        }
        Ok(self.place_view())
    }

    /// Back to this computer alone. What is in the folder or the service stays there.
    pub fn forget_place(&self) -> Result<PlaceView, Refusal> {
        let mut kept = self.kept.lock().unwrap();
        kept.place = None;
        kept.cloud = None;
        self.save(&kept).map_err(|_| Refusal::Failed)?;
        drop(kept);
        *self.away.lock().unwrap() = None;
        Ok(self.place_view())
    }

    fn backups(&self, entry: &str) -> PathBuf {
        self.folder.join("save-backups").join(entry)
    }

    fn staging(&self) -> PathBuf {
        self.folder.join("save-staging")
    }

    /// Holds a game for a backup or a restore, or says one is going.
    pub fn begin(&self, entry: &str) -> Result<Busy<'_>, Refusal> {
        if self.journal().is_some_and(|journal| journal.entry == entry) {
            return Err(Refusal::Busy);
        }
        if !self.busy.lock().unwrap().insert(entry.to_string()) {
            return Err(Refusal::Busy);
        }
        Ok(Busy {
            saves: self,
            entry: entry.to_string(),
        })
    }

    /// Whether any game's saves are being backed up or put back: an update waits for that.
    pub fn any_busy(&self) -> bool {
        !self.busy.lock().unwrap().is_empty() || self.journal().is_some()
    }

    pub fn is_busy(&self, entry: &str) -> bool {
        self.busy.lock().unwrap().contains(entry)
            || self.journal().is_some_and(|journal| journal.entry == entry)
    }

    /// The game set up for this computer: its folder, its manifest entry and its locations.
    pub fn setup(
        &self,
        entry: &str,
        file: Option<&Path>,
        lookup: Option<&Lookup>,
        title: &str,
        apps: &[String],
    ) -> Setup {
        let kept = self.game(entry);
        let found = lookup.map(|lookup| lookup.find(title, apps, kept.manifest.as_deref()));
        let (manifest_entry, others) = match found {
            Some(found) => (found.entry, found.others),
            None => (None, Vec::new()),
        };
        let install_dirs = manifest_entry
            .as_ref()
            .map(|entry| entry.install_dirs.clone())
            .unwrap_or_default();
        let base = kept
            .base
            .clone()
            .or_else(|| file.and_then(|file| base_of(file, &install_dirs)));
        let name = base
            .as_ref()
            .and_then(|base| base.file_name())
            .map(|name| name.to_string_lossy().into_owned())
            .or_else(|| install_dirs.first().cloned())
            .or_else(|| manifest_entry.as_ref().map(|entry| entry.title.clone()));
        let game = GameAt {
            base,
            name,
            steam: manifest_entry
                .as_ref()
                .and_then(|entry| entry.steam.first())
                .map(u64::to_string)
                .or_else(|| apps.first().cloned()),
        };
        let mut locations: Vec<Location> = manifest_entry
            .iter()
            .flat_map(|entry| entry.files.iter())
            .filter(|text| !kept.removed.contains(text))
            .filter_map(|text| Location::read(text, false, &self.folders, &game))
            .collect();
        locations.extend(
            kept.added
                .iter()
                .filter_map(|text| Location::read(text, true, &self.folders, &game)),
        );
        Setup {
            game,
            entry: manifest_entry,
            others,
            locations,
        }
    }

    fn hash(&self, path: &Path, meta: &fs::Metadata) -> io::Result<String> {
        let key = paths::key(path);
        let modified = snapshot::modified_of(meta);
        if let Some((size, at, hash)) = self.hashes.lock().unwrap().get(&key)
            && *size == meta.len()
            && *at == modified
        {
            return Ok(hash.clone());
        }
        let (hash, _) = snapshot::hash_file(path)?;
        self.hashes
            .lock()
            .unwrap()
            .insert(key, (meta.len(), modified, hash.clone()));
        Ok(hash)
    }

    /// The game's saves as they are on this computer now, under the caps.
    pub fn here(&self, setup: &Setup) -> Result<Here, Refusal> {
        let most = self.caps().most_bytes();
        let mut files = Vec::new();
        let mut bytes = 0u64;
        for location in setup.locations.iter().filter(|each| !each.refused) {
            for file in location.files(&self.folders, &setup.game) {
                let Some(path) =
                    paths::written_file(&file, &location.pattern, &self.folders, &setup.game)
                else {
                    continue;
                };
                let meta = fs::metadata(&file).map_err(|_| Refusal::Failed)?;
                bytes += meta.len();
                if bytes > most || files.len() >= snapshot::MOST_FILES {
                    return Err(Refusal::Large);
                }
                let sha256 = self.hash(&file, &meta).map_err(|_| Refusal::Changed)?;
                files.push((
                    Item {
                        path,
                        size: meta.len(),
                        modified: snapshot::modified_of(&meta),
                        sha256,
                    },
                    file,
                ));
            }
        }
        Ok(Here::new(files))
    }

    /// A game's saves as a page shows them.
    pub fn view(&self, entry: &str, setup: &Setup, manifest: bool) -> View {
        self.send_waiting(entry);
        let kept = self.game(entry);
        let here = self.here(setup).ok();
        let locations = setup
            .locations
            .iter()
            .map(|location| {
                let files = location.files(&self.folders, &setup.game);
                LocationView {
                    text: location.text.clone(),
                    shown: location
                        .pattern
                        .shown(&self.folders, &setup.game)
                        .map(|path| path.display().to_string())
                        .unwrap_or_default(),
                    added: location.added,
                    bytes: files
                        .iter()
                        .filter_map(|file| fs::metadata(file).ok())
                        .map(|meta| meta.len())
                        .sum(),
                    files: files.len(),
                    refused: location.refused,
                }
            })
            .collect::<Vec<_>>();
        let (files, bytes) = match &here {
            Some(here) => (here.files.len(), here.bytes()),
            None => (
                locations.iter().map(|each| each.files).sum(),
                locations.iter().map(|each| each.bytes).sum(),
            ),
        };
        let (lists, away) = self.lists_and_away(entry);
        let heads: Vec<String> = snapshot::heads(&lists)
            .iter()
            .map(|head| head.id.clone())
            .collect();
        let changed_at = here
            .as_ref()
            .and_then(|here| here.files.iter().map(|(item, _)| item.modified).max());
        let state = match snapshot::decide(
            here.as_ref()
                .filter(|here| !here.is_empty())
                .map(|here| here.content.as_str()),
            kept.known.as_ref(),
            &lists,
        ) {
            Verdict::Nothing => State::Nothing,
            Verdict::InStep(_) => State::InStep,
            Verdict::BackUp => State::Changed,
            Verdict::Restore(_) => State::Behind,
            Verdict::Choose { .. } => State::Choose,
        };
        let waiting = self.waiting(entry);
        let snapshots = lists
            .into_iter()
            .map(|list| SnapshotView {
                here: here
                    .as_ref()
                    .is_some_and(|here| here.content == list.content),
                waiting: waiting.join(format!("{}.json", list.id)).is_file(),
                files: list.files.len(),
                bytes: list.bytes(),
                id: list.id,
                created_at: list.created_at,
                device: list.device,
            })
            .collect();
        View {
            on: kept.on,
            matched: setup.entry.as_ref().map(|entry| entry.title.clone()),
            others: setup.others.clone(),
            registry: setup.entry.as_ref().is_some_and(|entry| entry.registry),
            cloud: setup
                .entry
                .as_ref()
                .map(|entry| entry.cloud.clone())
                .unwrap_or_default(),
            manifest,
            base: setup
                .game
                .base
                .as_ref()
                .map(|base| base.display().to_string()),
            locations,
            files,
            bytes,
            snapshots,
            heads,
            changed_at,
            state,
            last: kept.last,
            busy: self.is_busy(entry),
            caps: self.caps(),
            place: match self.place_now() {
                Where::Here => None,
                Where::Folder(root, _) => Some(root.display().to_string()),
                Where::Cloud(service) => Some(service.name().to_string()),
            },
            service: matches!(self.place_now(), Where::Cloud(_)),
            reachable: away.is_none(),
            away,
        }
    }

    pub fn set_on(&self, entry: &str, on: bool, title: &str) -> Result<(), Refusal> {
        self.change(entry, |game| {
            game.on = on;
            game.title = short_title(title);
        })
    }

    /// Keeps what a page named a game by, for when no page asks: after a session, before Play. Only for a
    /// game already set up here, and written only when it changed.
    pub fn remember(&self, entry: &str, title: &str, apps: &[String]) {
        let title = short_title(title);
        let mut kept = self.kept.lock().unwrap();
        let Some(game) = kept.games.get_mut(entry) else {
            return;
        };
        if game.title == title && game.apps == apps {
            return;
        }
        game.title = title;
        game.apps = apps.to_vec();
        let _ = self.save(&kept);
    }

    pub fn choose_manifest(&self, entry: &str, title: Option<String>) -> Result<(), Refusal> {
        self.change(entry, |game| game.manifest = title)
    }

    /// A folder the person picked for the game's saves, refused if it is too wide or outside every
    /// folder a placeholder names.
    pub fn add(&self, entry: &str, folder: &Path, setup: &Setup) -> Result<(), Refusal> {
        if paths::holds_the_game(folder, &setup.game) {
            return Err(Refusal::GameFolder);
        }
        if paths::too_wide(folder, &self.folders, &setup.game) {
            return Err(Refusal::Wide);
        }
        let pattern = paths::written(folder, &self.folders, &setup.game).ok_or(Refusal::Outside)?;
        let text = pattern.text();
        self.change(entry, |game| {
            game.removed.retain(|each| *each != text);
            if !game.added.contains(&text) {
                game.added.push(text);
            }
        })
    }

    /// Takes a location away: a folder added is forgotten, one of the manifest's is left out from now on.
    pub fn remove(&self, entry: &str, text: &str) -> Result<(), Refusal> {
        self.change(entry, |game| {
            let before = game.added.len();
            game.added.retain(|each| each != text);
            if game.added.len() == before && !game.removed.iter().any(|each| each == text) {
                game.removed.push(text.to_string());
            }
        })
    }

    /// Another folder for the game itself, or the one worked out again.
    pub fn set_base(&self, entry: &str, base: Option<PathBuf>) -> Result<(), Refusal> {
        self.change(entry, |game| game.base = base)
    }

    fn write_game_file(&self, folder: &Path, entry: &str, title: &str) {
        let file = folder.join("game.json");
        if file.exists() {
            return;
        }
        let text = serde_json::json!({ "version": 1, "entry": entry, "title": title });
        let _ = fs::create_dir_all(folder);
        let _ = fs::write(file, serde_json::to_vec_pretty(&text).unwrap_or_default());
    }

    fn finished(
        &self,
        entry: &str,
        did: Did,
        why: Option<Refusal>,
        known: Option<Known>,
        now: u64,
    ) {
        let _ = self.change(entry, |game| {
            game.last = Some(Last { at: now, did, why });
            if known.is_some() {
                game.known = known;
            }
        });
    }

    /// Makes a snapshot of what is here, unless it is what the latest already holds. The caller has
    /// checked the game isn't running, and holds it (`begin`). `parents`, when given, settles a choice.
    pub fn back_up(
        &self,
        entry: &str,
        title: &str,
        setup: &Setup,
        now: u64,
        parents: Option<Vec<String>>,
    ) -> Result<Option<List>, Refusal> {
        let made = self.make(entry, title, setup, now, parents);
        match &made {
            Ok(Some(list)) => self.finished(
                entry,
                if self
                    .waiting(entry)
                    .join(format!("{}.json", list.id))
                    .is_file()
                {
                    Did::Waiting
                } else {
                    Did::BackedUp
                },
                None,
                Some(Known {
                    id: list.id.clone(),
                    content: list.content.clone(),
                }),
                now,
            ),
            Ok(None) => self.finished(entry, Did::Unchanged, None, None, now),
            Err(why) => self.finished(entry, Did::Failed, Some(*why), None, now),
        }
        made
    }

    fn make(
        &self,
        entry: &str,
        title: &str,
        setup: &Setup,
        now: u64,
        parents: Option<Vec<String>>,
    ) -> Result<Option<List>, Refusal> {
        self.board.set(entry, progress::Step::Reading, 0, None);
        let here = self.here(setup)?;
        if here.is_empty() {
            return Err(Refusal::Empty);
        }
        self.send_waiting(entry);
        let lists = self.lists(entry);
        let settling = parents.is_some();
        let known = self.game(entry).known;
        // Nothing new: what the latest holds, or what this PC last made or put back. Another PC's newer
        // snapshot isn't a reason to copy what is here again, which would only make a choice of nothing.
        let unchanged = lists
            .first()
            .is_some_and(|latest| latest.content == here.content)
            || known.as_ref().is_some_and(|known| {
                known.content == here.content && lists.iter().any(|list| list.id == known.id)
            });
        if !settling && unchanged {
            return Ok(None);
        }
        let parents =
            parents.unwrap_or_else(|| known.iter().map(|known| known.id.clone()).collect());
        let title = short_title(title);
        let making = || Making {
            entry,
            title: &title,
            device: self.device.as_deref(),
            parents: parents.clone(),
            created_at: now,
        };
        let refused = |unmade| match unmade {
            Unmade::Changed => Refusal::Changed,
            Unmade::Io => Refusal::Failed,
        };
        let total: u64 = here.files.iter().map(|(item, _)| item.size).sum();
        let packed = |done| {
            self.board
                .set(entry, progress::Step::Packing, done, Some(total))
        };
        let direct = self.direct(entry);
        let written = match &direct {
            Some(place) => {
                self.write_game_file(place, entry, &title);
                snapshot::write_watched(place, &here, making(), &packed)
            }
            None => Err(Unmade::Io),
        };
        let list = match written {
            Ok(list) => {
                if let Some(place) = &direct {
                    let kept = self.caps().kept as usize;
                    snapshot::prune(place, &snapshot::whole(place), kept, &[&list.id]);
                }
                list
            }
            // A service, or a place gone, full or refusing: it waits on this computer, and nothing is
            // lost. To a service it is sent at once, when it can be.
            Err(Unmade::Io) if self.chosen() => {
                let list = snapshot::write_watched(&self.waiting(entry), &here, making(), &packed)
                    .map_err(refused)?;
                self.send_waiting(entry);
                list
            }
            Err(unmade) => return Err(refused(unmade)),
        };
        Ok(Some(list))
    }

    /// Puts a snapshot back (ADR 008, section 6). The caller has checked the game isn't running, and
    /// holds it (`begin`).
    pub fn restore(&self, entry: &str, id: &str, setup: &Setup, now: u64) -> Result<(), Refusal> {
        self.send_waiting(entry);
        let heads: Vec<String> = snapshot::heads(&self.lists(entry))
            .iter()
            .map(|head| head.id.clone())
            .collect();
        let result = self.put_back(entry, id, setup, now);
        match &result {
            Ok(list) => self.finished(
                entry,
                Did::Restored,
                None,
                Some(Known {
                    id: list.id.clone(),
                    content: list.content.clone(),
                }),
                now,
            ),
            Err(why) => self.finished(entry, Did::Failed, Some(*why), None, now),
        }
        let list = result?;
        // Going back to an older one is choosing it: a new snapshot of it, whose parents are every
        // latest one, so the next check doesn't take this PC forward again (ADR 008, section 5).
        if heads != [list.id.clone()] {
            let title = self.game(entry).title;
            let settled = self.make(entry, &title, setup, now, Some(heads))?;
            if let Some(settled) = settled {
                self.finished(
                    entry,
                    Did::Restored,
                    None,
                    Some(Known {
                        id: settled.id,
                        content: settled.content,
                    }),
                    now,
                );
            }
        }
        Ok(())
    }

    fn put_back(&self, entry: &str, id: &str, setup: &Setup, now: u64) -> Result<List, Refusal> {
        let list = self
            .lists(entry)
            .into_iter()
            .find(|list| list.id == id)
            .ok_or(Refusal::Missing)?;
        let archive = self
            .folder_of(entry, &list)
            .ok_or(Refusal::Missing)?
            .join(format!("{id}.zip"));
        let usable: Vec<&Location> = setup
            .locations
            .iter()
            .filter(|each| !each.refused)
            .collect();
        let targets = restore::plan(
            &list,
            |path| usable.iter().any(|location| location.holds(path)),
            |path| paths::here(path, &self.folders, &setup.game),
            self.caps().most_bytes(),
        )
        .map_err(|refused| match refused {
            restore::Refused::Large => Refusal::Large,
            _ => Refusal::Damaged,
        })?;
        if !restore::archive_whole(&archive, &list) {
            return Err(Refusal::Damaged);
        }
        self.board.set(entry, progress::Step::Restoring, 0, None);
        // What is here first, as it is: it goes back if anything goes wrong.
        let here = self.here(setup)?;
        let current: Vec<PathBuf> = here.files.iter().map(|(_, at)| at.clone()).collect();
        let backup = self.back_up_here(entry, &here, now)?;
        let mut touched = current.clone();
        touched.extend(targets.iter().map(|target| target.to.clone()));
        self.write_journal(&Journal {
            entry: entry.to_string(),
            backup: backup.clone(),
            files: here.files.clone(),
            touched,
        })
        .map_err(|_| Refusal::Failed)?;
        let staging = self.staging();
        let staged = restore::stage(&archive, &targets, &staging).map_err(|_| Refusal::Damaged);
        let placed = staged.and_then(|staged| {
            restore::put_in_place(&targets, &staged, &current).map_err(|_| Refusal::Failed)
        });
        if let Err(why) = placed {
            // Put back what was here, then say why.
            if self.undo().is_ok() {
                self.clear_journal();
            }
            return Err(why);
        }
        let _ = fs::remove_dir_all(&staging);
        self.clear_journal();
        for target in &targets {
            self.hashes.lock().unwrap().remove(&paths::key(&target.to));
        }
        Ok(list)
    }

    /// What is here, into this PC's backups, before a restore replaces it.
    fn back_up_here(&self, entry: &str, here: &Here, now: u64) -> Result<PathBuf, Refusal> {
        let folder = self.backups(entry);
        let list = snapshot::write(
            &folder,
            here,
            Making {
                entry,
                title: "",
                device: self.device.as_deref(),
                parents: vec![],
                created_at: now,
            },
        )
        .map_err(|unmade| match unmade {
            Unmade::Changed => Refusal::Changed,
            Unmade::Io => Refusal::Failed,
        })?;
        // Kept a while, and never fewer than the last few.
        let all = snapshot::whole(&folder);
        for (at, old) in all.iter().enumerate() {
            if at >= BACKUPS_AT_LEAST && now.saturating_sub(old.created_at) > BACKUPS_FOR_MS {
                let _ = fs::remove_file(folder.join(format!("{}.json", old.id)));
                let _ = fs::remove_file(folder.join(format!("{}.zip", old.id)));
            }
        }
        Ok(folder.join(format!("{}.zip", list.id)))
    }

    fn journal(&self) -> Option<Journal> {
        serde_json::from_slice(&fs::read(self.folder.join(JOURNAL)).ok()?).ok()
    }

    fn write_journal(&self, journal: &Journal) -> io::Result<()> {
        let next = self.folder.join("save-restore.json.next");
        fs::write(
            &next,
            serde_json::to_vec(journal).map_err(io::Error::other)?,
        )?;
        fs::rename(next, self.folder.join(JOURNAL))
    }

    fn clear_journal(&self) {
        let _ = fs::remove_file(self.folder.join(JOURNAL));
    }

    /// Puts back what a restore's backup holds, everything it touched taken back to that.
    fn undo(&self) -> io::Result<()> {
        let Some(journal) = self.journal() else {
            return Ok(());
        };
        let files: Vec<Target> = journal
            .files
            .into_iter()
            .map(|(item, to)| Target { item, to })
            .collect();
        restore::put_back_all(&journal.backup, &files, &journal.touched, &self.staging())
    }

    /// A restore the app ended in the middle of is undone, first thing at a start. Whether there was one.
    pub fn recover(&self) -> bool {
        if self.journal().is_none() {
            return false;
        }
        match self.undo() {
            Ok(()) => {
                self.clear_journal();
                true
            }
            Err(error) => {
                // Kept, so Play and every restore of the game keep waiting, and the next start tries again.
                eprintln!("could not undo a restore cut short: {error}");
                false
            }
        }
    }

    /// A snapshot's archive, for Explorer to show.
    pub fn archive(&self, entry: &str, id: &str) -> Option<PathBuf> {
        let list = self.lists(entry).into_iter().find(|list| list.id == id)?;
        Some(self.folder_of(entry, &list)?.join(format!("{id}.zip")))
    }

    /// The look before Play (ADR 008, section 7): section 5's table, done. The caller has checked the game
    /// isn't running, and holds it (`begin`).
    pub fn before_play(&self, entry: &str, setup: &Setup, now: u64) -> Checked {
        // Known without asking: a folder that isn't there, or a service not signed in to. A service that
        // was out of reach or full is asked again.
        match self.place_now() {
            Where::Folder(_, chosen) if !chosen.is_dir() => {
                return Checked::Unreachable {
                    why: Away::Unreachable,
                };
            }
            Where::Cloud(service) if !self.signed_in(service) => {
                return Checked::Unreachable {
                    why: Away::SignedOut,
                };
            }
            _ => {}
        }
        self.send_waiting(entry);
        let (lists, away) = self.lists_and_away(entry);
        if let Some(why) = away {
            return Checked::Unreachable { why };
        }
        let here = match self.here(setup) {
            Ok(here) => here,
            Err(why) => return Checked::Failed { why },
        };
        let kept = self.game(entry);
        let verdict = snapshot::decide(
            (!here.is_empty()).then_some(here.content.as_str()),
            kept.known.as_ref(),
            &lists,
        );
        match verdict {
            Verdict::Nothing | Verdict::InStep(_) => Checked::InStep,
            Verdict::BackUp => match self.back_up(entry, &kept.title, setup, now, None) {
                Ok(_) => Checked::BackedUp,
                Err(why) => Checked::Failed { why },
            },
            Verdict::Restore(id) => match self.restore(entry, &id, setup, now) {
                Ok(()) => Checked::Restored,
                Err(why) => Checked::Failed { why },
            },
            Verdict::Choose { .. } => Checked::Choose,
        }
    }

    /// The backup after a session (ADR 008, section 7): a snapshot unless what is here is known, made even
    /// when another PC has written since, as a new file destroys nothing. What needs the person, if
    /// anything. The caller has checked the game isn't running, and holds it (`begin`).
    pub fn after_session(&self, entry: &str, setup: &Setup, now: u64) -> Option<Needs> {
        let title = self.game(entry).title;
        match self.back_up(entry, &title, setup, now, None) {
            // Nothing found to back up is the page's to say: the person may never have set it up.
            Err(Refusal::Empty) | Ok(None) => None,
            Err(why) => Some(Needs::Failed(why)),
            Ok(Some(_))
                if self
                    .game(entry)
                    .last
                    .is_some_and(|last| last.did == Did::Waiting) =>
            {
                // Said with the game: the place's own notification needn't say it again.
                self.to_announce();
                Some(match self.away_now() {
                    Some(Away::SignedOut) => Needs::SignedOut,
                    Some(Away::Full) => Needs::Full,
                    _ => Needs::Waiting,
                })
            }
            Ok(Some(_)) if snapshot::heads(&self.lists(entry)).len() > 1 => Some(Needs::Choice),
            Ok(Some(_)) => None,
        }
    }

    /// Settles a choice (ADR 008, section 5): keeps this PC's saves (`None`) or one of the latest
    /// snapshots, and writes a new snapshot of it whose parents are every latest one, so every PC sees
    /// it settled. The copy not chosen stays in the history. The caller has checked the game isn't
    /// running, and holds it (`begin`).
    pub fn keep(
        &self,
        entry: &str,
        title: &str,
        setup: &Setup,
        now: u64,
        keep: Option<&str>,
    ) -> Result<(), Refusal> {
        self.send_waiting(entry);
        let heads: Vec<String> = snapshot::heads(&self.lists(entry))
            .iter()
            .map(|head| head.id.clone())
            .collect();
        match keep {
            None => self
                .back_up(entry, title, setup, now, Some(heads))
                .map(|_| ()),
            Some(id) if heads.iter().any(|head| head == id) => self.restore(entry, id, setup, now),
            Some(_) => Err(Refusal::Invalid),
        }
    }
}

/// The folder Shelf keeps in a folder chosen: `Shelf saves` in it, unless that is the one chosen.
fn root_in(chosen: &Path) -> PathBuf {
    let named = chosen
        .file_name()
        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case(PLACE_NAME));
    if named {
        chosen.to_path_buf()
    } else {
        chosen.join(PLACE_NAME)
    }
}

/// A title as it is kept in a list: a page's words, cut short.
fn short_title(title: &str) -> String {
    title.chars().take(200).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::saves::paths::tests::{computer, folder, put};

    fn entry_with(files: &[&str]) -> Entry {
        Entry {
            title: "A Game".into(),
            steam: vec![1000001],
            install_dirs: vec!["A Game".into()],
            files: files.iter().map(|file| file.to_string()).collect(),
            registry: false,
            cloud: vec![],
        }
    }

    fn lookup_with(files: &[&str]) -> Lookup {
        Lookup::new(manifest::Index {
            version: 1,
            games: vec![entry_with(files)],
            ..manifest::Index::default()
        })
    }

    struct Pc {
        root: PathBuf,
        saves: Saves,
        exe: PathBuf,
        lookup: Lookup,
    }

    impl Pc {
        fn new(name: &str, device: &str, files: &[&str]) -> Pc {
            let root = folder(name);
            let (mut folders, game) = computer(&root);
            let app = folders.app.clone().unwrap();
            folders.app = Some(app.clone());
            let exe = game.base.clone().unwrap().join("bin").join("game.exe");
            put(&exe, "a game");
            Pc {
                saves: Saves::open(&app, folders, Some(device.into())),
                root,
                exe,
                lookup: lookup_with(files),
            }
        }

        fn setup(&self) -> Setup {
            self.saves.setup(
                "entry-1",
                Some(&self.exe),
                Some(&self.lookup),
                "A Game",
                &[],
            )
        }

        fn app_data(&self) -> PathBuf {
            self.saves.folders.app_data.clone().unwrap()
        }
    }

    impl Drop for Pc {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[test]
    fn a_page_is_told_in_the_words_its_schema_reads() {
        // `src/features/desktop/saves.ts` reads this shape: a name changed here breaks the page.
        let pc = Pc::new("saves-shape", "dev1", &["<winAppData>/A Game"]);
        put(&pc.app_data().join("A Game").join("slot1.sav"), "one");
        let setup = pc.setup();
        pc.saves
            .back_up("entry-1", "A Game", &setup, 1000, None)
            .unwrap();
        let told = serde_json::to_value(pc.saves.view("entry-1", &setup, true)).unwrap();
        let mut keys: Vec<&String> = told.as_object().unwrap().keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "away",
                "base",
                "busy",
                "bytes",
                "caps",
                "changedAt",
                "cloud",
                "files",
                "heads",
                "last",
                "locations",
                "manifest",
                "matched",
                "on",
                "others",
                "place",
                "reachable",
                "registry",
                "service",
                "snapshots",
                "state"
            ]
        );
        assert_eq!(told["state"], "in-step");
        assert_eq!(
            told["caps"],
            serde_json::json!({ "mostMb": 500, "kept": 20 })
        );
        assert_eq!(told["last"]["did"], "backed-up");
        let location = told["locations"][0].as_object().unwrap();
        let mut keys: Vec<&String> = location.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            ["added", "bytes", "files", "refused", "shown", "text"]
        );
        let snapshot = told["snapshots"][0].as_object().unwrap();
        let mut keys: Vec<&String> = snapshot.keys().collect();
        keys.sort();
        assert_eq!(
            keys,
            [
                "bytes",
                "createdAt",
                "device",
                "files",
                "here",
                "id",
                "waiting"
            ]
        );
        assert_eq!(snapshot["device"], "dev1");
        assert_eq!(
            serde_json::to_value(Refusal::Outside).unwrap(),
            serde_json::json!("outside")
        );
    }

    /// Two made-up PCs, each its own folders, sharing one place, as two PCs share a synced folder.
    fn two_pcs(name: &str) -> (Pc, Pc, PathBuf) {
        let one = Pc::new(&format!("{name}-one"), "one", &["<winAppData>/A Game"]);
        let two = Pc::new(&format!("{name}-two"), "two", &["<winAppData>/A Game"]);
        let shared = folder(&format!("{name}-shared"));
        one.saves.choose_place(&shared).unwrap();
        two.saves.choose_place(&shared).unwrap();
        (one, two, shared)
    }

    fn slot(pc: &Pc) -> PathBuf {
        pc.app_data().join("A Game").join("slot1.sav")
    }

    fn state(pc: &Pc) -> State {
        pc.saves.view("entry-1", &pc.setup(), true).state
    }

    fn latest(pc: &Pc) -> String {
        pc.saves.lists("entry-1")[0].id.clone()
    }

    #[test]
    fn played_on_one_pc_then_opened_on_another_it_starts_with_the_first_s_progress() {
        let (one, two, shared) = two_pcs("saves-two");
        put(&slot(&one), "chapter one");
        let first = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 1000, None)
            .unwrap()
            .unwrap();
        assert!(
            shared
                .join(PLACE_NAME)
                .join("entry-1")
                .join(format!("{}.zip", first.id))
                .is_file()
        );
        // The second PC has nothing of its own: the place's is put here.
        assert_eq!(state(&two), State::Behind);
        two.saves
            .restore("entry-1", &first.id, &two.setup(), 2000)
            .unwrap();
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "chapter one");
        assert_eq!(state(&two), State::InStep);
        // Played further on the first: the second is behind, and takes it.
        put(&slot(&one), "chapter two");
        let second = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 3000, None)
            .unwrap()
            .unwrap();
        assert_eq!(state(&two), State::Behind);
        two.saves
            .restore("entry-1", &second.id, &two.setup(), 4000)
            .unwrap();
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "chapter two");
        // Taking the latest writes nothing new: it is already the latest.
        assert_eq!(latest(&two), second.id);
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn played_on_both_without_a_backup_between_is_a_choice_and_nothing_is_lost() {
        let (one, two, shared) = two_pcs("saves-both");
        put(&slot(&one), "start");
        let first = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 1000, None)
            .unwrap()
            .unwrap();
        two.saves
            .restore("entry-1", &first.id, &two.setup(), 1500)
            .unwrap();
        put(&slot(&one), "one went left");
        let left = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 2000, None)
            .unwrap()
            .unwrap();
        put(&slot(&two), "two went right");
        // Both moved: never a silent overwrite.
        assert_eq!(state(&two), State::Choose);
        let view = two.saves.view("entry-1", &two.setup(), true);
        assert_eq!(view.heads, std::slice::from_ref(&left.id));
        assert!(view.changed_at.is_some());
        // Keeping this PC's writes it as the latest, after the other's.
        two.saves
            .keep("entry-1", "A Game", &two.setup(), 3000, None)
            .unwrap();
        let kept = two.saves.lists("entry-1")[0].clone();
        assert_eq!(kept.parents, std::slice::from_ref(&left.id));
        assert_eq!(state(&two), State::InStep);
        // The first PC follows, and the copy not chosen is still in the history.
        assert_eq!(state(&one), State::Behind);
        one.saves
            .restore("entry-1", &kept.id, &one.setup(), 4000)
            .unwrap();
        assert_eq!(fs::read_to_string(slot(&one)).unwrap(), "two went right");
        assert!(
            one.saves
                .lists("entry-1")
                .iter()
                .any(|list| list.id == left.id)
        );
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn two_latest_snapshots_are_a_choice_settled_for_every_pc() {
        let (one, two, shared) = two_pcs("saves-forked");
        put(&slot(&one), "start");
        let first = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 1000, None)
            .unwrap()
            .unwrap();
        two.saves
            .restore("entry-1", &first.id, &two.setup(), 1500)
            .unwrap();
        put(&slot(&one), "one's");
        put(&slot(&two), "two's");
        let ones = one
            .saves
            .back_up("entry-1", "A Game", &one.setup(), 2000, None)
            .unwrap()
            .unwrap();
        let twos = two
            .saves
            .back_up("entry-1", "A Game", &two.setup(), 2100, None)
            .unwrap()
            .unwrap();
        // Two PCs backed up from the same snapshot: two latest, and a choice on both.
        assert_eq!(state(&one), State::Choose);
        assert_eq!(state(&two), State::Choose);
        assert_eq!(
            one.saves
                .keep("entry-1", "A Game", &one.setup(), 3000, Some("not-a-head")),
            Err(Refusal::Invalid)
        );
        // The first PC keeps the second's: it is put here, and settled for both.
        one.saves
            .keep("entry-1", "A Game", &one.setup(), 3000, Some(&twos.id))
            .unwrap();
        assert_eq!(fs::read_to_string(slot(&one)).unwrap(), "two's");
        let settled = one.saves.lists("entry-1")[0].clone();
        let mut parents = settled.parents.clone();
        parents.sort();
        let mut expected = vec![ones.id.clone(), twos.id.clone()];
        expected.sort();
        assert_eq!(parents, expected);
        assert_eq!(state(&one), State::InStep);
        assert_eq!(state(&two), State::InStep);
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn a_place_that_can_t_be_reached_keeps_the_snapshot_here_until_it_can() {
        let pc = Pc::new("saves-away", "dev1", &["<winAppData>/A Game"]);
        let drive = folder("saves-away-drive");
        pc.saves.choose_place(&drive).unwrap();
        fs::remove_dir_all(&drive).unwrap();
        assert!(!pc.saves.place_view().reachable);
        put(&slot(&pc), "made while away");
        let made = pc
            .saves
            .back_up("entry-1", "A Game", &pc.setup(), 1000, None)
            .unwrap()
            .unwrap();
        assert_eq!(pc.saves.game("entry-1").last.unwrap().did, Did::Waiting);
        let view = pc.saves.view("entry-1", &pc.setup(), true);
        assert!(!view.reachable);
        assert!(!view.service);
        assert_eq!(view.snapshots.len(), 1);
        // The page says it isn't there yet.
        assert!(view.snapshots[0].waiting);
        // The drive is back: what waited goes there.
        fs::create_dir_all(&drive).unwrap();
        let view = pc.saves.view("entry-1", &pc.setup(), true);
        assert!(!view.snapshots[0].waiting);
        let there = drive.join(PLACE_NAME).join("entry-1");
        assert!(there.join(format!("{}.json", made.id)).is_file());
        assert!(snapshot::whole(&pc.saves.waiting("entry-1")).is_empty());
        let _ = fs::remove_dir_all(drive);
    }

    #[test]
    fn choosing_a_place_takes_this_pc_s_history_along_and_never_a_system_folder() {
        let pc = Pc::new("saves-along", "dev1", &["<winAppData>/A Game"]);
        put(&slot(&pc), "kept here first");
        let made = pc
            .saves
            .back_up("entry-1", "A Game", &pc.setup(), 1000, None)
            .unwrap()
            .unwrap();
        let drive = folder("saves-along-drive");
        let named = drive.join(PLACE_NAME);
        fs::create_dir_all(&named).unwrap();
        // A folder already named for Shelf is used as it is.
        let place = pc.saves.choose_place(&named).unwrap();
        assert_eq!(place.folder, Some(named.display().to_string()));
        assert!(
            named
                .join("entry-1")
                .join(format!("{}.zip", made.id))
                .is_file()
        );
        assert!(named.join("entry-1").join("game.json").is_file());
        assert_eq!(pc.saves.lists("entry-1").len(), 1);
        let windows = pc.saves.folders.windows.clone().unwrap();
        fs::create_dir_all(&windows).unwrap();
        assert_eq!(pc.saves.choose_place(&windows).err(), Some(Refusal::Wide));
        pc.saves.forget_place().unwrap();
        assert_eq!(pc.saves.place_view().folder, None);
        let _ = fs::remove_dir_all(drive);
    }

    #[test]
    fn the_game_s_folder_is_found_above_its_file() {
        let file = Path::new("D:\\Games\\A Game\\Binaries\\Win64\\game.exe");
        assert_eq!(
            base_of(file, &["a game".into()]),
            Some(PathBuf::from("D:\\Games\\A Game"))
        );
        assert_eq!(
            base_of(file, &[]),
            Some(PathBuf::from("D:\\Games\\A Game\\Binaries\\Win64"))
        );
    }

    #[test]
    fn the_manifest_s_locations_are_found_for_the_game() {
        let pc = Pc::new(
            "saves-setup",
            "dev1",
            &["<winAppData>/<game>/saves", "<base>/*.sav", "<base>"],
        );
        put(
            &pc.app_data().join("A Game").join("saves").join("slot1.sav"),
            "one",
        );
        put(
            &pc.exe.parent().unwrap().parent().unwrap().join("auto.sav"),
            "auto",
        );
        let setup = pc.setup();
        assert_eq!(setup.game.base, Some(pc.root.join("Games").join("A Game")));
        assert_eq!(setup.locations.len(), 3);
        assert!(!setup.locations[0].files_only && !setup.locations[0].refused);
        // The game's own folder is the game's only through the files its pattern names.
        assert!(setup.locations[1].files_only);
        // And never whole: a restore would take the game away.
        assert!(setup.locations[2].refused);
        let here = pc.saves.here(&setup).unwrap();
        let paths: Vec<&str> = here
            .files
            .iter()
            .map(|(item, _)| item.path.as_str())
            .collect();
        assert_eq!(
            paths,
            ["<base>/auto.sav", "<winAppData>/A Game/saves/slot1.sav"]
        );
        assert!(!setup.locations[1].holds("<base>/bin/game.exe"));
        assert!(setup.locations[1].holds("<base>/other.sav"));
        assert!(!setup.locations[1].holds("<base>/deeper/other.sav"));
    }

    #[test]
    fn back_up_then_change_then_restore_the_first() {
        let pc = Pc::new("saves-cycle", "dev1", &["<winAppData>/A Game"]);
        let slot = pc.app_data().join("A Game").join("slot1.sav");
        put(&slot, "chapter one");
        let setup = pc.setup();
        let busy = pc.saves.begin("entry-1").unwrap();
        assert_eq!(pc.saves.begin("entry-1").err(), Some(Refusal::Busy));
        let first = pc
            .saves
            .back_up("entry-1", "A Game", &setup, 1000, None)
            .unwrap()
            .unwrap();
        // The page saw the archive written, every byte of the saves counted.
        let packed = pc.saves.board.of("entry-1").unwrap();
        assert_eq!(packed.step, progress::Step::Packing);
        assert_eq!(packed.total, Some("chapter one".len() as u64));
        assert_eq!(packed.done, "chapter one".len() as u64);
        // Unchanged: no new snapshot.
        assert_eq!(
            pc.saves
                .back_up("entry-1", "A Game", &setup, 2000, None)
                .unwrap(),
            None
        );
        put(&slot, "chapter two");
        put(
            &pc.app_data().join("A Game").join("slot2.sav"),
            "a new slot",
        );
        let second = pc
            .saves
            .back_up("entry-1", "A Game", &setup, 3000, None)
            .unwrap()
            .unwrap();
        assert_eq!(second.parents, std::slice::from_ref(&first.id));
        pc.saves
            .restore("entry-1", &first.id, &setup, 4000)
            .unwrap();
        assert!(pc.saves.board.of("entry-1").is_some());
        // Letting go of the game clears what the page is shown.
        drop(busy);
        assert_eq!(pc.saves.board.of("entry-1"), None);
        assert_eq!(fs::read_to_string(&slot).unwrap(), "chapter one");
        assert!(!pc.app_data().join("A Game").join("slot2.sav").exists());
        // Going back to the first made it the latest: a new snapshot of it, after the second.
        let known = pc.saves.game("entry-1").known.unwrap();
        assert_eq!(known.content, first.content);
        let latest = snapshot::whole(&pc.saves.place("entry-1"));
        assert_eq!(latest[0].id, known.id);
        assert_eq!(latest[0].parents, std::slice::from_ref(&second.id));
        // What was here went to a backup first.
        let backups = snapshot::whole(&pc.saves.backups("entry-1"));
        assert_eq!(backups.len(), 1);
        assert_eq!(backups[0].content, second.content);
        let view = pc.saves.view("entry-1", &setup, true);
        assert_eq!(view.snapshots.len(), 3);
        assert!(
            view.snapshots
                .iter()
                .find(|each| each.id == first.id)
                .unwrap()
                .here
        );
        assert_eq!(view.state, State::InStep);
        put(&slot, "chapter three");
        assert_eq!(pc.saves.view("entry-1", &setup, true).state, State::Changed);
    }

    #[test]
    fn nothing_to_back_up_and_too_much_are_said() {
        let pc = Pc::new("saves-refused", "dev1", &["<winAppData>/A Game"]);
        let setup = pc.setup();
        assert_eq!(
            pc.saves.back_up("entry-1", "A Game", &setup, 1, None),
            Err(Refusal::Empty)
        );
        pc.saves
            .set_caps(Caps {
                most_mb: 10,
                kept: 1,
            })
            .unwrap();
        assert_eq!(pc.saves.caps().kept, Caps::FEWEST_KEPT);
        let big = pc.app_data().join("A Game").join("big.sav");
        fs::create_dir_all(big.parent().unwrap()).unwrap();
        fs::File::create(&big)
            .unwrap()
            .set_len(11 * 1024 * 1024)
            .unwrap();
        assert_eq!(
            pc.saves.back_up("entry-1", "A Game", &setup, 2, None),
            Err(Refusal::Large)
        );
        assert_eq!(
            pc.saves.game("entry-1").last.unwrap().why,
            Some(Refusal::Large)
        );
    }

    #[test]
    fn a_restore_cut_short_is_undone_at_the_next_start() {
        let pc = Pc::new("saves-journal", "dev1", &["<winAppData>/A Game"]);
        let slot = pc.app_data().join("A Game").join("slot1.sav");
        put(&slot, "what was here");
        let setup = pc.setup();
        let here = pc.saves.here(&setup).unwrap();
        let backup = pc.saves.back_up_here("entry-1", &here, 5).unwrap();
        // The app ended with the restore half done: one file written over, another added.
        let extra = pc.app_data().join("A Game").join("half.sav");
        pc.saves
            .write_journal(&Journal {
                entry: "entry-1".into(),
                backup,
                files: here.files.clone(),
                touched: vec![slot.clone(), extra.clone()],
            })
            .unwrap();
        put(&slot, "half of another");
        put(&extra, "half");
        assert!(pc.saves.is_busy("entry-1"));
        let again = Saves::open(
            &pc.saves.folder,
            pc.saves.folders.clone(),
            Some("dev1".into()),
        );
        assert!(again.recover());
        assert_eq!(fs::read_to_string(&slot).unwrap(), "what was here");
        assert!(!extra.exists());
        assert!(!again.is_busy("entry-1"));
    }

    #[test]
    fn a_folder_picked_must_be_the_game_s_and_mean_something_elsewhere() {
        let pc = Pc::new("saves-add", "dev1", &[]);
        let setup = pc.setup();
        assert_eq!(
            pc.saves.add("entry-1", &pc.app_data(), &setup),
            Err(Refusal::Wide)
        );
        assert_eq!(
            pc.saves
                .add("entry-1", Path::new("Q:\\Elsewhere\\Saves"), &setup),
            Err(Refusal::Outside)
        );
        // The game's own folder, and one above it, hold the game: a restore there could take it away.
        let base = setup.game.base.clone().unwrap();
        let base = base.as_path();
        assert_eq!(
            pc.saves.add("entry-1", base, &setup),
            Err(Refusal::GameFolder)
        );
        assert_eq!(
            pc.saves.add("entry-1", base.parent().unwrap(), &setup),
            Err(Refusal::GameFolder)
        );
        let documents = pc
            .saves
            .folders
            .documents
            .clone()
            .unwrap()
            .join("My Games")
            .join("A Game");
        pc.saves.add("entry-1", &documents, &setup).unwrap();
        assert_eq!(
            pc.saves.game("entry-1").added,
            ["<winDocuments>/My Games/A Game"]
        );
        put(&documents.join("1.sav"), "one");
        assert_eq!(pc.saves.here(&pc.setup()).unwrap().files.len(), 1);
        pc.saves
            .remove("entry-1", "<winDocuments>/My Games/A Game")
            .unwrap();
        assert!(pc.saves.game("entry-1").added.is_empty());
    }

    // --- By itself (phase 4): before Play and after a session --------------------------------------

    fn before(pc: &Pc, now: u64) -> Checked {
        pc.saves.before_play("entry-1", &pc.setup(), now)
    }

    fn after(pc: &Pc, now: u64) -> Option<Needs> {
        pc.saves.after_session("entry-1", &pc.setup(), now)
    }

    #[test]
    fn play_takes_another_pc_s_progress_and_the_session_after_backs_up_what_changed() {
        let (one, two, shared) = two_pcs("saves-auto");
        put(&slot(&one), "chapter one");
        assert_eq!(after(&one, 1000), None);
        assert_eq!(one.saves.lists("entry-1").len(), 1);
        // The second PC has nothing of its own: Play puts the first's here.
        assert_eq!(before(&two, 2000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "chapter one");
        assert_eq!(before(&two, 2100), Checked::InStep);
        put(&slot(&two), "chapter two");
        assert_eq!(after(&two, 3000), None);
        // Back on the first: Play takes the second's.
        assert_eq!(before(&one, 4000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&one)).unwrap(), "chapter two");
        // A session that changed nothing makes nothing.
        assert_eq!(after(&one, 5000), None);
        assert_eq!(one.saves.lists("entry-1").len(), 2);
        assert_eq!(state(&one), State::InStep);
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn played_on_both_the_session_after_says_a_choice_waits_and_play_stops_for_it() {
        let (one, two, shared) = two_pcs("saves-auto-both");
        put(&slot(&one), "start");
        after(&one, 1000);
        assert_eq!(before(&two, 2000), Checked::Restored);
        put(&slot(&one), "the first's");
        assert_eq!(after(&one, 3000), None);
        // The second played without a look first, from a shortcut.
        put(&slot(&two), "the second's");
        assert_eq!(after(&two, 4000), Some(Needs::Choice));
        // Play waits on both, and nothing was put back.
        assert_eq!(before(&two, 5000), Checked::Choose);
        assert_eq!(before(&one, 5000), Checked::Choose);
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "the second's");
        assert_eq!(fs::read_to_string(slot(&one)).unwrap(), "the first's");
        // Settled on the first: the second's next Play takes it.
        let _busy = one.saves.begin("entry-1").unwrap();
        one.saves
            .keep("entry-1", "A Game", &one.setup(), 6000, None)
            .unwrap();
        assert_eq!(before(&two, 7000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "the first's");
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn another_pc_s_newer_snapshot_is_no_reason_to_copy_what_is_here_again() {
        let (one, two, shared) = two_pcs("saves-auto-same");
        put(&slot(&one), "start");
        after(&one, 1000);
        before(&two, 2000);
        put(&slot(&one), "further");
        after(&one, 3000);
        // The second opened the game and played nothing: nothing to back up, and no choice made of it.
        assert_eq!(after(&two, 4000), None);
        assert_eq!(snapshot::heads(&two.saves.lists("entry-1")).len(), 1);
        assert_eq!(before(&two, 5000), Checked::Restored);
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn a_place_out_of_reach_starts_the_game_with_what_is_here_and_the_backup_waits() {
        let pc = Pc::new("saves-auto-away", "dev1", &["<winAppData>/A Game"]);
        let drive = folder("saves-auto-away-drive");
        pc.saves.choose_place(&drive).unwrap();
        put(&slot(&pc), "before");
        after(&pc, 1000);
        fs::remove_dir_all(&drive).unwrap();
        assert_eq!(
            before(&pc, 2000),
            Checked::Unreachable {
                why: Away::Unreachable
            }
        );
        assert_eq!(fs::read_to_string(slot(&pc)).unwrap(), "before");
        put(&slot(&pc), "while away");
        assert_eq!(after(&pc, 3000), Some(Needs::Waiting));
        let _ = fs::remove_dir_all(drive);
    }

    #[test]
    fn a_damaged_snapshot_is_never_put_back_and_play_says_why() {
        let (one, two, shared) = two_pcs("saves-auto-damaged");
        put(&slot(&one), "chapter one");
        after(&one, 1000);
        let id = latest(&one);
        let archive = shared
            .join(PLACE_NAME)
            .join("entry-1")
            .join(format!("{id}.zip"));
        // As long as it was, and not what its list says.
        let length = fs::metadata(&archive).unwrap().len() as usize;
        fs::write(&archive, vec![b'x'; length]).unwrap();
        // The second PC has nothing of its own, so it would take the first's.
        assert_eq!(
            before(&two, 2000),
            Checked::Failed {
                why: Refusal::Damaged
            }
        );
        assert!(!slot(&two).exists());
        let _ = fs::remove_dir_all(shared);
    }

    #[test]
    fn what_a_page_named_a_game_by_is_kept_for_when_no_page_asks() {
        let pc = Pc::new("saves-remember", "dev1", &["<winAppData>/A Game"]);
        // Not a game set up here: nothing is written for it.
        pc.saves.remember("entry-1", "A Game", &["1000001".into()]);
        assert!(pc.saves.game("entry-1").apps.is_empty());
        pc.saves.set_on("entry-1", true, "A Game").unwrap();
        pc.saves
            .remember("entry-1", "A Game: Remastered", &["1000001".into()]);
        let kept = pc.saves.game("entry-1");
        assert_eq!(kept.title, "A Game: Remastered");
        assert_eq!(kept.apps, ["1000001"]);
        assert_eq!(
            serde_json::to_value(Checked::Failed {
                why: Refusal::Damaged
            })
            .unwrap(),
            serde_json::json!({ "did": "failed", "why": "damaged" })
        );
        assert_eq!(
            serde_json::to_value(Checked::InStep).unwrap(),
            serde_json::json!({ "did": "in-step" })
        );
    }

    // --- Through a service (phase 5) -----------------------------------------------------------------

    use remote::double::InMemory;

    /// Two made-up PCs, each its own folders, signed in to one made-up service.
    fn two_on_a_service(name: &str) -> (Pc, Pc, Arc<InMemory>) {
        let service = Arc::new(InMemory::default());
        let mut one = Pc::new(&format!("{name}-one"), "one", &["<winAppData>/A Game"]);
        let mut two = Pc::new(&format!("{name}-two"), "two", &["<winAppData>/A Game"]);
        one.saves.add_remote(Service::OneDrive, service.clone());
        two.saves.add_remote(Service::OneDrive, service.clone());
        one.saves.choose_cloud(Service::OneDrive).unwrap();
        two.saves.choose_cloud(Service::OneDrive).unwrap();
        (one, two, service)
    }

    #[test]
    fn through_a_service_play_takes_another_pc_s_progress_and_nothing_waits_here() {
        let (one, two, service) = two_on_a_service("saves-cloud");
        put(&slot(&one), "chapter one");
        assert_eq!(after(&one, 1000), None);
        assert_eq!(one.saves.game("entry-1").last.unwrap().did, Did::BackedUp);
        assert!(snapshot::whole(&one.saves.waiting("entry-1")).is_empty());
        assert_eq!(service.names("entry-1").len(), 3);
        assert_eq!(before(&two, 2000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "chapter one");
        put(&slot(&two), "chapter two");
        assert_eq!(after(&two, 3000), None);
        assert_eq!(before(&one, 4000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&one)).unwrap(), "chapter two");
        let view = one.saves.view("entry-1", &one.setup(), true);
        assert_eq!(view.place.as_deref(), Some("OneDrive"));
        assert!(view.service);
        assert!(view.reachable);
        assert_eq!(view.state, State::InStep);
        // Both PCs' snapshots, every one of them in the service.
        assert_eq!(view.snapshots.len(), 2);
        assert!(view.snapshots.iter().all(|snapshot| !snapshot.waiting));
    }

    #[test]
    fn a_service_out_of_reach_keeps_the_snapshot_here_and_sends_it_once_it_answers() {
        let (one, two, service) = two_on_a_service("saves-cloud-away");
        put(&slot(&one), "before");
        after(&one, 1000);
        *service.away.lock().unwrap() = Some(Away::Unreachable);
        assert_eq!(
            before(&one, 2000),
            Checked::Unreachable {
                why: Away::Unreachable
            }
        );
        put(&slot(&one), "while away");
        assert_eq!(after(&one, 3000), Some(Needs::Waiting));
        assert_eq!(snapshot::whole(&one.saves.waiting("entry-1")).len(), 1);
        let view = one.saves.view("entry-1", &one.setup(), true);
        assert_eq!(view.away, Some(Away::Unreachable));
        // Only what waits here is seen while it is away, as with a folder that isn't there.
        assert_eq!(view.snapshots.len(), 1);
        // Back: the next look sends it, and the other PC takes it.
        *service.away.lock().unwrap() = None;
        assert_eq!(before(&one, 4000), Checked::InStep);
        assert!(snapshot::whole(&one.saves.waiting("entry-1")).is_empty());
        assert_eq!(before(&two, 5000), Checked::Restored);
        assert_eq!(fs::read_to_string(slot(&two)).unwrap(), "while away");
    }

    #[test]
    fn a_service_that_no_longer_takes_the_sign_in_says_so_and_loses_nothing() {
        let (one, _two, service) = two_on_a_service("saves-cloud-out");
        *service.away.lock().unwrap() = Some(Away::SignedOut);
        put(&slot(&one), "made signed out");
        assert_eq!(after(&one, 1000), Some(Needs::SignedOut));
        assert_eq!(one.saves.place_view().away, Some(Away::SignedOut));
        assert_eq!(
            before(&one, 2000),
            Checked::Unreachable {
                why: Away::SignedOut
            }
        );
        *service.away.lock().unwrap() = Some(Away::Full);
        put(&slot(&one), "made when full");
        assert_eq!(after(&one, 3000), Some(Needs::Full));
        assert_eq!(snapshot::whole(&one.saves.waiting("entry-1")).len(), 2);
        // Room again: the next Play asks, and sends what waited.
        *service.away.lock().unwrap() = None;
        assert_eq!(before(&one, 4000), Checked::InStep);
        assert!(snapshot::whole(&one.saves.waiting("entry-1")).is_empty());
    }

    #[test]
    fn what_a_service_needs_of_the_person_is_said_once_until_it_passes() {
        let (one, _two, service) = two_on_a_service("saves-cloud-told");
        assert_eq!(one.saves.to_announce(), None);
        *service.away.lock().unwrap() = Some(Away::SignedOut);
        before(&one, 1000);
        assert_eq!(
            one.saves.to_announce(),
            Some((Service::OneDrive, Away::SignedOut))
        );
        assert_eq!(one.saves.to_announce(), None);
        // A line down passes by itself, and isn't said; what comes after it is said again.
        *service.away.lock().unwrap() = Some(Away::Unreachable);
        before(&one, 2000);
        assert_eq!(one.saves.to_announce(), None);
        // Said with a game's backup, it isn't said again by itself.
        *service.away.lock().unwrap() = Some(Away::Full);
        put(&slot(&one), "made when full");
        assert_eq!(after(&one, 3000), Some(Needs::Full));
        assert_eq!(one.saves.to_announce(), None);
    }

    #[test]
    fn choosing_a_service_takes_this_pc_s_history_along_and_the_caps_hold_there() {
        let service = Arc::new(InMemory::default());
        let mut pc = Pc::new("saves-cloud-history", "dev1", &["<winAppData>/A Game"]);
        pc.saves.add_remote(Service::GoogleDrive, service.clone());
        for (at, text) in [(1000, "one"), (2000, "two"), (3000, "three")] {
            put(&slot(&pc), text);
            after(&pc, at);
        }
        assert_eq!(pc.saves.lists("entry-1").len(), 3);
        assert!(service.names("entry-1").is_empty());
        pc.saves.choose_cloud(Service::GoogleDrive).unwrap();
        // Waiting here until sent, and counted meanwhile.
        assert_eq!(pc.saves.lists("entry-1").len(), 3);
        pc.saves.send_all_waiting();
        assert_eq!(service.names("entry-1").len(), 7);
        pc.saves
            .set_caps(Caps {
                most_mb: 500,
                kept: 3,
            })
            .unwrap();
        put(&slot(&pc), "four");
        after(&pc, 4000);
        let there = pc.saves.lists("entry-1");
        assert_eq!(there.len(), 3);
        assert!(there.iter().all(|list| list.created_at >= 2000));
        // Back to this computer alone: what is there stays there.
        pc.saves.forget_place().unwrap();
        assert_eq!(service.names("entry-1").len(), 7);
    }

    #[test]
    fn a_service_not_signed_in_can_t_be_chosen() {
        let pc = Pc::new("saves-cloud-unset", "dev1", &["<winAppData>/A Game"]);
        assert_eq!(
            pc.saves.choose_cloud(Service::OneDrive).map(|_| ()),
            Err(Refusal::Unset)
        );
        assert!(pc.saves.place_view().cloud.is_none());
    }
}
