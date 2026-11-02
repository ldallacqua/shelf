//! Downloading from a source (ADR 007, phases 2 to 4): one at a time, on a task of the app's own, so it
//! goes on from the tray with no window open, by its links or through Real-Debrid. A page names a download
//! by its source and place; the link stays here, in `downloads.json`. What arrives is written beside itself as
//! `.part`, marked as coming from the internet, and never started. An archive is opened when the person
//! says, on a thread of its own, into a folder that only gets its name once all of it is there.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use reqwest::header::{
    ACCEPT_RANGES, CONTENT_DISPOSITION, CONTENT_RANGE, CONTENT_TYPE, ETAG, IF_RANGE, LAST_MODIFIED,
    RANGE,
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::sync::Notify;
use url::Url;

use crate::extract;
#[cfg(test)]
use crate::real_debrid::double;
use crate::real_debrid::{self, RealDebrid, Trouble};
use crate::sources;

const MOST_CONNECTING: Duration = Duration::from_secs(15);
/// How long a connection may send nothing. There is no limit on the whole, which can take hours.
const MOST_QUIET: Duration = Duration::from_secs(60);
/// The waits before asking again after a connection is lost.
const RETRIES: [Duration; 3] = [
    Duration::from_secs(5),
    Duration::from_secs(15),
    Duration::from_secs(30),
];
/// How often how far it got is written down. A restart reads the `.part` anyway.
const KEEP_EVERY: Duration = Duration::from_secs(5);
/// How often Real-Debrid is asked how a torrent is coming along. Its limit is 250 calls a minute.
const ASK_EVERY: Duration = if cfg!(debug_assertions) {
    Duration::from_millis(500)
} else {
    Duration::from_secs(5)
};
/// How long a magnet may take to become a torrent. One nobody is sharing never does.
const MOST_CONVERTING: Duration = Duration::from_secs(600);
/// Longer names than this are cut: Windows allows 255, and `.part` and ` (2)` need room.
const MOST_NAME: usize = 200;

/// Why a command did nothing, in a word a page has a sentence for.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Refusal {
    /// What was named is not an id.
    Invalid,
    /// No source, place or download by that name, or the list has changed since it was shown.
    Missing,
    /// This one has no link the app can download by itself.
    Unlinked,
    /// It is in the list already.
    Duplicate,
    /// It was asked to go through Real-Debrid, and nobody is signed in.
    #[serde(rename = "signedout")]
    SignedOut,
    /// Windows would not open the folder.
    Refused,
    /// This computer could not keep it.
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Queued,
    /// Real-Debrid is fetching it to its own servers, which nothing here can hurry.
    Remote,
    Downloading,
    Paused,
    Failed,
    Done,
}

/// How a download gets its file.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Through {
    #[default]
    Direct,
    #[serde(rename = "realdebrid")]
    RealDebrid,
}

/// Why a download stopped by itself.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Why {
    /// Every link answered with a web page, not a file: a file host's, usually.
    Page,
    /// Nothing answered, or it answered with an error.
    Unreachable,
    /// The disk has no room for it.
    Disk,
    /// The folder can't be written to.
    Write,
    /// Real-Debrid isn't signed in any more.
    #[serde(rename = "signedout")]
    SignedOut,
    /// The account isn't Premium.
    Premium,
    /// Real-Debrid's filters won't have it.
    Blocked,
    /// Nobody is sharing it, or the torrent failed on its servers.
    Dead,
    /// Real-Debrid found a virus in it.
    Virus,
    /// Real-Debrid doesn't open these links, or can't just now.
    Host,
    /// Real-Debrid says too much just now: its limits, or its traffic.
    Busy,
    /// Real-Debrid said no for another reason.
    Declined,
}

/// One file of a download through Real-Debrid. Its link doesn't change, and what it opens into does.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Piece {
    link: String,
    /// Inside the download's folder, from the torrent, each part made safe. Empty beside the rest.
    #[serde(default)]
    folders: Vec<String>,
    /// Its name, as the torrent or the first answer said.
    file: Option<String>,
    size: Option<u64>,
    validator: Option<String>,
    #[serde(default)]
    finished: bool,
}

/// How opening a finished download's archives is coming along.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Opening {
    Waiting,
    Working,
    Failed,
    Done,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Extraction {
    state: Opening,
    why: Option<extract::Failure>,
    done: u64,
    total: u64,
    /// Being written, under a `.part` name, and removed if it doesn't finish.
    unfinished: Vec<PathBuf>,
    /// Where it all ended up, once it has.
    folders: Vec<PathBuf>,
}

/// A download as it is kept.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Download {
    id: String,
    title: String,
    source_name: String,
    /// The same file from different places, in the source's order.
    links: Vec<String>,
    /// Which of them it is on.
    link: usize,
    folder: PathBuf,
    /// Its name, once the first answer says.
    file: Option<String>,
    state: State,
    why: Option<Why>,
    done: u64,
    total: Option<u64>,
    /// What says the file on the server is still the same one, to continue it.
    validator: Option<String>,
    added_at: u64,
    /// Set by Cancel on one being downloaded, for the task to finish when it has let go of the file.
    #[serde(default, skip_serializing)]
    cancelled: bool,
    #[serde(default)]
    through: Through,
    /// Mirrors split into parts, for Real-Debrid to open one by one.
    #[serde(default)]
    parts: Vec<Vec<String>>,
    /// The torrent on the account, so that a resume doesn't add it again.
    #[serde(default)]
    torrent: Option<String>,
    /// Whether this download put it there, so that Cancel takes it off.
    #[serde(default)]
    torrent_ours: bool,
    #[serde(default)]
    pieces: Vec<Piece>,
    /// How far along Real-Debrid is, in percent, while `Remote`.
    #[serde(default)]
    remote: Option<u8>,
    /// The game it was looked for from, for Windows' picker to start here. Older ones have none.
    #[serde(default)]
    entry: Option<String>,
    /// Which of what it brought are archives, once it has finished.
    #[serde(default)]
    archives: Option<Vec<PathBuf>>,
    #[serde(default)]
    extraction: Option<Extraction>,
}

impl Download {
    /// The folder a set of files stands in, or the one chosen for a single file.
    fn base(&self) -> PathBuf {
        match (&self.file, self.pieces.len() > 1) {
            (Some(name), true) => self.folder.join(name),
            _ => self.folder.clone(),
        }
    }

    fn piece_folder(&self, piece: &Piece) -> PathBuf {
        piece
            .folders
            .iter()
            .fold(self.base(), |folder, part| folder.join(part))
    }

    /// What it brought, once it has finished.
    fn files(&self) -> Vec<PathBuf> {
        if self.pieces.is_empty() {
            return self
                .file
                .iter()
                .map(|name| self.folder.join(name))
                .collect();
        }
        self.pieces
            .iter()
            .filter_map(|piece| Some(self.piece_folder(piece).join(piece.file.as_ref()?)))
            .collect()
    }

    /// Reads what it brought for archives, the first time it is asked.
    fn find_archives(&mut self) {
        if self.archives.is_none() {
            self.archives = Some(extract::archives_in(&self.files()));
        }
    }

    /// What Explorer should show of it: what was extracted, or else what arrived.
    fn to_show(&self) -> PathBuf {
        match self
            .extraction
            .as_ref()
            .filter(|each| each.state == Opening::Done)
        {
            Some(Extraction { folders, .. }) if folders.len() == 1 => folders[0].clone(),
            Some(_) => self.base(),
            None => match &self.file {
                Some(name) => self.folder.join(name),
                None => self.folder.clone(),
            },
        }
    }

    /// How much is here, from the files themselves.
    fn arrived(&self) -> u64 {
        if self.pieces.is_empty() {
            return self
                .file
                .as_ref()
                .and_then(|name| fs::metadata(part_of(&self.folder, name)).ok())
                .map_or(0, |part| part.len());
        }
        self.pieces
            .iter()
            .map(|piece| match (&piece.file, piece.finished) {
                (_, true) => piece.size.unwrap_or(0),
                (Some(name), false) => fs::metadata(part_of(&self.piece_folder(piece), name))
                    .map_or(0, |part| part.len()),
                (None, false) => 0,
            })
            .sum()
    }

    /// Everything of it that was written, and the folders made for it if nothing else is there.
    fn delete_what_arrived(&self) {
        if self.pieces.is_empty() {
            if let Some(name) = &self.file {
                let _ = fs::remove_file(part_of(&self.folder, name));
            }
            return;
        }
        for piece in &self.pieces {
            if let Some(name) = &piece.file {
                let folder = self.piece_folder(piece);
                let _ = fs::remove_file(part_of(&folder, name));
                if piece.finished {
                    let _ = fs::remove_file(folder.join(name));
                }
            }
        }
        for piece in &self.pieces {
            // Deepest first. `remove_dir` leaves a folder with anything in it, which isn't ours to take.
            for depth in (1..=piece.folders.len()).rev() {
                let inner = piece.folders[..depth]
                    .iter()
                    .fold(self.base(), |folder, part| folder.join(part));
                let _ = fs::remove_dir(inner);
            }
        }
        if self.pieces.len() > 1 {
            let _ = fs::remove_dir(self.base());
        }
    }
}

/// A download as a page sees it: never its links.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub id: String,
    /// The game it was looked for from.
    pub entry: Option<String>,
    pub title: String,
    pub source_name: String,
    pub file: Option<String>,
    pub folder: String,
    pub state: State,
    pub why: Option<Why>,
    pub done: u64,
    pub total: Option<u64>,
    /// Bytes a second, averaged over the last few.
    pub speed: u64,
    pub through: Through,
    /// How far along Real-Debrid is, in percent, while it fetches it.
    pub remote: Option<u8>,
    /// How many archives it brought.
    pub archives: usize,
    pub extraction: Option<ExtractionView>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractionView {
    pub state: Opening,
    pub why: Option<extract::Failure>,
    pub done: u64,
    pub total: u64,
}

/// What the task holds of the one it is on, for a page to read and a command to stop.
struct Running {
    id: String,
    stop: Arc<Notify>,
    done: Arc<AtomicU64>,
    /// What the files already finished come to, when there are several.
    before: Arc<AtomicU64>,
    speed: Arc<AtomicU64>,
}

/// The one the task is on, with what it reports through.
struct Job {
    download: Download,
    stop: Arc<Notify>,
    done: Arc<AtomicU64>,
    before: Arc<AtomicU64>,
    speed: Arc<AtomicU64>,
}

/// What the thread that opens archives holds of the one it is on.
struct RunningExtraction {
    id: String,
    stop: Arc<AtomicBool>,
    done: Arc<AtomicU64>,
}

/// One to open, with what it reports through.
struct ExtractionJob {
    id: String,
    archives: Vec<PathBuf>,
    /// Left by an earlier go the app didn't live through.
    leftover: Vec<PathBuf>,
    stop: Arc<AtomicBool>,
    done: Arc<AtomicU64>,
}

#[derive(Default, Serialize, Deserialize)]
struct Kept {
    version: u32,
    downloads: Vec<Download>,
}

const FILE: &str = "downloads.json";

pub struct Downloads {
    file: PathBuf,
    kept: Mutex<Vec<Download>>,
    running: Mutex<Option<Running>>,
    wake: Notify,
    extracting: Mutex<Option<RunningExtraction>>,
    /// Goes with `kept`, whose lock it waits on.
    extract_wake: Condvar,
}

fn part_of(folder: &Path, file: &str) -> PathBuf {
    folder.join(format!("{file}.part"))
}

