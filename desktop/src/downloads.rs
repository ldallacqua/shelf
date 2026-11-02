//! Downloading a file from a source (ADR 007, phase 2): one at a time, on a task of the app's own, so
//! it goes on from the tray with no window open. A page names a download by its source and place; the
//! link stays here, in `downloads.json`. What arrives is written beside itself as `.part`, marked
//! as coming from the internet, and never started.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::header::{
    ACCEPT_RANGES, CONTENT_DISPOSITION, CONTENT_RANGE, CONTENT_TYPE, ETAG, IF_RANGE, LAST_MODIFIED,
    RANGE,
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use tokio::sync::Notify;
use url::Url;

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
    /// Windows would not open the folder.
    Refused,
    /// This computer could not keep it.
    Failed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Queued,
    Downloading,
    Paused,
    Failed,
    Done,
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
}

/// A download as a page sees it: never its links.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct View {
    pub id: String,
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
}

/// What the task holds of the one it is on, for a page to read and a command to stop.
struct Running {
    id: String,
    stop: Arc<Notify>,
    done: Arc<AtomicU64>,
    speed: Arc<AtomicU64>,
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
            if matches!(download.state, State::Queued | State::Downloading) {
                download.state = State::Paused;
            }
            if download.state != State::Done {
                download.done = download
                    .file
                    .as_ref()
                    .and_then(|name| fs::metadata(part_of(&download.folder, name)).ok())
                    .map_or(0, |part| part.len());
            }
        }
        Downloads {
            file,
            kept: Mutex::new(kept),
            running: Mutex::new(None),
            wake: Notify::new(),
        }
    }

    pub fn all(&self) -> Vec<View> {
        let kept = self.kept.lock().unwrap();
        let running = self.running.lock().unwrap();
        kept.iter()
            .map(|download| {
                let now = running.as_ref().filter(|each| each.id == download.id);
                View {
                    id: download.id.clone(),
                    title: download.title.clone(),
                    source_name: download.source_name.clone(),
                    file: download.file.clone(),
                    folder: download.folder.display().to_string(),
                    state: download.state,
                    why: download.why,
                    done: now.map_or(download.done, |each| each.done.load(Ordering::Relaxed)),
                    total: download.total,
                    speed: now.map_or(0, |each| each.speed.load(Ordering::Relaxed)),
                }
            })
            .collect()
    }

    /// Whether one of these links is already on its way or waiting.
    pub fn has_link(&self, links: &[String]) -> bool {
        self.kept.lock().unwrap().iter().any(|download| {
            download.state != State::Done && download.links.iter().any(|each| links.contains(each))
        })
    }

    pub fn add(
        &self,
        id: String,
        title: String,
        source_name: String,
        links: Vec<String>,
        folder: PathBuf,
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
        if matches!(download.state, State::Queued | State::Downloading) {
            download.state = State::Paused;
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

    /// Takes one off the list. What it had of the file goes; a finished file stays where it is.
    pub fn remove(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let at = kept
            .iter()
            .position(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        // Windows can't delete a file still open: the task does it, once it has let go.
        if self.stop(id) {
            kept[at].cancelled = true;
            return Ok(());
        }
        let download = kept.remove(at);
        if download.state != State::Done
            && let Some(name) = &download.file
        {
            let _ = fs::remove_file(part_of(&download.folder, name));
        }
        self.save(&kept)
    }

    /// The file finished, and only that, to show in Explorer.
    pub fn finished_file(&self, id: &str) -> Result<PathBuf, Refusal> {
        let kept = self.kept.lock().unwrap();
        let download = kept
            .iter()
            .find(|each| each.id == id)
            .ok_or(Refusal::Missing)?;
        match (&download.state, &download.file) {
            (State::Done, Some(name)) => Ok(download.folder.join(name)),
            _ => Err(Refusal::Missing),
        }
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
    fn take_next(&self) -> Option<(Download, Arc<Notify>, Arc<AtomicU64>, Arc<AtomicU64>)> {
        let mut kept = self.kept.lock().unwrap();
        let download = kept.iter_mut().find(|each| each.state == State::Queued)?;
        download.state = State::Downloading;
        let job = download.clone();
        let stop = Arc::new(Notify::new());
        let done = Arc::new(AtomicU64::new(job.done));
        let speed = Arc::new(AtomicU64::new(0));
        *self.running.lock().unwrap() = Some(Running {
            id: job.id.clone(),
            stop: stop.clone(),
            done: done.clone(),
            speed: speed.clone(),
        });
        let _ = self.save(&kept);
        Some((job, stop, done, speed))
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
            let download = kept.remove(at);
            if let Some(name) = &download.file {
                let _ = fs::remove_file(part_of(&download.folder, name));
            }
            let _ = self.save(&kept);
            return;
        }
        let download = &mut kept[at];
        download.done = done;
        match outcome {
            Ok(total) => {
                download.state = State::Done;
                download.done = total;
                download.total = Some(total);
                download.why = None;
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
pub async fn run(downloads: Arc<Downloads>, version: String) {
    let client = match client(&version) {
        Ok(client) => client,
        Err(error) => {
            eprintln!("could not make what downloads files: {error}");
            return;
        }
    };
    loop {
        let Some((job, stop, done, speed)) = downloads.take_next() else {
            downloads.wake.notified().await;
            continue;
        };
        let outcome = work(&client, &downloads, &job, &stop, &done, &speed).await;
        downloads.settle(&job.id, outcome, done.load(Ordering::Relaxed));
    }
}

/// One download, through its links, asking again when a connection is lost.
async fn work(
    client: &Client,
    downloads: &Downloads,
    job: &Download,
    stop: &Notify,
    done: &AtomicU64,
    speed: &AtomicU64,
) -> Result<u64, Failure> {
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
}

impl Failure {
    fn why(self) -> Why {
        match self {
            Failure::Page => Why::Page,
            Failure::Disk => Why::Disk,
            Failure::Write => Why::Write,
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
                links,
                dir.to_path_buf(),
                1,
            )
            .unwrap();
    }

    /// Runs the app's task until `ready`, for a few seconds at most.
    fn until(downloads: &Arc<Downloads>, ready: impl Fn(&[View]) -> bool) -> Vec<View> {
        let task = tauri::async_runtime::spawn(run(downloads.clone(), "0.0.0".into()));
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
        let task = tauri::async_runtime::spawn(run(downloads.clone(), "0.0.0".into()));
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
        let task = tauri::async_runtime::spawn(run(downloads.clone(), "0.0.0".into()));
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
}
