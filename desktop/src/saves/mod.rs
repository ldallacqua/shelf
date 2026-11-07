//! A game's saves, carried in snapshots (ADR 008). What was decided for each game is `saves.json`, by
//! entry id, in the app's folder; snapshots go to this PC's place, which until one is chosen is the
//! app's own `saves\` folder. Shelf's server never sees any of it.

pub mod manifest;
pub mod paths;
pub mod restore;
pub mod snapshot;

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use manifest::{Entry, Lookup};
use paths::{Folders, GameAt, Pattern};
use restore::Target;
use snapshot::{Here, Item, Known, List, Making, Unmade, Verdict};

const FILE: &str = "saves.json";
const JOURNAL: &str = "save-restore.json";
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
    pub state: State,
    pub last: Option<Last>,
    pub busy: bool,
    pub caps: Caps,
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
        }
    }

    fn save(&self, kept: &Kept) -> io::Result<()> {
        fs::create_dir_all(&self.folder)?;
        let next = self.folder.join("saves.json.next");
        let text = serde_json::to_string_pretty(&Kept {
            version: 1,
            caps: kept.caps,
            games: kept.games.clone(),
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

    /// Where this PC's snapshots of a game go. Until a place is chosen, the app's own folder.
    pub fn place(&self, entry: &str) -> PathBuf {
        self.folder.join("saves").join(entry)
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
        let lists = snapshot::whole(&self.place(entry));
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
        let snapshots = lists
            .into_iter()
            .map(|list| SnapshotView {
                here: here
                    .as_ref()
                    .is_some_and(|here| here.content == list.content),
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
            state,
            last: kept.last,
            busy: self.is_busy(entry),
            caps: self.caps(),
        }
    }

    pub fn set_on(&self, entry: &str, on: bool, title: &str) -> Result<(), Refusal> {
        self.change(entry, |game| {
            game.on = on;
            game.title = short_title(title);
        })
    }

    pub fn choose_manifest(&self, entry: &str, title: Option<String>) -> Result<(), Refusal> {
        self.change(entry, |game| game.manifest = title)
    }

    /// A folder the person picked for the game's saves, refused if it is too wide or outside every
    /// folder a placeholder names.
    pub fn add(&self, entry: &str, folder: &Path, setup: &Setup) -> Result<(), Refusal> {
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
                Did::BackedUp,
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
        let here = self.here(setup)?;
        if here.is_empty() {
            return Err(Refusal::Empty);
        }
        let place = self.place(entry);
        let lists = snapshot::whole(&place);
        let settling = parents.is_some();
        let known = self.game(entry).known;
        if !settling
            && lists
                .first()
                .is_some_and(|latest| latest.content == here.content)
        {
            return Ok(None);
        }
        let parents =
            parents.unwrap_or_else(|| known.iter().map(|known| known.id.clone()).collect());
        let title = short_title(title);
        self.write_game_file(&place, entry, &title);
        let list = snapshot::write(
            &place,
            &here,
            Making {
                entry,
                title: &title,
                device: self.device.as_deref(),
                parents,
                created_at: now,
            },
        )
        .map_err(|unmade| match unmade {
            Unmade::Changed => Refusal::Changed,
            Unmade::Io => Refusal::Failed,
        })?;
        let kept = self.caps().kept as usize;
        snapshot::prune(&place, &snapshot::whole(&place), kept, &[&list.id]);
        Ok(Some(list))
    }

    /// Puts a snapshot back (ADR 008, section 6). The caller has checked the game isn't running, and
    /// holds it (`begin`).
    pub fn restore(&self, entry: &str, id: &str, setup: &Setup, now: u64) -> Result<(), Refusal> {
        let heads: Vec<String> = snapshot::heads(&snapshot::whole(&self.place(entry)))
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
        let place = self.place(entry);
        let list = snapshot::whole(&place)
            .into_iter()
            .find(|list| list.id == id)
            .ok_or(Refusal::Missing)?;
        let archive = place.join(format!("{id}.zip"));
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
        snapshot::whole(&self.place(entry))
            .iter()
            .any(|list| list.id == id)
            .then(|| self.place(entry).join(format!("{id}.zip")))
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
                "base",
                "busy",
                "bytes",
                "caps",
                "cloud",
                "files",
                "last",
                "locations",
                "manifest",
                "matched",
                "on",
                "others",
                "registry",
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
            ["bytes", "createdAt", "device", "files", "here", "id"]
        );
        assert_eq!(snapshot["device"], "dev1");
        assert_eq!(
            serde_json::to_value(Refusal::Outside).unwrap(),
            serde_json::json!("outside")
        );
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
        drop(busy);
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
}