impl Downloads {
    /// The downloads kept in `folder`. One under way when the app ended waits to be resumed: the app
    /// starts with Windows, and a download shouldn't take the connection before anyone has asked.
    pub fn open(folder: &Path) -> Self {
        let file = folder.join(FILE);
        let mut kept = match fs::read_to_string(&file) {
            Ok(text) => match serde_json::from_str::<Kept>(&text) {
                Ok(kept) => kept.downloads,
                Err(_) => {
                    let _ = fs::rename(&file, folder.join("downloads.unreadable.json"));
                    Vec::new()
                }
            },
            Err(_) => Vec::new(),
        };
        for download in &mut kept {
            if matches!(
                download.state,
                State::Queued | State::Remote | State::Downloading
            ) {
                download.state = State::Paused;
                download.remote = None;
            }
            if download.state != State::Done {
                download.done = download.arrived();
            } else {
                download.find_archives();
            }
            // Not started again by itself either. What it left stays until it is tried again or taken off.
            if let Some(extraction) = &mut download.extraction
                && matches!(extraction.state, Opening::Waiting | Opening::Working)
            {
                extraction.state = Opening::Failed;
                extraction.why = Some(extract::Failure::Interrupted);
            }
        }
        Downloads {
            file,
            kept: Mutex::new(kept),
            running: Mutex::new(None),
            wake: Notify::new(),
            extracting: Mutex::new(None),
            extract_wake: Condvar::new(),
        }
    }

    pub fn all(&self) -> Vec<View> {
        let kept = self.kept.lock().unwrap();
        let running = self.running.lock().unwrap();
        let extracting = self.extracting.lock().unwrap();
        kept.iter()
            .map(|download| {
                let now = running.as_ref().filter(|each| each.id == download.id);
                let opening = extracting.as_ref().filter(|each| each.id == download.id);
                View {
                    id: download.id.clone(),
                    entry: download.entry.clone(),
                    title: download.title.clone(),
                    source_name: download.source_name.clone(),
                    file: download.file.clone(),
                    folder: download.folder.display().to_string(),
                    state: download.state,
                    why: download.why,
                    done: now.map_or(download.done, |each| {
                        each.before.load(Ordering::Relaxed) + each.done.load(Ordering::Relaxed)
                    }),
                    total: download.total,
                    speed: now.map_or(0, |each| each.speed.load(Ordering::Relaxed)),
                    through: download.through,
                    remote: download.remote,
                    archives: download.archives.as_ref().map_or(0, Vec::len),
                    extraction: download.extraction.as_ref().map(|each| ExtractionView {
                        state: each.state,
                        why: each.why,
                        done: opening.map_or(each.done, |now| now.done.load(Ordering::Relaxed)),
                        total: each.total,
                    }),
                }
            })
            .collect()
    }

    /// Whether one of these links is already on its way or waiting.
    pub fn has_link(&self, links: &[String]) -> bool {
        self.kept.lock().unwrap().iter().any(|download| {
            download.state != State::Done
                && download
                    .links
                    .iter()
                    .chain(download.parts.iter().flatten())
                    .any(|each| links.contains(each))
        })
    }

    pub fn add(
        &self,
        id: String,
        title: String,
        source_name: String,
        through: Through,
        links: Vec<String>,
        parts: Vec<Vec<String>>,
        folder: PathBuf,
        entry: Option<String>,
        now: u64,
    ) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        kept.push(Download {
            id,
            title,
            source_name,
            links,
            link: 0,
            folder,
            file: None,
            state: State::Queued,
            why: None,
            done: 0,
            total: None,
            validator: None,
            added_at: now,
            cancelled: false,
            through,
            parts,
            torrent: None,
            torrent_ours: false,
            pieces: Vec::new(),
            remote: None,
            entry,
            archives: None,
            extraction: None,
        });
        self.save(&kept)?;
        self.wake.notify_one();
        Ok(())
    }

    /// Stops one under way or waiting. What it has stays, to be continued.
    pub fn pause(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept
            .iter_mut()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        if matches!(
            download.state,
            State::Queued | State::Remote | State::Downloading
        ) {
            download.state = State::Paused;
            download.remote = None;
            self.stop(id);
            self.save(&kept)?;
        }
        Ok(())
    }

    /// Puts one paused or failed back in line.
    pub fn resume(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept
            .iter_mut()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        if matches!(download.state, State::Paused | State::Failed) {
            download.state = State::Queued;
            download.why = None;
            download.link = 0;
            self.save(&kept)?;
            self.wake.notify_one();
        }
        Ok(())
    }

    /// Takes one off the list. What it had of the file goes; a finished file stays where it is. Says
    /// which torrent to take off the account, if it is time to and this download put it there.
    pub fn remove(&self, id: &str) -> Result<Option<String>, Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let at = kept
            .iter()
            .position(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        // Windows can't delete a file still open: the task does it, once it has let go.
        if self.stop(id) {
            kept[at].cancelled = true;
            return Ok(None);
        }
        let download = kept.remove(at);
        // The thread at it removes what it wrote, and finds this one gone. What an earlier go left is
        // nobody's until now.
        if !self.stop_extracting(id)
            && let Some(extraction) = &download.extraction
        {
            remove_unfinished(&extraction.unfinished);
        }
        let mut torrent = None;
        if download.state != State::Done {
            download.delete_what_arrived();
            torrent = download.torrent.filter(|_| download.torrent_ours);
        }
        self.save(&kept)?;
        Ok(torrent)
    }

    /// What a finished one came to, and only that, to show in Explorer.
    pub fn finished_file(&self, id: &str) -> Result<PathBuf, Refusal> {
        let kept = self.kept.lock().unwrap();
        let download = kept
            .iter()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        match download.state {
            State::Done if download.file.is_some() => Ok(download.to_show()),
            _ => Err(Refusal::Missing),
        }
    }

    /// Where Windows' picker should start for a game: the last thing downloaded for it.
    pub fn folder_for_game(&self, entry: &str) -> Option<PathBuf> {
        let kept = self.kept.lock().unwrap();
        let download = kept
            .iter()
            .rev()
            .find(|each| each.state == State::Done && each.entry.as_deref() == Some(entry))?;
        Some(
            match download
                .extraction
                .as_ref()
                .filter(|each| each.state == Opening::Done)
            {
                Some(extraction) if !extraction.folders.is_empty() => extraction.folders[0].clone(),
                _ => download.base(),
            },
        )
    }

    /// Puts a finished download's archives in line to be opened, once more if the last go failed.
    pub fn extract(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept
            .iter_mut()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        let ready = download.state == State::Done
            && download
                .archives
                .as_ref()
                .is_some_and(|all| !all.is_empty());
        if !ready {
            return Err(Refusal::Missing);
        }
        let leftover = match &download.extraction {
            None => Vec::new(),
            Some(earlier) if earlier.state == Opening::Failed => earlier.unfinished.clone(),
            Some(_) => return Ok(()),
        };
        download.extraction = Some(Extraction {
            state: Opening::Waiting,
            why: None,
            done: 0,
            total: 0,
            unfinished: leftover,
            folders: Vec::new(),
        });
        self.save(&kept)?;
        self.extract_wake.notify_one();
        Ok(())
    }

    /// Stops opening one, and what had come out goes. The archive stays.
    pub fn cancel_extraction(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept
            .iter_mut()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        // Being worked on: the thread at it says so when it has let go.
        if self.stop_extracting(id) {
            return Ok(());
        }
        if let Some(extraction) = download
            .extraction
            .as_ref()
            .filter(|each| each.state != Opening::Done)
        {
            remove_unfinished(&extraction.unfinished);
            download.extraction = None;
            self.save(&kept)?;
        }
        Ok(())
    }

    fn stop_extracting(&self, id: &str) -> bool {
        let extracting = self.extracting.lock().unwrap();
        match extracting.as_ref().filter(|each| each.id == id) {
            Some(each) => {
                each.stop.store(true, Ordering::Relaxed);
                true
            }
            None => false,
        }
    }

    /// The next to open, waiting until there is one.
    fn take_next_extraction(&self) -> ExtractionJob {
        let mut kept = self.kept.lock().unwrap();
        loop {
            let waiting = kept.iter_mut().find(|each| {
                each.extraction
                    .as_ref()
                    .is_some_and(|extraction| extraction.state == Opening::Waiting)
            });
            if let Some(download) = waiting {
                let id = download.id.clone();
                let archives = download.archives.clone().unwrap_or_default();
                let mut leftover = Vec::new();
                if let Some(extraction) = &mut download.extraction {
                    extraction.state = Opening::Working;
                    leftover = std::mem::take(&mut extraction.unfinished);
                }
                let job = ExtractionJob {
                    id,
                    archives,
                    leftover,
                    stop: Arc::new(AtomicBool::new(false)),
                    done: Arc::new(AtomicU64::new(0)),
                };
                *self.extracting.lock().unwrap() = Some(RunningExtraction {
                    id: job.id.clone(),
                    stop: job.stop.clone(),
                    done: job.done.clone(),
                });
                let _ = self.save(&kept);
                return job;
            }
            kept = self.extract_wake.wait(kept).unwrap();
        }
    }

    fn change_extraction(&self, id: &str, change: impl FnOnce(&mut Extraction)) {
        self.change(id, |download| {
            if let Some(extraction) = &mut download.extraction {
                change(extraction);
            }
        });
    }

    /// The thread has let go of it. Cancel leaves it as if it had never been asked.
    fn settle_extraction(
        &self,
        id: &str,
        outcome: Result<Vec<PathBuf>, extract::Failure>,
        done: u64,
    ) {
        let mut kept = self.kept.lock().unwrap();
        *self.extracting.lock().unwrap() = None;
        let Some(download) = kept.iter_mut().find(|each| each.id == id) else {
            return;
        };
        match outcome {
            Err(extract::Failure::Stopped) => download.extraction = None,
            outcome => {
                if let Some(extraction) = &mut download.extraction {
                    extraction.unfinished.clear();
                    extraction.done = done;
                    match outcome {
                        Ok(folders) => {
                            extraction.state = Opening::Done;
                            extraction.folders = folders;
                        }
                        Err(failure) => {
                            extraction.state = Opening::Failed;
                            extraction.why = Some(failure);
                        }
                    }
                }
            }
        }
        let _ = self.save(&kept);
    }

    /// Stops the one under way, if it is this one, and says so.
    fn stop(&self, id: &str) -> bool {
        let running = self.running.lock().unwrap();
        match running.as_ref().filter(|each| each.id == id) {
            Some(each) => {
                each.stop.notify_one();
                true
            }
            None => false,
        }
    }

    /// The next in line, marked as under way.
    fn take_next(&self) -> Option<Job> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept.iter_mut().find(|each| each.state == State::Queued)?;
        download.state = State::Downloading;
        let job = Job {
            download: download.clone(),
            stop: Arc::new(Notify::new()),
            done: Arc::new(AtomicU64::new(download.done)),
            before: Arc::new(AtomicU64::new(0)),
            speed: Arc::new(AtomicU64::new(0)),
        };
        *self.running.lock().unwrap() = Some(Running {
            id: download.id.clone(),
            stop: job.stop.clone(),
            done: job.done.clone(),
            before: job.before.clone(),
            speed: job.speed.clone(),
        });
        let _ = self.save(&kept);
        Some(job)
    }

    fn change(&self, id: &str, change: impl FnOnce(&mut Download)) {
        let mut kept = self.kept.lock().unwrap();
        if let Some(download) = kept.iter_mut().find(|each| each.id == id) {
            change(download);
            let _ = self.save(&kept);
        }
    }

    /// Real-Debrid is fetching it, this far along. Not over a Pause already said.
    fn remote(&self, id: &str, percent: u8) {
        self.change(id, |download| {
            if matches!(download.state, State::Downloading | State::Remote) {
                download.state = State::Remote;
                download.remote = Some(percent);
            }
        });
    }

    /// Its files are ready to fetch. Not over a Pause already said.
    fn downloading(&self, id: &str) {
        self.change(id, |download| {
            if download.state == State::Remote {
                download.state = State::Downloading;
            }
            download.remote = None;
        });
    }

    /// What is taken off the account, if a Cancel is waiting on this one.
    fn torrent_to_delete(&self, id: &str) -> Option<String> {
        let kept = self.kept.lock().unwrap();
        let download = kept.iter().find(|each| each.id == id)?;
        download
            .cancelled
            .then(|| download.torrent.clone().filter(|_| download.torrent_ours))
            .flatten()
    }

    /// What the first answer said: kept at once, since continuing later depends on it.
    fn started(&self, id: &str, link: usize, started: &Started) {
        let mut kept = self.kept.lock().unwrap();
        if let Some(download) = kept.iter_mut().find(|each| each.id == id) {
            download.link = link;
            download.file = Some(started.file.clone());
            download.total = started.total;
            download.validator = started.validator.clone();
            let _ = self.save(&kept);
        }
    }

    fn progress(&self, id: &str, done: u64) {
        let mut kept = self.kept.lock().unwrap();
        if let Some(download) = kept.iter_mut().find(|each| each.id == id) {
            download.done = done;
            let _ = self.save(&kept);
        }
    }

    /// The task has let go of a download, for one of these reasons.
    fn settle(&self, id: &str, outcome: Result<u64, Failure>, done: u64) {
        let mut kept = self.kept.lock().unwrap();
        *self.running.lock().unwrap() = None;
        let Some(at) = kept.iter().position(|each| each.id == id) else {
            return;
        };
        if kept[at].cancelled {
            kept.remove(at).delete_what_arrived();
            let _ = self.save(&kept);
            return;
        }
        let download = &mut kept[at];
        download.done = done;
        download.remote = None;
        match outcome {
            Ok(total) => {
                download.state = State::Done;
                download.done = total;
                download.total = Some(total);
                download.why = None;
                download.find_archives();
            }
            // Pause has said what it is now, and Resume may already have.
            Err(Failure::Stopped) => {}
            Err(failure) => {
                download.state = State::Failed;
                download.why = Some(failure.why());
            }
        }
        let _ = self.save(&kept);
    }

    /// Written whole to a new file, then put in place: a write cut short leaves the last good one.
    fn save(&self, kept: &[Download]) -> Result<(), Refusal> {
        let text = serde_json::to_string_pretty(&Kept {
            version: 1,
            downloads: kept.to_vec(),
        })
        .map_err(|_| Refusal::Failed)?;
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder).map_err(|_| Refusal::Failed)?;
        }
        let next = self.file.with_extension("json.next");
        fs::write(&next, text).map_err(|_| Refusal::Failed)?;
        fs::rename(&next, &self.file).map_err(|_| Refusal::Failed)
    }
}

/// The task that does the downloading, for as long as the app runs.
pub async fn run(downloads: Arc<Downloads>, debrid: Arc<RealDebrid>, version: String) {
    let client = match client(&version) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("could not make what downloads files: {error}");
            return;
        }
    };
    loop {
        let Some(job) = downloads.take_next() else {
            downloads.wake.notified().await;
            continue;
        };
        let id = job.download.id.clone();
        let outcome = match job.download.through {
            Through::Direct => work(&client, &downloads, &job).await,
            Through::RealDebrid => through_real_debrid(&client, &debrid, &downloads, &job).await,
        };
        job.speed.store(0, Ordering::Relaxed);
        if let Some(torrent) = downloads.torrent_to_delete(&id) {
            debrid.delete_torrent(&torrent).await;
        }
        let done = job.before.load(Ordering::Relaxed) + job.done.load(Ordering::Relaxed);
        downloads.settle(&id, outcome, done);
    }
}

/// The thread that opens archives, for as long as the app runs: apart from the task that downloads,
/// which it would hold up for as long as a game takes to come out.
pub fn run_extractions(downloads: Arc<Downloads>) {
    loop {
        let job = downloads.take_next_extraction();
        let outcome = open_archives(&downloads, &job);
        let done = job.done.load(Ordering::Relaxed);
        downloads.settle_extraction(&job.id, outcome, done);
    }
}

/// Every archive read through first, so that a bad one leaves nothing, and then all of them written,
/// each under a `.part` name until the last is whole.
fn open_archives(
    downloads: &Downloads,
    job: &ExtractionJob,
) -> Result<Vec<PathBuf>, extract::Failure> {
    remove_unfinished(&job.leftover);
    let plans = job
        .archives
        .iter()
        .map(|archive| extract::plan(archive))
        .collect::<Result<Vec<_>, _>>()?;
    let total = plans.iter().map(|plan| plan.total).sum::<u64>();
    downloads.change_extraction(&job.id, |extraction| extraction.total = total);
    let room = job
        .archives
        .first()
        .and_then(|archive| free_space(archive.parent()?));
    if room.is_some_and(|free| total > free) {
        return Err(extract::Failure::Disk);
    }
    let mut folders = Vec::with_capacity(plans.len());
    let mut unfinished = Vec::with_capacity(plans.len());
    for (plan, archive) in plans.iter().zip(&job.archives) {
        let parent = archive.parent().ok_or(extract::Failure::Write)?;
        let name = unused_folder(parent, &plan.name);
        let writing = part_of(parent, &name);
        fs::create_dir_all(&writing).map_err(|_| extract::Failure::Write)?;
        unfinished.push(writing);
        folders.push(parent.join(name));
    }
    let kept = unfinished.clone();
    downloads.change_extraction(&job.id, |extraction| extraction.unfinished = kept);
    let progress = extract::Progress {
        stop: &job.stop,
        done: &job.done,
    };
    let written = plans
        .iter()
        .zip(&unfinished)
        .try_for_each(|(plan, writing)| extract::unpack(plan, writing, &progress));
    if let Err(failure) = written {
        remove_unfinished(&unfinished);
        return Err(failure);
    }
    for (writing, folder) in unfinished.iter().zip(&folders) {
        if fs::rename(writing, folder).is_err() {
            remove_unfinished(&unfinished);
            return Err(extract::Failure::Write);
        }
    }
    Ok(folders)
}

/// A name nothing in the folder has, nor its `.part`. A folder's dots aren't a kind of file.
fn unused_folder(parent: &Path, name: &str) -> String {
    let free =
        |candidate: &str| !parent.join(candidate).exists() && !part_of(parent, candidate).exists();
    if free(name) {
        return name.to_string();
    }
    (2..)
        .map(|count| format!("{name} ({count})"))
        .find(|candidate| free(candidate))
        .expect("numbers don't run out")
}

/// What an unfinished opening wrote. Only ever a folder under a `.part` name, which Shelf made.
fn remove_unfinished(folders: &[PathBuf]) {
    for folder in folders {
        if folder.extension().is_some_and(|kind| kind == "part") {
            let _ = fs::remove_dir_all(folder);
        }
    }
}

/// What Real-Debrid can't do becomes why the download stopped.
fn stopped_by(trouble: Trouble) -> Failure {
    Failure::Debrid(match trouble {
        Trouble::SignedOut => Why::SignedOut,
        Trouble::NotPremium => Why::Premium,
        Trouble::Blocked => Why::Blocked,
        Trouble::Host => Why::Host,
        Trouble::Gone => Why::Dead,
        Trouble::Busy => Why::Busy,
        Trouble::Declined => Why::Declined,
        Trouble::Network => Why::Unreachable,
    })
}

/// A call to Real-Debrid that Pause and Cancel don't wait for.
async fn asking<T>(
    stop: &Notify,
    call: impl Future<Output = Result<T, Trouble>>,
) -> Result<Result<T, Trouble>, Failure> {
    tokio::select! {
        answer = call => Ok(answer),
        () = stop.notified() => Err(Failure::Stopped),
    }
}

/// One download through Real-Debrid: what it has to fetch, then each of those from where it opens them.
async fn through_real_debrid(
    client: &Client,
    debrid: &RealDebrid,
    downloads: &Downloads,
    job: &Job,
) -> Result<u64, Failure> {
    let id = &job.download.id;
    let mut download = job.download.clone();
    if download.pieces.is_empty() {
        let pieces = pieces_to_fetch(debrid, downloads, job).await?;
        download.pieces = pieces;
        // A set of files gets a folder of its own, which a single file doesn't need.
        if download.pieces.len() > 1 {
            let name = safe_name(&download.title);
            let name = if name.is_empty() {
                "download".to_string()
            } else {
                name
            };
            download.file = Some(unused_name(&download.folder, &name));
        }
        let total = download
            .pieces
            .iter()
            .map(|piece| piece.size)
            .sum::<Option<u64>>();
        download.total = total;
        downloads.change(id, |kept| {
            kept.pieces = download.pieces.clone();
            kept.file = download.file.clone();
            kept.total = total;
        });
    }
    downloads.downloading(id);
    job.done.store(0, Ordering::Relaxed);
    let mut before: u64 = download
        .pieces
        .iter()
        .filter(|piece| piece.finished)
        .filter_map(|piece| piece.size)
        .sum();
    job.before.store(before, Ordering::Relaxed);
    for at in 0..download.pieces.len() {
        if download.pieces[at].finished {
            continue;
        }
        let size = fetch_piece(client, debrid, downloads, job, &mut download, at).await?;
        before += size;
        job.before.store(before, Ordering::Relaxed);
        job.done.store(0, Ordering::Relaxed);
        download.pieces[at].finished = true;
        download.pieces[at].size = Some(size);
        downloads.change(id, |kept| {
            kept.pieces = download.pieces.clone();
        });
    }
    Ok(before)
}

/// One file: opened just before it is used, and opened again if a link stops working.
async fn fetch_piece(
    client: &Client,
    debrid: &RealDebrid,
    downloads: &Downloads,
    job: &Job,
    download: &mut Download,
    at: usize,
) -> Result<u64, Failure> {
    let id = download.id.clone();
    let single = download.pieces.len() == 1;
    let mut retries = 0;
    let mut last_done = 0;
    loop {
        let link = download.pieces[at].link.clone();
        let opened = match asking(&job.stop, debrid.unrestrict(&link)).await? {
            Ok(opened) => opened,
            Err(Trouble::Network | Trouble::Busy) => {
                wait_to_retry(&job.stop, &mut retries).await?;
                continue;
            }
            Err(trouble) => return Err(stopped_by(trouble)),
        };
        let folder = download.piece_folder(&download.pieces[at]);
        // Named once, so a later attempt finds the `.part` of the first.
        let file = match &download.pieces[at].file {
            Some(name) => name.clone(),
            None => {
                let name = safe_name(&opened.filename);
                let name = if name.is_empty() {
                    format!("part {}", at + 1)
                } else {
                    name
                };
                unused_name(&folder, &name)
            }
        };
        download.pieces[at].file = Some(file.clone());
        if single {
            download.file = Some(file.clone());
        }
        let pieces = download.pieces.clone();
        let whole = download.file.clone();
        downloads.change(&id, |kept| {
            kept.pieces = pieces;
            kept.file = whole;
        });
        let validator = download.pieces[at].validator.clone();
        let transfer = Transfer {
            url: &opened.download,
            folder: &folder,
            title: &download.title,
            file: Some(&file),
            validator: validator.as_deref(),
            done: &job.done,
            speed: &job.speed,
            stop: &job.stop,
        };
        let mut said = None;
        let outcome = fetch(
            client,
            transfer,
            |started| said = Some(started.validator.clone()),
            |_| {},
        )
        .await;
        job.speed.store(0, Ordering::Relaxed);
        if let Some(tag) = said {
            download.pieces[at].validator.clone_from(&tag);
            let pieces = download.pieces.clone();
            downloads.change(&id, |kept| kept.pieces = pieces);
        }
        match outcome {
            Ok(size) => return Ok(size),
            // A link that no longer works is opened again.
            Err(Failure::Network | Failure::Refused) => {
                let have = job.done.load(Ordering::Relaxed);
                if have > last_done {
                    retries = 0;
                    last_done = have;
                }
                wait_to_retry(&job.stop, &mut retries).await?;
            }
            Err(failure) => return Err(failure),
        }
    }
}

async fn wait_to_retry(stop: &Notify, retries: &mut usize) -> Result<(), Failure> {
    let Some(wait) = RETRIES.get(*retries) else {
        return Err(Failure::Network);
    };
    *retries += 1;
    tokio::select! {
        () = tokio::time::sleep(*wait) => Ok(()),
        () = stop.notified() => Err(Failure::Stopped),
    }
}

/// What has to be fetched: a host's link it can open, a mirror's parts, or a magnet's files.
async fn pieces_to_fetch(
    debrid: &RealDebrid,
    downloads: &Downloads,
    job: &Job,
) -> Result<Vec<Piece>, Failure> {
    let stop = &*job.stop;
    let download = &job.download;
    let piece = |link: &str, size| Piece {
        link: link.to_string(),
        folders: Vec::new(),
        file: None,
        size,
        validator: None,
        finished: false,
    };
    let (magnets, webs): (Vec<&String>, Vec<&String>) = download
        .links
        .iter()
        .partition(|link| link.starts_with("magnet:"));
    for link in webs {
        match asking(stop, debrid.unrestrict(link)).await? {
            Ok(opened) => return Ok(vec![piece(link, opened.filesize)]),
            // This one it can't do: the next may be somewhere it can.
            Err(Trouble::Host | Trouble::Gone | Trouble::Declined) => {}
            Err(trouble) => return Err(stopped_by(trouble)),
        }
    }
    for group in &download.parts {
        let mut sizes = Vec::with_capacity(group.len());
        let mut whole = true;
        for link in group {
            match asking(stop, debrid.unrestrict(link)).await? {
                Ok(opened) => sizes.push(opened.filesize),
                Err(Trouble::Host | Trouble::Gone | Trouble::Declined) => {
                    whole = false;
                    break;
                }
                Err(trouble) => return Err(stopped_by(trouble)),
            }
        }
        if whole && !group.is_empty() {
            return Ok(group
                .iter()
                .zip(sizes)
                .map(|(link, size)| piece(link, size))
                .collect());
        }
    }
    match magnets.first() {
        Some(magnet) => pieces_of_magnet(debrid, downloads, job, magnet).await,
        None => Err(Failure::Debrid(Why::Host)),
    }
}

/// Puts a magnet on the account, unless it is there, and waits for Real-Debrid to have its files.
async fn pieces_of_magnet(
    debrid: &RealDebrid,
    downloads: &Downloads,
    job: &Job,
    magnet: &str,
) -> Result<Vec<Piece>, Failure> {
    let stop = &*job.stop;
    let id = &job.download.id;
    let mut torrent = job.download.torrent.clone();
    let started = Instant::now();
    downloads.remote(id, 0);
    loop {
        let on_account = match torrent.clone() {
            Some(on_account) => on_account,
            None => {
                let found = match real_debrid::hash_of(magnet) {
                    Some(hash) => asking(stop, debrid.torrent_with_hash(&hash))
                        .await?
                        .map_err(stopped_by)?,
                    None => None,
                };
                let ours = found.is_none();
                let on_account = match found {
                    Some(on_account) => on_account,
                    None => asking(stop, debrid.add_magnet(magnet))
                        .await?
                        .map_err(stopped_by)?,
                };
                let kept_id = on_account.clone();
                downloads.change(id, |kept| {
                    kept.torrent = Some(kept_id);
                    kept.torrent_ours = ours;
                });
                torrent = Some(on_account.clone());
                on_account
            }
        };
        let info = match asking(stop, debrid.torrent(&on_account)).await? {
            Ok(info) => info,
            // Taken off the account since: it goes on again.
            Err(Trouble::Gone) => {
                torrent = None;
                continue;
            }
            Err(trouble) => return Err(stopped_by(trouble)),
        };
        match info.status.as_str() {
            "downloaded" => return Ok(pieces_of_torrent(&info)),
            "magnet_error" | "error" | "dead" => return Err(Failure::Debrid(Why::Dead)),
            "virus" => return Err(Failure::Debrid(Why::Virus)),
            "waiting_files_selection" => {
                asking(stop, debrid.select_all(&on_account))
                    .await?
                    .map_err(stopped_by)?;
            }
            "magnet_conversion" if started.elapsed() > MOST_CONVERTING => {
                return Err(Failure::Debrid(Why::Dead));
            }
            _ => downloads.remote(id, info.progress.clamp(0.0, 100.0) as u8),
        }
        tokio::select! {
            () = tokio::time::sleep(ASK_EVERY) => {}
            () = stop.notified() => return Err(Failure::Stopped),
        }
    }
}

/// A finished torrent's links, each with the file it is, when they can be told apart: they come in
/// the order of its selected files, unless Real-Debrid made them one archive.
fn pieces_of_torrent(info: &real_debrid::Torrent) -> Vec<Piece> {
    let files: Vec<&real_debrid::TorrentFile> = info
        .files
        .iter()
        .filter(|file| file.selected == 1)
        .collect();
    let matched = files.len() == info.links.len();
    info.links
        .iter()
        .enumerate()
        .map(|(at, link)| {
            let (folders, file, size) = if matched {
                let mut parts: Vec<String> = files[at]
                    .path
                    .split(['/', '\\'])
                    .map(safe_name)
                    .filter(|part| !part.is_empty())
                    .collect();
                let file = parts.pop();
                (parts, file, Some(files[at].bytes))
            } else {
                (Vec::new(), None, None)
            };
            Piece {
                link: link.clone(),
                folders,
                file,
                size,
                validator: None,
                finished: false,
            }
        })
        .collect()
}

/// One download, through its links, asking again when a connection is lost.
async fn work(client: &Client, downloads: &Downloads, running: &Job) -> Result<u64, Failure> {
    let job = &running.download;
    let (stop, done, speed): (&Notify, &AtomicU64, &AtomicU64) =
        (&running.stop, &running.done, &running.speed);
    let mut link = job.link.min(job.links.len().saturating_sub(1));
    let mut file = job.file.clone();
    let mut validator = job.validator.clone();
    let mut retries = 0;
    let mut last_done = done.load(Ordering::Relaxed);
    loop {
        let transfer = Transfer {
            url: &job.links[link],
            folder: &job.folder,
            title: &job.title,
            file: file.as_deref(),
            validator: validator.as_deref(),
            done,
            speed,
            stop,
        };
        let mut said = None;
        let outcome = fetch(
            client,
            transfer,
            |started| {
                downloads.started(&job.id, link, started);
                said = Some((started.file.clone(), started.validator.clone()));
            },
            |at| downloads.progress(&job.id, at),
        )
        .await;
        if let Some((name, tag)) = said {
            file = Some(name);
            validator = tag;
        }
        speed.store(0, Ordering::Relaxed);
        let failure = match outcome {
            Ok(total) => return Ok(total),
            Err(failure) => failure,
        };
        let have = done.load(Ordering::Relaxed);
        match failure {
            // Before any of the file, the next place may have it. With some of it, only this one
            // can be asked to continue.
            Failure::Page | Failure::Refused if have == 0 && link + 1 < job.links.len() => {
                link += 1;
                file = None;
                validator = None;
                retries = 0;
            }
            Failure::Network => {
                if have > last_done {
                    retries = 0;
                    last_done = have;
                }
                let Some(wait) = RETRIES.get(retries) else {
                    return Err(failure);
                };
                retries += 1;
                tokio::select! {
                    () = tokio::time::sleep(*wait) => {}
                    () = stop.notified() => return Err(Failure::Stopped),
                }
            }
            failure => return Err(failure),
        }
    }
}

/// How a transfer ended, when it did not end with the file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    /// Pause or Cancel.
    Stopped,
    /// The connection failed, or ended early: worth asking again.
    Network,
    /// It answered with an error.
    Refused,
    Page,
    Disk,
    Write,
    /// Real-Debrid could not do it, for this reason.
    Debrid(Why),
}

impl Failure {
    fn why(self) -> Why {
        match self {
            Failure::Page => Why::Page,
            Failure::Disk => Why::Disk,
            Failure::Write => Why::Write,
            Failure::Debrid(why) => why,
            Failure::Stopped | Failure::Network | Failure::Refused => Why::Unreachable,
        }
    }
}

pub fn client(version: &str) -> reqwest::Result<Client> {
    Client::builder()
        .user_agent(format!("Shelf/{version}"))
        .redirect(sources::redirects())
        .connect_timeout(MOST_CONNECTING)
        .read_timeout(MOST_QUIET)
        .build()
}

/// One attempt at a file.
pub struct Transfer<'a> {
    pub url: &'a str,
    pub folder: &'a Path,
    /// What to call the file if neither the answer nor the address says.
    pub title: &'a str,
    /// Its name, if an earlier attempt settled it.
    pub file: Option<&'a str>,
    pub validator: Option<&'a str>,
    pub done: &'a AtomicU64,
    pub speed: &'a AtomicU64,
    pub stop: &'a Notify,
}

/// What the first answer said about the file.
#[derive(Debug, PartialEq, Eq)]
pub struct Started {
    pub file: String,
    pub total: Option<u64>,
    pub validator: Option<String>,
}

/// Fetches a file into its folder, continuing a `.part` if the server says it is the same file.
/// Returns its whole size once it has its name, its mark and nothing left to do.
pub async fn fetch(
    client: &Client,
    transfer: Transfer<'_>,
    mut on_started: impl FnMut(&Started),
    mut on_progress: impl FnMut(u64),
) -> Result<u64, Failure> {
    let url = Url::parse(transfer.url).map_err(|_| Failure::Refused)?;
    if !sources::allowed(&url) {
        return Err(Failure::Refused);
    }
    let have_part = transfer
        .file
        .and_then(|name| fs::metadata(part_of(transfer.folder, name)).ok())
        .map_or(0, |part| part.len());
    // With nothing to tell that the file is the same one, what is there can't be continued.
    let mut have = if transfer.validator.is_some() {
        have_part
    } else {
        0
    };
    let mut request = client.get(url);
    if let (true, Some(validator)) = (have > 0, transfer.validator) {
        request = request
            .header(RANGE, format!("bytes={have}-"))
            .header(IF_RANGE, validator);
    }
    let answer = tokio::select! {
        answer = request.send() => answer,
        () = transfer.stop.notified() => return Err(Failure::Stopped),
    };
    let mut response = answer.map_err(|_| Failure::Network)?;
    let status = response.status();

    if status == StatusCode::RANGE_NOT_SATISFIABLE {
        // Asked for what comes after the end: that is all of it, or a different file.
        let whole = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .and_then(whole_size);
        if whole == Some(have)
            && let Some(name) = transfer.file
        {
            return finish(transfer.folder, name, transfer.url, have);
        }
        if let Some(name) = transfer.file {
            let _ = fs::remove_file(part_of(transfer.folder, name));
        }
        transfer.done.store(0, Ordering::Relaxed);
        return Err(Failure::Network);
    }
    let total = if status == StatusCode::PARTIAL_CONTENT {
        let range = response
            .headers()
            .get(CONTENT_RANGE)
            .and_then(|value| value.to_str().ok());
        // Continuing from anywhere else would write a broken file with nothing to show for it.
        if range.and_then(range_start) != Some(have) {
            if let Some(name) = transfer.file {
                let _ = fs::remove_file(part_of(transfer.folder, name));
            }
            transfer.done.store(0, Ordering::Relaxed);
            return Err(Failure::Network);
        }
        range.and_then(whole_size)
    } else if status.is_success() {
        // The whole file: the server can't continue, or it has changed.
        have = 0;
        response.content_length()
    } else {
        return Err(Failure::Refused);
    };
    transfer.done.store(have, Ordering::Relaxed);

    if have == 0 && is_page(&response) {
        return Err(Failure::Page);
    }
    let file = match transfer.file {
        Some(name) => name.to_string(),
        None => unused_name(transfer.folder, &name_of(&response, transfer.title)),
    };
    if let (Some(free), Some(whole)) = (free_space(transfer.folder), total)
        && whole.saturating_sub(have) > free
    {
        return Err(Failure::Disk);
    }
    let validator = validator_of(&response);
    on_started(&Started {
        file: file.clone(),
        total,
        validator,
    });

    let part = part_of(transfer.folder, &file);
    let mut output = open_part(&part, have > 0).map_err(|_| Failure::Write)?;
    let mut measured_at = Instant::now();
    let mut measured = have;
    let mut kept_at = Instant::now();
    loop {
        let next = tokio::select! {
            next = response.chunk() => next,
            () = transfer.stop.notified() => return Err(Failure::Stopped),
        };
        let Some(chunk) = next.map_err(|_| Failure::Network)? else {
            break;
        };
        output.write_all(&chunk).map_err(|_| Failure::Write)?;
        have += chunk.len() as u64;
        transfer.done.store(have, Ordering::Relaxed);
        let since = measured_at.elapsed();
        if since >= Duration::from_secs(1) {
            let moved = (have - measured) as f64 / since.as_secs_f64();
            // Averaged, so that what it says, and the time left from it, doesn't jump about.
            let before = transfer.speed.load(Ordering::Relaxed) as f64;
            let speed = if before > 0.0 {
                before * 0.7 + moved * 0.3
            } else {
                moved
            };
            transfer.speed.store(speed as u64, Ordering::Relaxed);
            measured = have;
            measured_at = Instant::now();
        }
        if kept_at.elapsed() >= KEEP_EVERY {
            on_progress(have);
            kept_at = Instant::now();
        }
    }
    output.flush().map_err(|_| Failure::Write)?;
    drop(output);
    // A connection can end early without saying so.
    if total.is_some_and(|whole| whole != have) {
        return Err(Failure::Network);
    }
    finish(transfer.folder, &file, transfer.url, have)
}

fn open_part(part: &Path, keep: bool) -> io::Result<File> {
    if let Some(folder) = part.parent() {
        fs::create_dir_all(folder)?;
    }
    if keep {
        OpenOptions::new().append(true).open(part)
    } else {
        File::create(part)
    }
}

/// The `.part` becomes the file, under a name nothing has taken meanwhile, and is marked.
fn finish(folder: &Path, file: &str, url: &str, size: u64) -> Result<u64, Failure> {
    // Its own `.part` is no reason to change its name: only a file that has arrived there since.
    let done = if folder.join(file).exists() {
        folder.join(unused_name(folder, file))
    } else {
        folder.join(file)
    };
    fs::rename(part_of(folder, file), &done).map_err(|_| Failure::Write)?;
    mark_from_internet(&done, url);
    Ok(size)
}

/// What a browser adds to what it downloads, so Windows' SmartScreen looks at it when it is opened.
/// A folder that can't hold it (not NTFS) simply doesn't have it.
fn mark_from_internet(file: &Path, url: &str) {
    #[cfg(windows)]
    {
        let mut stream = file.as_os_str().to_owned();
        stream.push(":Zone.Identifier");
        let _ = fs::write(
            stream,
            format!("[ZoneTransfer]\r\nZoneId=3\r\nHostUrl={url}\r\n"),
        );
    }
    #[cfg(not(windows))]
    let _ = (file, url);
}

#[cfg(windows)]
fn free_space(folder: &Path) -> Option<u64> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::GetDiskFreeSpaceExW;

    let wide: Vec<u16> = folder
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut free = 0u64;
    // SAFETY: `wide` ends in a zero, and `free` outlives the call. The other two may be null.
    let answered = unsafe {
        GetDiskFreeSpaceExW(
            wide.as_ptr(),
            &mut free,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    (answered != 0).then_some(free)
}

#[cfg(not(windows))]
fn free_space(_folder: &Path) -> Option<u64> {
    None
}

/// `bytes 100-199/200` is 100.
fn range_start(range: &str) -> Option<u64> {
    let rest = range.trim().strip_prefix("bytes ")?;
    rest.split('-').next()?.trim().parse().ok()
}

/// `bytes 100-199/200` and `bytes */200` are 200, and `bytes 0-1/*` nothing.
fn whole_size(range: &str) -> Option<u64> {
    range.rsplit('/').next()?.trim().parse().ok()
}

/// What can tell that a file is still the same one. A weak `ETag` can't be used with `If-Range`.
fn validator_of(response: &reqwest::Response) -> Option<String> {
    let headers = response.headers();
    // A server that says it can't continue isn't asked to.
    if headers
        .get(ACCEPT_RANGES)
        .and_then(|value| value.to_str().ok())
        == Some("none")
    {
        return None;
    }
    let text = |name| {
        headers
            .get(name)
            .and_then(|value: &reqwest::header::HeaderValue| value.to_str().ok())
            .map(str::to_string)
    };
    text(ETAG)
        .filter(|etag| !etag.starts_with("W/"))
        .or_else(|| text(LAST_MODIFIED))
}

/// A web page is not a game: a file host's page, usually, which needs Real-Debrid (ADR 007).
fn is_page(response: &reqwest::Response) -> bool {
    response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|kind| {
            let kind = kind.to_ascii_lowercase();
            kind.starts_with("text/html") || kind.starts_with("application/xhtml")
        })
}

/// The file's name: what the answer says, then the address's end, then the title.
fn name_of(response: &reqwest::Response, title: &str) -> String {
    let said = response
        .headers()
        .get(CONTENT_DISPOSITION)
        .and_then(|value| value.to_str().ok())
        .and_then(name_in_disposition);
    let last = response
        .url()
        .path_segments()
        .and_then(|mut segments| segments.next_back().map(decoded));
    [said, last]
        .into_iter()
        .flatten()
        .map(|name| safe_name(&name))
        .find(|name| !name.is_empty())
        .unwrap_or_else(|| {
            let name = safe_name(title);
            if name.is_empty() {
                "download".to_string()
            } else {
                name
            }
        })
}

fn decoded(text: &str) -> String {
    percent_decode(text)
}

/// `%20` and its kind, in UTF-8. What can't be read stays as it was.
fn percent_decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%'
            && let Some(pair) = text.get(at + 1..at + 3)
            && let Ok(byte) = u8::from_str_radix(pair, 16)
        {
            out.push(byte);
            at += 3;
        } else {
            out.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8(out).unwrap_or_else(|_| text.to_string())
}

/// `attachment; filename*=UTF-8''a%20b.zip; filename="a b.zip"`: the first form wins, as in a browser.
fn name_in_disposition(header: &str) -> Option<String> {
    let part = |key: &str| {
        header.split(';').find_map(|part| {
            let (name, value) = part.split_once('=')?;
            name.trim()
                .eq_ignore_ascii_case(key)
                .then(|| value.trim().trim_matches('"').to_string())
        })
    };
    part("filename*")
        .and_then(|value| {
            let (_charset_and_language, name) = value.rsplit_once('\'')?;
            Some(percent_decode(name))
        })
        .or_else(|| part("filename"))
}

/// A name from outside, as one file in the folder chosen and nothing else: no way out of it, nothing
/// Windows treats as something else, and a length it takes.
pub fn safe_name(name: &str) -> String {
    // The last piece of any path, whichever slash it uses.
    let last = name.rsplit(['/', '\\']).next().unwrap_or("");
    let cleaned: String = last
        .chars()
        .filter(|c| !c.is_control() && !matches!(c, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
        .collect();
    let cleaned = cleaned
        .trim()
        .trim_end_matches(['.', ' '])
        .trim_start_matches('.');
    let stem = cleaned.split('.').next().unwrap_or("").trim();
    let reserved = matches!(
        stem.to_ascii_uppercase().as_str(),
        "CON" | "PRN" | "AUX" | "NUL"
    ) || (stem.len() == 4
        && (stem[..3].eq_ignore_ascii_case("COM") || stem[..3].eq_ignore_ascii_case("LPT"))
        && stem.as_bytes()[3].is_ascii_digit());
    let cleaned = if reserved {
        format!("_{cleaned}")
    } else {
        cleaned.to_string()
    };
    if cleaned.chars().count() <= MOST_NAME {
        return cleaned;
    }
    // Cut from the middle, so the kind of file it is stays.
    let (stem, kind) = cleaned.rsplit_once('.').unwrap_or((&cleaned, ""));
    let kind: String = kind.chars().take(16).collect();
    let keep = MOST_NAME - kind.chars().count() - 1;
    let stem: String = stem.chars().take(keep).collect();
    format!("{}.{kind}", stem.trim_end())
}

/// A name nothing in the folder has, nor its `.part`, so nothing there is ever written over.
fn unused_name(folder: &Path, name: &str) -> String {
    let free =
        |candidate: &str| !folder.join(candidate).exists() && !part_of(folder, candidate).exists();
    if free(name) {
        return name.to_string();
    }
    let (stem, kind) = match name.rsplit_once('.') {
        Some((stem, kind)) if !stem.is_empty() => (stem, format!(".{kind}")),
        _ => (name, String::new()),
    };
    (2..)
        .map(|count| format!("{stem} ({count}){kind}"))
        .find(|candidate| free(candidate))
        .expect("numbers don't run out")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpListener;
    use std::sync::atomic::AtomicUsize;

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-downloads-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    /// One request answered; what was asked is handed back.
    fn serve(answers: Vec<Vec<u8>>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let mut asked = Vec::new();
            for answer in answers {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                let size = stream.read(&mut buffer).unwrap();
                asked.push(String::from_utf8_lossy(&buffer[..size]).into_owned());
                let _ = stream.write_all(&answer);
            }
            asked
        });
        (address, handle)
    }

    fn answer(status: &str, headers: &str, body: &[u8]) -> Vec<u8> {
        let mut bytes = format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n",
            body.len()
        )
        .into_bytes();
        bytes.extend_from_slice(body);
        bytes
    }

    struct Attempt {
        outcome: Result<u64, Failure>,
        started: Option<Started>,
        done: u64,
    }

    fn attempt(url: &str, dir: &Path, file: Option<&str>, validator: Option<&str>) -> Attempt {
        let done = AtomicU64::new(0);
        let speed = AtomicU64::new(0);
        let stop = Notify::new();
        let mut started = None;
        let outcome = tauri::async_runtime::block_on(fetch(
            &client("0.0.0").unwrap(),
            Transfer {
                url,
                folder: dir,
                title: "A made-up game",
                file,
                validator,
                done: &done,
                speed: &speed,
                stop: &stop,
            },
            |said| {
                started = Some(Started {
                    file: said.file.clone(),
                    total: said.total,
                    validator: said.validator.clone(),
                })
            },
            |_| {},
        ));
        Attempt {
            outcome,
            started,
            done: done.load(Ordering::Relaxed),
        }
    }

    #[test]
    fn downloads_a_file_under_the_addresss_name() {
        let dir = folder("whole");
        let (address, server) = serve(vec![answer(
            "200 OK",
            "ETag: \"one\"\r\nContent-Type: application/zip\r\n",
            b"the whole file",
        )]);
        let got = attempt(&format!("{address}/a%20game.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.outcome, Ok(14));
        let started = got.started.unwrap();
        assert_eq!(started.file, "a game.zip");
        assert_eq!(started.total, Some(14));
        assert_eq!(started.validator.as_deref(), Some("\"one\""));
        assert_eq!(fs::read(dir.join("a game.zip")).unwrap(), b"the whole file");
        assert!(!dir.join("a game.zip.part").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn marks_what_arrives_as_from_the_internet() {
        let dir = folder("mark");
        let (address, server) = serve(vec![answer("200 OK", "", b"x")]);
        let url = format!("{address}/a.zip");
        attempt(&url, &dir, None, None).outcome.unwrap();
        server.join().unwrap();
        let mark = fs::read_to_string(dir.join("a.zip:Zone.Identifier")).unwrap();
        assert!(mark.contains("ZoneId=3"));
        assert!(mark.contains(&url));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn takes_the_name_the_answer_gives_and_makes_it_safe() {
        let dir = folder("said");
        let (address, server) = serve(vec![answer(
            "200 OK",
            "Content-Disposition: attachment; filename=\"..\\..\\Windows\\evil.zip\"\r\n",
            b"x",
        )]);
        let got = attempt(&format!("{address}/ignored.bin"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.started.unwrap().file, "evil.zip");
        assert!(dir.join("evil.zip").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn never_writes_over_what_is_there() {
        let dir = folder("taken");
        fs::write(dir.join("a.zip"), "mine").unwrap();
        let (address, server) = serve(vec![answer("200 OK", "", b"new")]);
        let got = attempt(&format!("{address}/a.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.started.unwrap().file, "a (2).zip");
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"mine");
        assert_eq!(fs::read(dir.join("a (2).zip")).unwrap(), b"new");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_web_page_is_not_a_file() {
        let dir = folder("page");
        let (address, server) = serve(vec![answer(
            "200 OK",
            "Content-Type: text/html; charset=utf-8\r\n",
            b"<html>a file host's page</html>",
        )]);
        let got = attempt(&format!("{address}/a.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.outcome, Err(Failure::Page));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_error_is_refused_and_writes_nothing() {
        let dir = folder("error");
        let (address, server) = serve(vec![answer("404 Not Found", "", b"no")]);
        let got = attempt(&format!("{address}/a.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.outcome, Err(Failure::Refused));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_a_link_it_would_not_read() {
        let dir = folder("link");
        let got = attempt("https://192.168.1.1/a.zip", &dir, None, None);
        assert_eq!(got.outcome, Err(Failure::Refused));
        let got = attempt("file:///C:/Windows/win.ini", &dir, None, None);
        assert_eq!(got.outcome, Err(Failure::Refused));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_redirect_elsewhere_is_held_to_the_same_rule() {
        let dir = folder("redirect");
        let (address, server) = serve(vec![answer(
            "302 Found",
            "Location: http://192.168.1.1/secret\r\n",
            b"",
        )]);
        let got = attempt(&format!("{address}/a.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.outcome, Err(Failure::Refused));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn continues_from_where_it_stopped_if_the_file_is_the_same() {
        let dir = folder("resume");
        fs::write(dir.join("a.zip.part"), "the first ").unwrap();
        let (address, server) = serve(vec![answer(
            "206 Partial Content",
            "Content-Range: bytes 10-18/19\r\nETag: \"one\"\r\n",
            b"and rest!",
        )]);
        let got = attempt(
            &format!("{address}/a.zip"),
            &dir,
            Some("a.zip"),
            Some("\"one\""),
        );
        let asked = server.join().unwrap();
        assert_eq!(got.outcome, Ok(19));
        assert_eq!(got.done, 19);
        let asked = asked[0].to_lowercase();
        assert!(asked.contains("range: bytes=10-"));
        assert!(asked.contains("if-range: \"one\""));
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"the first and rest!");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn starts_over_when_the_file_has_changed() {
        let dir = folder("changed");
        fs::write(dir.join("a.zip.part"), "from the old file").unwrap();
        // `If-Range` didn't match: the server answers with the whole new one.
        let (address, server) = serve(vec![answer("200 OK", "ETag: \"two\"\r\n", b"new file")]);
        let got = attempt(
            &format!("{address}/a.zip"),
            &dir,
            Some("a.zip"),
            Some("\"one\""),
        );
        server.join().unwrap();
        assert_eq!(got.outcome, Ok(8));
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"new file");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn without_a_validator_it_does_not_trust_what_is_there() {
        let dir = folder("no-validator");
        fs::write(dir.join("a.zip.part"), "unknown bytes").unwrap();
        let (address, server) = serve(vec![answer("200 OK", "", b"whole")]);
        let got = attempt(&format!("{address}/a.zip"), &dir, Some("a.zip"), None);
        let asked = server.join().unwrap();
        assert!(!asked[0].to_lowercase().contains("range:"));
        assert_eq!(got.outcome, Ok(5));
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"whole");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_range_that_starts_elsewhere_is_not_appended() {
        let dir = folder("wrong-range");
        fs::write(dir.join("a.zip.part"), "0123456789").unwrap();
        let (address, server) = serve(vec![answer(
            "206 Partial Content",
            "Content-Range: bytes 5-9/10\r\n",
            b"56789",
        )]);
        let got = attempt(
            &format!("{address}/a.zip"),
            &dir,
            Some("a.zip"),
            Some("\"one\""),
        );
        server.join().unwrap();
        assert_eq!(got.outcome, Err(Failure::Network));
        assert!(!dir.join("a.zip").exists());
        assert!(!dir.join("a.zip.part").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn past_the_end_means_it_has_all_of_it() {
        let dir = folder("all-there");
        fs::write(dir.join("a.zip.part"), "0123456789").unwrap();
        let (address, server) = serve(vec![answer(
            "416 Range Not Satisfiable",
            "Content-Range: bytes */10\r\n",
            b"",
        )]);
        let got = attempt(
            &format!("{address}/a.zip"),
            &dir,
            Some("a.zip"),
            Some("\"one\""),
        );
        server.join().unwrap();
        assert_eq!(got.outcome, Ok(10));
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"0123456789");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_connection_that_ends_early_keeps_what_came_to_continue() {
        let dir = folder("short");
        let mut short = answer("200 OK", "ETag: \"one\"\r\n", b"0123456789");
        short.truncate(short.len() - 6);
        let (address, server) = serve(vec![short]);
        let got = attempt(&format!("{address}/a.zip"), &dir, None, None);
        server.join().unwrap();
        assert_eq!(got.outcome, Err(Failure::Network));
        assert!(!dir.join("a.zip").exists());
        assert_eq!(fs::read(dir.join("a.zip.part")).unwrap(), b"0123");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_name_from_outside_stays_one_file_in_the_folder() {
        for (given, safe) in [
            ("game.zip", "game.zip"),
            ("..\\..\\Windows\\System32\\evil.dll", "evil.dll"),
            ("../../etc/passwd", "passwd"),
            ("C:\\Windows\\win.ini", "win.ini"),
            ("a:b.zip", "ab.zip"),
            ("a?b*c.zip", "abc.zip"),
            ("name.zip:Zone.Identifier", "name.zipZone.Identifier"),
            ("trailing... ", "trailing"),
            ("..", ""),
            (".hidden", "hidden"),
            ("CON", "_CON"),
            ("con.zip", "_con.zip"),
            ("COM1.txt", "_COM1.txt"),
            ("Console.zip", "Console.zip"),
            ("tab\there.zip", "tabhere.zip"),
            ("", ""),
        ] {
            assert_eq!(safe_name(given), safe, "{given}");
        }
        let long = safe_name(&format!("{}.zip", "x".repeat(400)));
        assert_eq!(long.chars().count(), MOST_NAME);
        assert!(long.ends_with(".zip"));
    }

    #[test]
    fn reads_what_a_disposition_says() {
        assert_eq!(
            name_in_disposition("attachment; filename=\"a b.zip\"").as_deref(),
            Some("a b.zip")
        );
        assert_eq!(
            name_in_disposition(
                "attachment; filename=\"old.zip\"; filename*=UTF-8''new%20n%C3%A3o.zip"
            )
            .as_deref(),
            Some("new não.zip")
        );
        assert_eq!(name_in_disposition("inline"), None);
    }

    #[test]
    fn reads_a_content_range() {
        assert_eq!(range_start("bytes 100-199/200"), Some(100));
        assert_eq!(whole_size("bytes 100-199/200"), Some(200));
        assert_eq!(whole_size("bytes */200"), Some(200));
        assert_eq!(whole_size("bytes 0-1/*"), None);
        assert_eq!(range_start("nonsense"), None);
    }

    #[cfg(windows)]
    #[test]
    fn asks_windows_how_much_room_there_is() {
        let dir = folder("room");
        assert!(free_space(&dir).is_some_and(|free| free > 0));
        fs::remove_dir_all(dir).unwrap();
    }

    fn added(downloads: &Downloads, id: &str, links: Vec<String>, dir: &Path) {
        downloads
            .add(
                id.into(),
                "A made-up game".into(),
                "Made-up source".into(),
                Through::Direct,
                links,
                Vec::new(),
                dir.to_path_buf(),
                None,
                1,
            )
            .unwrap();
    }

    fn nobody_signed_in() -> Arc<RealDebrid> {
        double::at("http://127.0.0.1:9".into(), double::memory(None))
    }

    /// Runs the app's task until `ready`, for a few seconds at most.
    fn until(downloads: &Arc<Downloads>, ready: impl Fn(&[View]) -> bool) -> Vec<View> {
        let task =
            tauri::async_runtime::spawn(run(downloads.clone(), nobody_signed_in(), "0.0.0".into()));
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut seen = downloads.all();
        while Instant::now() < deadline {
            seen = downloads.all();
            if ready(&seen) {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        task.abort();
        seen
    }

    #[test]
    fn the_task_goes_to_the_next_place_when_a_link_is_a_page() {
        let dir = folder("mirror");
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        let (address, server) = serve(vec![
            answer("200 OK", "Content-Type: text/html\r\n", b"a page"),
            answer("200 OK", "", b"the file"),
        ]);
        added(
            &downloads,
            "one",
            vec![format!("{address}/page"), format!("{address}/a.zip")],
            &dir,
        );
        let seen = until(&downloads, |all| all[0].state == State::Done);
        server.join().unwrap();
        assert_eq!(seen[0].state, State::Done);
        assert_eq!(seen[0].file.as_deref(), Some("a.zip"));
        assert_eq!(seen[0].done, 8);
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"the file");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn says_why_when_every_link_is_a_page() {
        let dir = folder("all-pages");
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        let (address, server) = serve(vec![answer(
            "200 OK",
            "Content-Type: text/html\r\n",
            b"a page",
        )]);
        added(&downloads, "one", vec![format!("{address}/page")], &dir);
        let seen = until(&downloads, |all| all[0].state == State::Failed);
        server.join().unwrap();
        assert_eq!(seen[0].why, Some(Why::Page));
        fs::remove_dir_all(dir).unwrap();
    }

    /// Sends the start of a file, then holds the connection open until told to let go.
    fn serve_slowly() -> (String, Arc<AtomicUsize>, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let release = Arc::new(AtomicUsize::new(0));
        let released = release.clone();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut buffer = [0; 4096];
            let _ = stream.read(&mut buffer).unwrap();
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\nETag: \"one\"\r\n\r\n01234")
                .unwrap();
            stream.flush().unwrap();
            let deadline = Instant::now() + Duration::from_secs(10);
            while released.load(Ordering::Relaxed) == 0 && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(10));
            }
        });
        (address, release, handle)
    }

    #[test]
    fn pause_lets_go_at_once_and_keeps_what_came() {
        let dir = folder("pause");
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        let (address, release, server) = serve_slowly();
        added(&downloads, "one", vec![format!("{address}/a.zip")], &dir);
        let task =
            tauri::async_runtime::spawn(run(downloads.clone(), nobody_signed_in(), "0.0.0".into()));
        let deadline = Instant::now() + Duration::from_secs(10);
        while downloads.all()[0].done < 5 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        assert_eq!(downloads.all()[0].state, State::Downloading);

        downloads.pause("one").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while downloads.running.lock().unwrap().is_some() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        task.abort();
        release.store(1, Ordering::Relaxed);
        server.join().unwrap();
        let seen = downloads.all();
        assert_eq!((seen[0].state, seen[0].done), (State::Paused, 5));
        assert_eq!(fs::read(dir.join("a.zip.part")).unwrap(), b"01234");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn cancel_on_one_under_way_takes_its_part_too() {
        let dir = folder("cancel");
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        let (address, release, server) = serve_slowly();
        added(&downloads, "one", vec![format!("{address}/a.zip")], &dir);
        let task =
            tauri::async_runtime::spawn(run(downloads.clone(), nobody_signed_in(), "0.0.0".into()));
        let deadline = Instant::now() + Duration::from_secs(10);
        while downloads.all()[0].done < 5 && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        downloads.remove("one").unwrap();
        let deadline = Instant::now() + Duration::from_secs(5);
        while !downloads.all().is_empty() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        task.abort();
        release.store(1, Ordering::Relaxed);
        server.join().unwrap();
        assert!(downloads.all().is_empty());
        assert!(!dir.join("a.zip.part").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn one_under_way_when_the_app_ended_waits_to_be_resumed() {
        let dir = folder("restart");
        let app = dir.join("app");
        let downloads = Downloads::open(&app);
        added(
            &downloads,
            "one",
            vec!["https://a.example/a.zip".into()],
            &dir,
        );
        {
            let mut kept = downloads.kept.lock().unwrap();
            kept[0].file = Some("a.zip".into());
            kept[0].state = State::Downloading;
            downloads.save(&kept).unwrap();
        }
        fs::write(dir.join("a.zip.part"), "1234").unwrap();

        let again = Downloads::open(&app);
        let seen = again.all();
        assert_eq!((seen[0].state, seen[0].done), (State::Paused, 4));
        assert!(again.take_next().is_none());
        again.resume("one").unwrap();
        assert_eq!(again.all()[0].state, State::Queued);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_page_is_never_told_a_link() {
        let dir = folder("view");
        let downloads = Downloads::open(&dir.join("app"));
        added(
            &downloads,
            "one",
            vec!["https://a.example/secret.zip".into()],
            &dir,
        );
        let view = serde_json::to_string(&downloads.all()).unwrap();
        assert!(!view.contains("secret"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn knows_a_link_it_is_already_on() {
        let dir = folder("duplicate");
        let downloads = Downloads::open(&dir.join("app"));
        let links = vec!["https://a.example/a.zip".to_string()];
        added(&downloads, "one", links.clone(), &dir);
        assert!(downloads.has_link(&links));
        assert!(!downloads.has_link(&["https://a.example/b.zip".to_string()]));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn taking_one_off_the_list_leaves_a_finished_file_and_takes_a_part() {
        let dir = folder("off");
        let downloads = Downloads::open(&dir.join("app"));
        added(&downloads, "done", vec!["https://a.example/a".into()], &dir);
        added(&downloads, "part", vec!["https://a.example/b".into()], &dir);
        {
            let mut kept = downloads.kept.lock().unwrap();
            kept[0].file = Some("a.zip".into());
            kept[0].state = State::Done;
            kept[1].file = Some("b.zip".into());
            kept[1].state = State::Paused;
        }
        fs::write(dir.join("a.zip"), "whole").unwrap();
        fs::write(dir.join("b.zip.part"), "some").unwrap();
        assert_eq!(downloads.finished_file("done").unwrap(), dir.join("a.zip"));
        assert_eq!(downloads.finished_file("part"), Err(Refusal::Missing));

        downloads.remove("done").unwrap();
        downloads.remove("part").unwrap();
        assert!(dir.join("a.zip").exists());
        assert!(!dir.join("b.zip.part").exists());
        assert_eq!(downloads.remove("nope"), Err(Refusal::Missing));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_it_cannot_read_is_put_aside_not_lost() {
        let dir = folder("unreadable");
        fs::write(dir.join(FILE), "{ half a fi").unwrap();
        assert!(Downloads::open(&dir).all().is_empty());
        assert_eq!(
            fs::read_to_string(dir.join("downloads.unreadable.json")).unwrap(),
            "{ half a fi"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    /// Real-Debrid's stand-in with one torrent, which goes through what a real one does. It serves
    /// its own "generated" files too, under `/files/`.
    fn debrid_double(
        files: Vec<(&'static str, &'static str)>,
        statuses: Vec<&'static str>,
    ) -> (String, Arc<Mutex<Vec<String>>>) {
        use double::{answer as said, serve};
        let asked = Arc::new(Mutex::new(Vec::new()));
        let seen = asked.clone();
        let step = AtomicUsize::new(0);
        let address = Arc::new(Mutex::new(String::new()));
        let at = address.clone();
        let base = serve(move |request| {
            seen.lock().unwrap().push(request.line.clone());
            let line = request.line.as_str();
            let base = at.lock().unwrap().clone();
            if line.ends_with("/rest/1.0/torrents?limit=1000") {
                said("200 OK", "[]")
            } else if line.ends_with("/torrents/addMagnet") {
                said("201 Created", r#"{"id":"T1"}"#)
            } else if line.contains("/torrents/selectFiles/") {
                assert!(request.body.contains("files=all"));
                said("204 No Content", "")
            } else if line.contains("/torrents/delete/") {
                said("204 No Content", "")
            } else if line.contains("/torrents/info/") {
                let now = step.fetch_add(1, Ordering::Relaxed);
                let status = statuses[now.min(statuses.len() - 1)];
                let names: Vec<String> = files
                    .iter()
                    .enumerate()
                    .map(|(at, (name, body))| {
                        format!(
                            r#"{{"id":{at},"path":"/{name}","bytes":{},"selected":1}}"#,
                            body.len()
                        )
                    })
                    .collect();
                let links: Vec<String> = files
                    .iter()
                    .map(|(name, _)| format!("\"https://host.example/{name}\""))
                    .collect();
                said(
                    "200 OK",
                    &format!(
                        r#"{{"status":"{status}","progress":40,"files":[{}],"links":[{}]}}"#,
                        names.join(","),
                        links.join(",")
                    ),
                )
            } else if line.ends_with("/unrestrict/link") {
                let wanted = request.body.rsplit("%2F").next().unwrap_or("").to_string();
                let wanted = percent_decode(&wanted);
                if wanted.starts_with("unsupported") {
                    return said(
                        "503 Unavailable",
                        r#"{"error":"hoster_unsupported","error_code":16}"#,
                    );
                }
                let size = files
                    .iter()
                    .find(|(name, _)| name.ends_with(wanted.as_str()))
                    .map_or(0, |(_, body)| body.len());
                said(
                    "200 OK",
                    &format!(
                        r#"{{"filename":"{wanted}","filesize":{size},"download":"{base}/files/{wanted}"}}"#
                    ),
                )
            } else if let Some(at) = line.find("/files/") {
                let wanted = &line[at + "/files/".len()..];
                let body = files
                    .iter()
                    .find(|(name, _)| name.ends_with(wanted))
                    .map_or("", |(_, body)| body);
                said("200 OK", body)
            } else {
                said("404 Not Found", "")
            }
        });
        *address.lock().unwrap() = base.clone();
        (base, asked)
    }

    fn through(
        dir: &Path,
        base: String,
        links: Vec<String>,
        parts: Vec<Vec<String>>,
    ) -> (Arc<Downloads>, tauri::async_runtime::JoinHandle<()>) {
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        downloads
            .add(
                "one".into(),
                "A made-up game".into(),
                "Made-up source".into(),
                Through::RealDebrid,
                links,
                parts,
                dir.to_path_buf(),
                None,
                1,
            )
            .unwrap();
        let debrid = double::at(
            base,
            double::memory(Some(&double::signed_in_tokens(u64::MAX / 2))),
        );
        let task = tauri::async_runtime::spawn(run(downloads.clone(), debrid, "0.0.0".into()));
        (downloads, task)
    }

    fn wait_for(downloads: &Downloads, ready: impl Fn(&View) -> bool) -> View {
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            let seen = downloads.all().remove(0);
            if ready(&seen) || Instant::now() > deadline {
                return seen;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    const MAGNET: &str = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567";

    #[test]
    fn a_magnet_goes_through_real_debrid_into_a_folder_of_its_own() {
        let dir = folder("rd-magnet");
        let (base, asked) = debrid_double(
            vec![
                ("setup.bin", "first file"),
                ("data/two.bin", "the second file"),
            ],
            vec![
                "magnet_conversion",
                "waiting_files_selection",
                "downloading",
                "downloaded",
            ],
        );
        let (downloads, task) = through(&dir, base, vec![MAGNET.into()], Vec::new());
        let remote = wait_for(&downloads, |seen| seen.state == State::Remote);
        assert_eq!(remote.state, State::Remote);
        let seen = wait_for(&downloads, |seen| seen.state == State::Done);
        task.abort();
        assert_eq!(seen.state, State::Done, "{seen:?}");
        assert_eq!(seen.total, Some(25));
        assert_eq!(seen.done, 25);
        assert_eq!(seen.remote, None);
        let base = dir.join("A made-up game");
        assert_eq!(fs::read(base.join("setup.bin")).unwrap(), b"first file");
        assert_eq!(
            fs::read(base.join("data").join("two.bin")).unwrap(),
            b"the second file"
        );
        let asked = asked.lock().unwrap();
        assert!(
            asked
                .iter()
                .any(|line| line.ends_with("/torrents/selectFiles/T1"))
        );
        // Added once, however many times it was asked about.
        assert_eq!(
            asked
                .iter()
                .filter(|line| line.ends_with("addMagnet"))
                .count(),
            1
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_hosts_link_goes_first_and_needs_no_torrent() {
        let dir = folder("rd-host");
        let (base, asked) = debrid_double(vec![("a.zip", "from a host")], vec!["downloaded"]);
        let (downloads, task) = through(
            &dir,
            base,
            vec!["https://host.example/a.zip".into(), MAGNET.into()],
            Vec::new(),
        );
        let seen = wait_for(&downloads, |seen| seen.state == State::Done);
        task.abort();
        assert_eq!(seen.file.as_deref(), Some("a.zip"));
        assert_eq!(fs::read(dir.join("a.zip")).unwrap(), b"from a host");
        assert!(
            !asked
                .lock()
                .unwrap()
                .iter()
                .any(|line| line.contains("addMagnet"))
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_host_it_cannot_open_falls_to_the_magnet() {
        let dir = folder("rd-fallback");
        let (base, asked) = debrid_double(vec![("a.zip", "from a torrent")], vec!["downloaded"]);
        let (downloads, task) = through(
            &dir,
            base,
            vec![
                "https://nowhere.example/unsupported.zip".into(),
                MAGNET.into(),
            ],
            Vec::new(),
        );
        let seen = wait_for(&downloads, |seen| seen.state == State::Done);
        task.abort();
        assert_eq!(seen.state, State::Done, "{seen:?}");
        assert!(
            asked
                .lock()
                .unwrap()
                .iter()
                .any(|line| line.ends_with("addMagnet"))
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn says_so_when_nothing_can_be_opened() {
        let dir = folder("rd-none");
        let (base, _) = debrid_double(Vec::new(), vec!["downloaded"]);
        let (downloads, task) = through(
            &dir,
            base,
            vec!["https://nowhere.example/unsupported.zip".into()],
            Vec::new(),
        );
        let seen = wait_for(&downloads, |seen| seen.state == State::Failed);
        task.abort();
        assert_eq!(seen.why, Some(Why::Host));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_mirror_in_parts_comes_as_a_set_in_order() {
        let dir = folder("rd-parts");
        let (base, _) = debrid_double(
            vec![("game.part1.rar", "one"), ("game.part2.rar", "two")],
            vec!["downloaded"],
        );
        let (downloads, task) = through(
            &dir,
            base,
            Vec::new(),
            vec![vec![
                "https://host.example/game.part1.rar".into(),
                "https://host.example/game.part2.rar".into(),
            ]],
        );
        let seen = wait_for(&downloads, |seen| seen.state == State::Done);
        task.abort();
        assert_eq!(seen.state, State::Done, "{seen:?}");
        let base = dir.join("A made-up game");
        assert_eq!(fs::read(base.join("game.part1.rar")).unwrap(), b"one");
        assert_eq!(fs::read(base.join("game.part2.rar")).unwrap(), b"two");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn says_what_went_wrong_on_its_servers() {
        for (status, why) in [
            ("dead", Why::Dead),
            ("virus", Why::Virus),
            ("magnet_error", Why::Dead),
        ] {
            let dir = folder(&format!("rd-{status}"));
            let (base, _) = debrid_double(Vec::new(), vec![status]);
            let (downloads, task) = through(&dir, base, vec![MAGNET.into()], Vec::new());
            let seen = wait_for(&downloads, |seen| seen.state == State::Failed);
            task.abort();
            assert_eq!(seen.why, Some(why), "{status}");
            fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn says_when_nobody_is_signed_in() {
        let dir = folder("rd-out");
        let downloads = Arc::new(Downloads::open(&dir.join("app")));
        downloads
            .add(
                "one".into(),
                "A made-up game".into(),
                "Made-up source".into(),
                Through::RealDebrid,
                vec![MAGNET.into()],
                Vec::new(),
                dir.clone(),
                None,
                1,
            )
            .unwrap();
        let task =
            tauri::async_runtime::spawn(run(downloads.clone(), nobody_signed_in(), "0.0.0".into()));
        let seen = wait_for(&downloads, |seen| seen.state == State::Failed);
        task.abort();
        assert_eq!(seen.why, Some(Why::SignedOut));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn pausing_while_it_fetches_keeps_the_torrent_for_later_and_cancel_takes_it_off() {
        let dir = folder("rd-pause");
        let (base, asked) = debrid_double(vec![("a.zip", "x")], vec!["downloading"]);
        let (downloads, task) = through(&dir, base, vec![MAGNET.into()], Vec::new());
        wait_for(&downloads, |seen| seen.remote == Some(40));
        downloads.pause("one").unwrap();
        let seen = wait_for(&downloads, |seen| seen.state == State::Paused);
        assert_eq!((seen.state, seen.remote), (State::Paused, None));
        let deadline = Instant::now() + Duration::from_secs(5);
        while downloads.running.lock().unwrap().is_some() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(10));
        }
        task.abort();
        assert_eq!(downloads.remove("one").unwrap().as_deref(), Some("T1"));
        // Reading what was asked: pausing didn't take it off the account.
        assert!(
            !asked
                .lock()
                .unwrap()
                .iter()
                .any(|line| line.contains("delete"))
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_torrent_already_on_the_account_is_not_taken_off_by_cancel() {
        let dir = folder("rd-theirs");
        let downloads = Downloads::open(&dir.join("app"));
        added(&downloads, "one", vec![MAGNET.into()], &dir);
        downloads.change("one", |kept| {
            kept.torrent = Some("THEIRS".into());
            kept.torrent_ours = false;
            kept.state = State::Paused;
        });
        assert_eq!(downloads.remove("one").unwrap(), None);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_torrents_paths_stay_inside_the_folder() {
        let info = real_debrid::Torrent {
            status: "downloaded".into(),
            progress: 100.0,
            links: vec![
                "https://host.example/1".into(),
                "https://host.example/2".into(),
            ],
            files: vec![
                real_debrid::TorrentFile {
                    path: "/../../Windows/evil.dll".into(),
                    bytes: 1,
                    selected: 1,
                },
                real_debrid::TorrentFile {
                    path: "/left out.nfo".into(),
                    bytes: 1,
                    selected: 0,
                },
                real_debrid::TorrentFile {
                    path: "/sub\\CON/ok.bin".into(),
                    bytes: 2,
                    selected: 1,
                },
            ],
        };
        let pieces = pieces_of_torrent(&info);
        assert_eq!(pieces[0].folders, ["Windows"]);
        assert_eq!(pieces[0].file.as_deref(), Some("evil.dll"));
        assert_eq!(pieces[1].folders, ["sub", "_CON"]);
        assert_eq!(pieces[1].file.as_deref(), Some("ok.bin"));
        assert_eq!(pieces[1].size, Some(2));
    }

    #[test]
    fn an_archive_of_a_torrents_files_takes_the_name_it_is_given() {
        let info = real_debrid::Torrent {
            status: "downloaded".into(),
            progress: 100.0,
            links: vec!["https://host.example/archive".into()],
            files: vec![
                real_debrid::TorrentFile {
                    path: "/a.bin".into(),
                    bytes: 1,
                    selected: 1,
                },
                real_debrid::TorrentFile {
                    path: "/b.bin".into(),
                    bytes: 1,
                    selected: 1,
                },
            ],
        };
        let pieces = pieces_of_torrent(&info);
        assert_eq!(pieces.len(), 1);
        assert_eq!(pieces[0].file, None);
        assert_eq!(pieces[0].size, None);
    }

    /// A download that has finished with this file, or this folder of them.
    fn finished(app: &Path, dir: &Path, file: &str, entry: Option<&str>) -> Arc<Downloads> {
        let downloads = Arc::new(Downloads::open(app));
        downloads
            .add(
                "one".into(),
                "A made-up game".into(),
                "Made-up source".into(),
                Through::Direct,
                vec!["https://example.invalid/a.zip".into()],
                Vec::new(),
                dir.to_path_buf(),
                entry.map(str::to_string),
                1,
            )
            .unwrap();
        downloads.change("one", |download| {
            download.state = State::Done;
            download.file = Some(file.to_string());
            download.find_archives();
        });
        downloads
    }

    fn zip_at(path: &Path, files: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        for (name, bytes) in files {
            zip.start_file(*name, zip::write::SimpleFileOptions::default())
                .unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    /// It waits for the next for as long as the process lasts, as it does in the app.
    fn opening_thread(downloads: &Arc<Downloads>) {
        let downloads = downloads.clone();
        std::thread::spawn(move || run_extractions(downloads));
    }

    fn opened(state: Opening) -> impl Fn(&View) -> bool {
        move |seen| {
            seen.extraction
                .as_ref()
                .is_some_and(|each| each.state == state)
        }
    }

    #[test]
    fn a_finished_archive_is_opened_when_asked_into_a_folder_beside_it() {
        let dir = folder("extract");
        let app = folder("extract-app");
        zip_at(&dir.join("a.zip"), &[("bin/game.exe", b"not a game")]);
        let downloads = finished(&app, &dir, "a.zip", Some("an-entry"));
        assert_eq!(downloads.all()[0].archives, 1);
        assert_eq!(downloads.all()[0].extraction, None);
        assert_eq!(downloads.folder_for_game("an-entry"), Some(dir.clone()));

        opening_thread(&downloads);
        downloads.extract("one").unwrap();
        let extraction = wait_for(&downloads, opened(Opening::Done))
            .extraction
            .unwrap();
        assert_eq!((extraction.done, extraction.total), (10, 10));
        let out = dir.join("a");
        assert_eq!(fs::read(out.join("game.exe")).unwrap(), b"not a game");
        assert!(dir.join("a.zip").is_file(), "the archive stays");
        assert!(!dir.join("a.part").exists());
        assert_eq!(downloads.finished_file("one"), Ok(out.clone()));
        assert_eq!(downloads.folder_for_game("an-entry"), Some(out));
        assert_eq!(downloads.folder_for_game("another"), None);
    }

    #[test]
    fn a_folder_already_there_is_never_written_into() {
        let dir = folder("extract-taken");
        let app = folder("extract-taken-app");
        zip_at(&dir.join("a.zip"), &[("b.txt", b"new")]);
        fs::create_dir_all(dir.join("a")).unwrap();
        fs::write(dir.join("a").join("b.txt"), "old").unwrap();
        let downloads = finished(&app, &dir, "a.zip", None);
        opening_thread(&downloads);
        downloads.extract("one").unwrap();
        wait_for(&downloads, opened(Opening::Done));
        assert_eq!(fs::read(dir.join("a").join("b.txt")).unwrap(), b"old");
        assert_eq!(fs::read(dir.join("a (2)").join("b.txt")).unwrap(), b"new");
    }

    #[test]
    fn an_archive_that_would_leave_its_folder_writes_nothing_and_says_so() {
        let dir = folder("extract-bad");
        let app = folder("extract-bad-app");
        zip_at(
            &dir.join("a.zip"),
            &[("fine.txt", b"a"), ("../outside.txt", b"b")],
        );
        let downloads = finished(&app, &dir, "a.zip", None);
        opening_thread(&downloads);
        downloads.extract("one").unwrap();
        let seen = wait_for(&downloads, opened(Opening::Failed));
        assert_eq!(seen.extraction.unwrap().why, Some(extract::Failure::Unsafe));
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1, "only the archive");
        assert!(!dir.parent().unwrap().join("outside.txt").exists());
    }

    #[test]
    fn what_is_no_archive_has_nothing_to_open() {
        let dir = folder("extract-none");
        let app = folder("extract-none-app");
        fs::write(dir.join("setup.exe"), "MZ").unwrap();
        let downloads = finished(&app, &dir, "setup.exe", None);
        assert_eq!(downloads.all()[0].archives, 0);
        assert_eq!(downloads.extract("one"), Err(Refusal::Missing));
    }

    #[test]
    fn stopping_takes_back_what_had_come_out() {
        let dir = folder("extract-stop");
        let app = folder("extract-stop-app");
        zip_at(&dir.join("a.zip"), &[("b.txt", b"hello")]);
        let downloads = finished(&app, &dir, "a.zip", None);
        downloads.extract("one").unwrap();
        let job = downloads.take_next_extraction();
        job.stop.store(true, Ordering::Relaxed);
        let outcome = open_archives(&downloads, &job);
        assert_eq!(outcome, Err(extract::Failure::Stopped));
        downloads.settle_extraction("one", outcome, 0);
        assert_eq!(downloads.all()[0].extraction, None, "as if never asked");
        assert!(!dir.join("a.part").exists());
        assert!(!dir.join("a").exists());
        assert!(dir.join("a.zip").is_file());
    }

    #[test]
    fn cancelling_one_being_opened_reaches_the_thread() {
        let dir = folder("extract-cancel");
        let app = folder("extract-cancel-app");
        zip_at(&dir.join("a.zip"), &[("b.txt", b"hello")]);
        let downloads = finished(&app, &dir, "a.zip", None);
        downloads.extract("one").unwrap();
        let job = downloads.take_next_extraction();
        downloads.cancel_extraction("one").unwrap();
        assert!(job.stop.load(Ordering::Relaxed));
    }

    #[test]
    fn opening_cut_short_by_the_app_ending_says_so_and_starts_over_when_asked() {
        let dir = folder("extract-cut");
        let app = folder("extract-cut-app");
        zip_at(&dir.join("a.zip"), &[("b.txt", b"hello")]);
        let downloads = finished(&app, &dir, "a.zip", None);
        downloads.extract("one").unwrap();
        // As the app leaves it: being worked on, and part of it written.
        let writing = dir.join("a.part");
        fs::create_dir_all(&writing).unwrap();
        fs::write(writing.join("half.txt"), "half").unwrap();
        let kept = writing.clone();
        downloads.change_extraction("one", |extraction| {
            extraction.state = Opening::Working;
            extraction.unfinished = vec![kept];
        });

        let again = Arc::new(Downloads::open(&app));
        let view = again.all().remove(0).extraction.unwrap();
        assert_eq!(view.state, Opening::Failed);
        assert_eq!(view.why, Some(extract::Failure::Interrupted));
        assert!(writing.exists(), "nothing is deleted until it is asked");

        opening_thread(&again);
        again.extract("one").unwrap();
        wait_for(&again, opened(Opening::Done));
        assert!(!writing.exists());
        assert_eq!(fs::read_dir(dir.join("a")).unwrap().count(), 1);
    }

    #[test]
    fn taking_one_off_the_list_clears_what_an_earlier_go_left_and_keeps_the_rest() {
        let dir = folder("extract-forget");
        let app = folder("extract-forget-app");
        zip_at(&dir.join("a.zip"), &[("b.txt", b"hello")]);
        let downloads = finished(&app, &dir, "a.zip", None);
        downloads.extract("one").unwrap();
        let writing = dir.join("a.part");
        fs::create_dir_all(&writing).unwrap();
        let kept = writing.clone();
        downloads.change_extraction("one", |extraction| {
            extraction.state = Opening::Failed;
            extraction.unfinished = vec![kept];
        });
        downloads.remove("one").unwrap();
        assert!(!writing.exists());
        assert!(dir.join("a.zip").is_file());
    }

    #[test]
    fn only_a_folder_shelf_named_is_ever_removed() {
        let dir = folder("extract-guard");
        let kept = dir.join("games");
        fs::create_dir_all(&kept).unwrap();
        remove_unfinished(std::slice::from_ref(&kept));
        assert!(kept.is_dir());
    }

    #[test]
    fn a_set_of_files_shows_its_folder_and_finds_an_archive_among_them() {
        let dir = folder("extract-set");
        let app = folder("extract-set-app");
        let set = dir.join("A made-up game");
        fs::create_dir_all(&set).unwrap();
        zip_at(&set.join("data.zip"), &[("b.txt", b"hello")]);
        fs::write(set.join("readme.txt"), "read me").unwrap();
        let downloads = finished(&app, &dir, "A made-up game", None);
        downloads.change("one", |download| {
            download.archives = None;
            download.pieces = ["data.zip", "readme.txt"]
                .map(|name| Piece {
                    link: "made-up".into(),
                    folders: Vec::new(),
                    file: Some(name.into()),
                    size: None,
                    validator: None,
                    finished: true,
                })
                .to_vec();
            download.find_archives();
        });
        assert_eq!(downloads.all()[0].archives, 1);
        assert_eq!(downloads.finished_file("one"), Ok(set.clone()));
        opening_thread(&downloads);
        downloads.extract("one").unwrap();
        wait_for(&downloads, opened(Opening::Done));
        assert_eq!(fs::read(set.join("data").join("b.txt")).unwrap(), b"hello");
    }
}
