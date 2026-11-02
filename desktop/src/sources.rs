//! Download sources (ADR 007): lists of downloads in Hydra's format, read from an address the
//! person pasted, and kept on this computer, and read again once a day for as long as the app runs.
//! Shelf's server never sees one. A page is told a source's name and counts, and the links stay here.

use std::fs;
use std::io;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use url::{Host, Url};

/// The most a source may be: the largest seen are a few dozen megabytes.
const MOST_BYTES: u64 = 200 * 1024 * 1024;
const MOST_TIME: Duration = Duration::from_secs(120);
const MOST_CONNECTING: Duration = Duration::from_secs(15);
const MOST_REDIRECTS: usize = 5;
/// How long after a good reading a source is read again, in milliseconds.
const READ_EVERY: u64 = 24 * 60 * 60 * 1000;
/// How long after a failed one, so that a day's trouble at the address doesn't lose a day.
const TRY_AGAIN_AFTER: u64 = 6 * 60 * 60 * 1000;
/// How long the app waits after it starts, as it starts with Windows, and how often it looks after that.
const FIRST_LOOK: Duration = Duration::from_secs(60);
const LOOK_EVERY: Duration = Duration::from_secs(60 * 60);
/// Longer than any address a person pastes, and short enough to show.
const MOST_ADDRESS: usize = 2048;
/// The lengths Hydra's own validator held these to.
const MOST_WORDS: usize = 255;

/// Why nothing was done, in a word a page has a sentence for.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Refusal {
    /// Not an address the app will read (`allowed`), or not a source's id.
    Invalid,
    /// This address is here already.
    Duplicate,
    /// The connection failed, for no reason named below.
    Unreachable,
    /// This computer found no such name.
    Name,
    /// A secure connection couldn't be made.
    Secure,
    /// It took too long to answer.
    Slow,
    /// It answered, without the file: an error, or a redirect `allowed` wouldn't follow.
    Refused,
    /// More than `MOST_BYTES`.
    Large,
    /// It answered with something that is not a source.
    Unsupported,
    /// No source has that id.
    Missing,
    /// This computer could not keep it.
    Failed,
}

/// Where a link leads, as far as can be told without following it.
#[derive(Debug, PartialEq, Eq)]
pub enum Link {
    Magnet,
    Web,
}

/// What a link in a source is, or `None` to drop it: only `https`, since the format has no
/// checksum and plain `http` would then have no check at all, and a magnet that names its hash.
pub fn link(uri: &str) -> Option<Link> {
    let url = Url::parse(uri).ok()?;
    if local_for_development(&url) {
        return Some(Link::Web);
    }
    match url.scheme() {
        "https" if url.host().is_some() && url.username().is_empty() => Some(Link::Web),
        "magnet" => url
            .query_pairs()
            .any(|(key, value)| {
                key == "xt"
                    && value
                        .strip_prefix("urn:btih:")
                        .is_some_and(|hash| !hash.is_empty())
            })
            .then_some(Link::Magnet),
        _ => None,
    }
}

/// One download in a source, with only the links the app can use.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub title: String,
    #[serde(default)]
    pub uris: Vec<String>,
    /// A mirror split into parts: one host's parts, in order.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub uri_groups: Vec<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upload_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_size: Option<String>,
}

/// A source as it was read.
#[derive(Debug, PartialEq, Eq)]
pub struct Feed {
    pub name: String,
    pub items: Vec<Item>,
    /// What was in the list and could not be used.
    pub left_out: usize,
}

/// Words from outside, kept to a length that can be shown, or `None` when there are none.
fn words(text: &str) -> Option<String> {
    let text = text.trim();
    (!text.is_empty()).then(|| text.chars().take(MOST_WORDS).collect())
}

/// One entry of `downloads`, or `None` to leave it out and count it: a file made by hand has
/// a bad one here and there, and the rest are still good.
fn item(value: serde_json::Value) -> Option<Item> {
    let raw: Item = serde_json::from_value(value).ok()?;
    let usable = |uri: &String| link(uri).is_some();
    let uris: Vec<String> = raw.uris.into_iter().filter(usable).collect();
    // A group with a link the app can't use can't be put together.
    let uri_groups: Vec<Vec<String>> = raw
        .uri_groups
        .into_iter()
        .filter(|group| !group.is_empty() && group.iter().all(usable))
        .collect();
    if uris.is_empty() && uri_groups.is_empty() {
        return None;
    }
    Some(Item {
        title: words(&raw.title)?,
        uris,
        uri_groups,
        upload_date: raw.upload_date.as_deref().and_then(words),
        file_size: raw.file_size.as_deref().and_then(words),
    })
}

/// Reads a source. Without a name and a list of downloads it is not one.
pub fn parse(bytes: &[u8]) -> Result<Feed, Refusal> {
    #[derive(Deserialize)]
    struct Raw {
        name: String,
        downloads: Vec<serde_json::Value>,
    }
    // Notepad starts a file it saves with this mark, which JSON has no place for.
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(bytes);
    let raw: Raw = serde_json::from_slice(bytes).map_err(|_| Refusal::Unsupported)?;
    let name = words(&raw.name).ok_or(Refusal::Unsupported)?;
    let whole = raw.downloads.len();
    let items: Vec<Item> = raw.downloads.into_iter().filter_map(item).collect();
    let left_out = whole - items.len();
    Ok(Feed {
        name,
        items,
        left_out,
    })
}

/// An address written out that is this computer or its network.
fn private(host: &Host<&str>) -> bool {
    let v4 = |ip: &Ipv4Addr| {
        ip.is_private()
            || ip.is_loopback()
            || ip.is_link_local()
            || ip.is_unspecified()
            || ip.is_broadcast()
    };
    match host {
        Host::Domain(name) => {
            let name = name.to_ascii_lowercase();
            name == "localhost" || name.ends_with(".localhost")
        }
        Host::Ipv4(ip) => v4(ip),
        Host::Ipv6(ip) => {
            let segments = ip.segments();
            *ip == Ipv6Addr::LOCALHOST
                || ip.is_unspecified()
                // Unique local, fc00::/7, and link local, fe80::/10.
                || (segments[0] & 0xfe00) == 0xfc00
                || (segments[0] & 0xffc0) == 0xfe80
                || ip.to_ipv4_mapped().is_some_and(|mapped| v4(&mapped))
        }
    }
}

/// `http` on this computer, for a development build's checks (`pnpm desktop:check`).
fn local_for_development(url: &Url) -> bool {
    cfg!(debug_assertions)
        && url.scheme() == "http"
        && match url.host() {
            Some(Host::Ipv4(ip)) => IpAddr::V4(ip).is_loopback(),
            _ => false,
        }
}

/// Whether the app will read an address (ADR 007, decision 6).
pub fn allowed(url: &Url) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    if local_for_development(url) {
        return true;
    }
    url.scheme() == "https" && url.host().is_some_and(|host| !private(&host))
}

/// Follows a redirect only if it passes `allowed`, and not many of them.
pub fn redirects() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MOST_REDIRECTS || !allowed(attempt.url()) {
            attempt.stop()
        } else {
            attempt.follow()
        }
    })
}

/// What reading an address brought.
#[derive(Debug, PartialEq, Eq)]
pub enum Reading {
    /// The same as last time, by its `ETag`.
    Unchanged,
    Read {
        bytes: Vec<u8>,
        etag: Option<String>,
    },
}

/// Reads an address, keeping to the limits, and following only redirects that pass `allowed`.
pub async fn read(url: &Url, etag: Option<&str>, version: &str) -> Result<Reading, Refusal> {
    if !allowed(url) {
        return Err(Refusal::Invalid);
    }
    let client = reqwest::Client::builder()
        .user_agent(format!("Shelf/{version}"))
        .redirect(redirects())
        .connect_timeout(MOST_CONNECTING)
        .timeout(MOST_TIME)
        .build()
        .map_err(|_| Refusal::Failed)?;
    let mut request = client.get(url.clone());
    if let Some(etag) = etag {
        request = request.header(reqwest::header::IF_NONE_MATCH, etag);
    }
    let mut response = request.send().await.map_err(|error| why_not(&error))?;
    if response.status() == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(Reading::Unchanged);
    }
    // A redirect stopped by the rule above comes back as the redirect itself.
    if !response.status().is_success() {
        return Err(Refusal::Refused);
    }
    if response
        .content_length()
        .is_some_and(|size| size > MOST_BYTES)
    {
        return Err(Refusal::Large);
    }
    let etag = response
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    // The length it says may not be the length it sends.
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| why_not(&error))? {
        if bytes.len() as u64 + chunk.len() as u64 > MOST_BYTES {
            return Err(Refusal::Large);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(Reading::Read { bytes, etag })
}

/// What went wrong with a connection, from everything the error says of itself.
fn why_not(error: &reqwest::Error) -> Refusal {
    if error.is_timeout() {
        return Refusal::Slow;
    }
    let mut said = String::new();
    let mut at: Option<&dyn std::error::Error> = Some(error);
    while let Some(each) = at {
        said.push_str(&each.to_string());
        said.push(' ');
        at = each.source();
    }
    named_in(&said.to_lowercase())
}

/// By the words the libraries use, which Windows' own language doesn't change.
fn named_in(said: &str) -> Refusal {
    if said.contains("dns error") {
        Refusal::Name
    } else if ["certificate", "tls", "handshake", "alert"]
        .iter()
        .any(|word| said.contains(word))
    {
        Refusal::Secure
    } else {
        Refusal::Unreachable
    }
}

/// Reads every source whose time has come, one at a time. A reading that fails keeps the list there is.
pub async fn read_what_is_due(sources: &Sources, version: &str, now: u64) {
    for (id, address, etag) in sources.due(now) {
        let read = async {
            let url = self::address(&address)?;
            match read(&url, etag.as_deref(), version).await? {
                Reading::Unchanged => sources.touch(&id, now),
                Reading::Read { bytes, etag } => {
                    sources.replace(&id, None, parse(&bytes)?, etag, now)
                }
            }
        };
        if let Err(why) = read.await {
            sources.failed_reading(&id, why, now);
        }
    }
}

/// For as long as the app runs (ADR 007, decision 9).
pub async fn keep_reading(sources: &Sources, version: &str) {
    tokio::time::sleep(FIRST_LOOK).await;
    loop {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_or(0, |since| since.as_millis() as u64);
        read_what_is_due(sources, version, now).await;
        tokio::time::sleep(LOOK_EVERY).await;
    }
}

/// Reads a source a person saved, from where Windows' picker found it, to the same limit.
pub fn read_file(path: &Path) -> Result<Feed, Refusal> {
    let size = fs::metadata(path).map_err(|_| Refusal::Failed)?.len();
    if size > MOST_BYTES {
        return Err(Refusal::Large);
    }
    parse(&fs::read(path).map_err(|_| Refusal::Failed)?)
}

/// What is kept of a source besides its list.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub id: String,
    pub name: String,
    pub url: String,
    /// The name of the file it was added from, when it has no address to read again.
    #[serde(default)]
    pub file: Option<String>,
    /// Why the last reading by itself failed, until one works.
    #[serde(default)]
    pub trouble: Option<Refusal>,
    /// When one by itself last failed.
    #[serde(default)]
    pub tried_at: u64,
    /// When it was added and last read, in milliseconds since 1970.
    pub added_at: u64,
    pub read_at: u64,
    pub items: usize,
    /// Of `items`, how many have a magnet and how many a link on the web. One may have both.
    pub magnets: usize,
    pub web: usize,
    pub left_out: usize,
}

/// `sources.json`. `version` is for whatever reads it next.
#[derive(Default, Serialize, Deserialize)]
struct Kept {
    version: u32,
    sources: Vec<KeptSource>,
}

/// `Source` as it is on disk, where the `ETag` stays: a page has no use for it.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct KeptSource {
    #[serde(flatten)]
    source: Source,
    #[serde(default)]
    kept_etag: Option<String>,
}

const FILE: &str = "sources.json";
const LISTS: &str = "sources";

/// A list's file, by a source's id, which is one the app made (`ids::entry` checks a page's).
fn list_file(folder: &Path, id: &str) -> PathBuf {
    folder.join(LISTS).join(format!("{id}.json"))
}

fn count(items: &[Item], kind: Link) -> usize {
    let has = |uri: &String| link(uri).is_some_and(|each| each == kind);
    items
        .iter()
        .filter(|item| item.uris.iter().any(has) || item.uri_groups.iter().flatten().any(has))
        .count()
}

/// Writes a whole new file, then puts it in place: a write cut short leaves the last good one.
fn write_whole(file: &Path, text: &str) -> io::Result<()> {
    if let Some(folder) = file.parent() {
        fs::create_dir_all(folder)?;
    }
    let next = file.with_extension("json.next");
    fs::write(&next, text)?;
    fs::rename(&next, file)
}

pub struct Sources {
    folder: PathBuf,
    kept: Mutex<Vec<KeptSource>>,
}

impl Sources {
    /// The sources kept in `folder`. A file that can't be read is put aside as
    /// `sources.unreadable.json`, not lost, and the app starts with none.
    pub fn open(folder: &Path) -> Self {
        let file = folder.join(FILE);
        let kept = match fs::read_to_string(&file) {
            Ok(text) => match serde_json::from_str::<Kept>(&text) {
                Ok(kept) => kept.sources,
                Err(_) => {
                    let _ = fs::rename(&file, folder.join("sources.unreadable.json"));
                    Vec::new()
                }
            },
            Err(_) => Vec::new(),
        };
        Sources {
            folder: folder.to_path_buf(),
            kept: Mutex::new(kept),
        }
    }

    pub fn all(&self) -> Vec<Source> {
        self.kept
            .lock()
            .unwrap()
            .iter()
            .map(|kept| kept.source.clone())
            .collect()
    }

    /// The address and `ETag` to read a source from.
    pub fn address(&self, id: &str) -> Option<(String, Option<String>)> {
        self.kept
            .lock()
            .unwrap()
            .iter()
            .find(|kept| kept.source.id == id)
            .map(|kept| (kept.source.url.clone(), kept.kept_etag.clone()))
    }

    pub fn has_address(&self, url: &str) -> bool {
        self.kept
            .lock()
            .unwrap()
            .iter()
            .any(|kept| kept.source.url == url)
    }

    /// Keeps a new source. Its list is written first, so what is listed always has one.
    pub fn add(
        &self,
        id: String,
        url: String,
        file: Option<String>,
        feed: Feed,
        etag: Option<String>,
        now: u64,
    ) -> Result<Source, Refusal> {
        let source = Source {
            id,
            name: feed.name,
            url,
            file,
            trouble: None,
            tried_at: 0,
            added_at: now,
            read_at: now,
            items: feed.items.len(),
            magnets: count(&feed.items, Link::Magnet),
            web: count(&feed.items, Link::Web),
            left_out: feed.left_out,
        };
        self.write_list(&source.id, &feed.items)?;
        let mut kept = self.kept.lock().unwrap();
        // Two pastes of one address can both have been reading.
        if kept.iter().any(|each| each.source.url == source.url) {
            let _ = fs::remove_file(list_file(&self.folder, &source.id));
            return Err(Refusal::Duplicate);
        }
        kept.push(KeptSource {
            source: source.clone(),
            kept_etag: etag,
        });
        self.save(&kept)?;
        Ok(source)
    }

    /// The folder and sources to search, for a thread of its own: a list can be large.
    pub fn searchable(&self) -> (PathBuf, Vec<Source>) {
        (self.folder.clone(), self.all())
    }

    /// One download in a source, if it is still what a page was shown: a list read again since
    /// may have moved it. Its source's name comes with it.
    pub fn item(&self, id: &str, place: usize, title: &str) -> Option<(String, Item)> {
        let name = self.all().into_iter().find(|each| each.id == id)?.name;
        let item = read_list(&self.folder, id)?.into_iter().nth(place)?;
        (item.title == title).then_some((name, item))
    }

    /// A source's new list, from reading it again.
    pub fn replace(
        &self,
        id: &str,
        file: Option<String>,
        feed: Feed,
        etag: Option<String>,
        now: u64,
    ) -> Result<Source, Refusal> {
        self.write_list(id, &feed.items)?;
        let mut kept = self.kept.lock().unwrap();
        let each = kept
            .iter_mut()
            .find(|each| each.source.id == id)
            .ok_or(Refusal::Missing)?;
        each.source.name = feed.name;
        each.source.read_at = now;
        each.source.items = feed.items.len();
        each.source.magnets = count(&feed.items, Link::Magnet);
        each.source.web = count(&feed.items, Link::Web);
        each.source.left_out = feed.left_out;
        each.source.trouble = None;
        each.kept_etag = etag;
        if let Some(name) = file {
            each.source.file = Some(name);
        }
        let source = each.source.clone();
        self.save(&kept)?;
        Ok(source)
    }

    /// Those with an address whose time to be read again has come, and what to ask them by.
    pub fn due(&self, now: u64) -> Vec<(String, String, Option<String>)> {
        self.kept
            .lock()
            .unwrap()
            .iter()
            .filter(|each| {
                each.source.file.is_none()
                    && now >= each.source.read_at.saturating_add(READ_EVERY)
                    && now >= each.source.tried_at.saturating_add(TRY_AGAIN_AFTER)
            })
            .map(|each| {
                (
                    each.source.id.clone(),
                    each.source.url.clone(),
                    each.kept_etag.clone(),
                )
            })
            .collect()
    }

    /// A reading by itself failed, which the source's card says. The list it has stays.
    pub fn failed_reading(&self, id: &str, why: Refusal, now: u64) {
        let mut kept = self.kept.lock().unwrap();
        if let Some(each) = kept.iter_mut().find(|each| each.source.id == id) {
            each.source.trouble = Some(why);
            each.source.tried_at = now;
            let _ = self.save(&kept);
        }
    }

    /// Read again and found the same.
    pub fn touch(&self, id: &str, now: u64) -> Result<Source, Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let each = kept
            .iter_mut()
            .find(|each| each.source.id == id)
            .ok_or(Refusal::Missing)?;
        each.source.read_at = now;
        each.source.trouble = None;
        let source = each.source.clone();
        self.save(&kept)?;
        Ok(source)
    }

    /// Forgets a source and its list. What was downloaded from it is not touched.
    pub fn remove(&self, id: &str) -> Result<(), Refusal> {
        let mut kept = self.kept.lock().unwrap();
        let before = kept.len();
        kept.retain(|each| each.source.id != id);
        if kept.len() == before {
            return Err(Refusal::Missing);
        }
        self.save(&kept)?;
        let _ = fs::remove_file(list_file(&self.folder, id));
        Ok(())
    }

    fn write_list(&self, id: &str, items: &[Item]) -> Result<(), Refusal> {
        let text = serde_json::to_string(items).map_err(|_| Refusal::Failed)?;
        write_whole(&list_file(&self.folder, id), &text).map_err(|_| Refusal::Failed)
    }

    fn save(&self, kept: &[KeptSource]) -> Result<(), Refusal> {
        let text = serde_json::to_string_pretty(&Kept {
            version: 1,
            sources: kept.to_vec(),
        })
        .map_err(|_| Refusal::Failed)?;
        write_whole(&self.folder.join(FILE), &text).map_err(|_| Refusal::Failed)
    }
}

fn read_list(folder: &Path, id: &str) -> Option<Vec<Item>> {
    serde_json::from_str(&fs::read_to_string(list_file(folder, id)).ok()?).ok()
}

/// A title's words, the way two spellings of one name agree: in lower case, with no accents, and
/// punctuation apart from an apostrophe ending a word. "Assassin's" and "Assassins" are one word.
pub fn words_in(text: &str) -> Vec<String> {
    text.to_lowercase()
        .chars()
        .filter(|c| !matches!(c, '\'' | '\u{2019}'))
        .map(|c| match c {
            'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
            'ç' => 'c',
            'è' | 'é' | 'ê' | 'ë' => 'e',
            'ì' | 'í' | 'î' | 'ï' => 'i',
            'ñ' => 'n',
            'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
            'ù' | 'ú' | 'û' | 'ü' => 'u',
            other => other,
        })
        .collect::<String>()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_string)
        .collect()
}

/// The most results a search gives: past this, more words are what is needed.
const MOST_RESULTS: usize = 100;

/// One download a search found, as a page sees it: never its links.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    pub source: String,
    pub source_name: String,
    /// Its place in the list, which with `title` is how a page asks for it.
    pub place: usize,
    pub title: String,
    pub file_size: Option<String>,
    pub upload_date: Option<String>,
    /// How many links the app can try by itself, and how many it can't yet.
    pub web: usize,
    pub magnets: usize,
    pub in_parts: bool,
}

/// Every download whose title has every word asked for (ADR 007: no looser). Closest first, by how
/// few other words it has, then newest. Nothing chooses for the person: this is a list to read.
pub fn search(folder: &Path, kept: &[Source], asked: &str) -> Vec<Found> {
    let asked = words_in(asked);
    if asked.is_empty() {
        return Vec::new();
    }
    let mut found: Vec<(usize, Found)> = Vec::new();
    for source in kept {
        let Some(items) = read_list(folder, &source.id) else {
            continue;
        };
        for (place, item) in items.into_iter().enumerate() {
            let words = words_in(&item.title);
            if !asked.iter().all(|word| words.contains(word)) {
                continue;
            }
            let kinds = |kind: Link| {
                item.uris
                    .iter()
                    .filter(|uri| link(uri).is_some_and(|each| each == kind))
                    .count()
            };
            found.push((
                words.len(),
                Found {
                    source: source.id.clone(),
                    source_name: source.name.clone(),
                    place,
                    web: kinds(Link::Web),
                    magnets: kinds(Link::Magnet),
                    in_parts: !item.uri_groups.is_empty(),
                    title: item.title,
                    file_size: item.file_size,
                    upload_date: item.upload_date,
                },
            ));
        }
    }
    found.sort_by(|(a_words, a), (b_words, b)| {
        a_words
            .cmp(b_words)
            .then_with(|| b.upload_date.cmp(&a.upload_date))
    });
    found.truncate(MOST_RESULTS);
    found.into_iter().map(|(_, each)| each).collect()
}

/// A pasted address as the app takes it, in one spelling, so a paste twice is seen as twice.
pub fn address(pasted: &str) -> Result<Url, Refusal> {
    let pasted = pasted.trim();
    if pasted.is_empty() || pasted.len() > MOST_ADDRESS {
        return Err(Refusal::Invalid);
    }
    let url = Url::parse(pasted).map_err(|_| Refusal::Invalid)?;
    if allowed(&url) {
        Ok(url)
    } else {
        Err(Refusal::Invalid)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    const MADE_UP: &str = include_str!("../../fixtures/sources/hydra-format.json");

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-sources-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn url(text: &str) -> Url {
        Url::parse(text).unwrap()
    }

    /// Answers one request per answer, in turn, and hands back what was asked.
    fn serve(answers: Vec<String>) -> (String, std::thread::JoinHandle<Vec<String>>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        let handle = std::thread::spawn(move || {
            let mut asked = Vec::new();
            for answer in answers {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buffer = [0; 4096];
                let size = stream.read(&mut buffer).unwrap();
                asked.push(String::from_utf8_lossy(&buffer[..size]).into_owned());
                stream.write_all(answer.as_bytes()).unwrap();
            }
            asked
        });
        (address, handle)
    }

    fn answer(status: &str, headers: &str, body: &str) -> String {
        format!(
            "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n{headers}\r\n{body}",
            body.len()
        )
    }

    fn reading(address: &str, etag: Option<&str>) -> Result<Reading, Refusal> {
        tauri::async_runtime::block_on(read(&url(address), etag, "0.0.0"))
    }

    #[test]
    fn reads_a_saved_file_with_the_mark_notepad_leaves() {
        let dir = folder("saved");
        let saved = dir.join("saved.txt");
        let mut bytes = b"\xEF\xBB\xBF".to_vec();
        bytes.extend_from_slice(MADE_UP.as_bytes());
        fs::write(&saved, bytes).unwrap();
        assert_eq!(read_file(&saved), parse(MADE_UP.as_bytes()));
    }

    #[test]
    fn a_saved_file_is_held_to_the_same_rules() {
        let dir = folder("saved-bad");
        let saved = dir.join("saved.txt");
        fs::write(&saved, "<html>a page saved by mistake</html>").unwrap();
        assert_eq!(read_file(&saved), Err(Refusal::Unsupported));
        assert_eq!(read_file(&dir.join("gone.txt")), Err(Refusal::Failed));
    }

    #[test]
    fn a_source_from_a_file_says_which_and_keeps_it_when_its_list_changes() {
        let dir = folder("from-file");
        let sources = Sources::open(&dir);
        let first = parse(MADE_UP.as_bytes()).unwrap();
        let added = sources
            .add(
                "one".into(),
                "file:a.json".into(),
                Some("a.json".into()),
                first,
                None,
                1,
            )
            .unwrap();
        assert_eq!(added.file.as_deref(), Some("a.json"));
        let next = parse(MADE_UP.as_bytes()).unwrap();
        let again = sources
            .replace("one", Some("b.json".into()), next, None, 2)
            .unwrap();
        assert_eq!(again.file.as_deref(), Some("b.json"));
        assert_eq!(Sources::open(&dir).all()[0].file.as_deref(), Some("b.json"));
    }

    #[test]
    fn says_what_went_wrong_with_a_connection() {
        let name = "error sending request: client error (connect): dns error: failed to lookup";
        assert_eq!(named_in(name), Refusal::Name);
        let secure = "client error (connect): invalid peer certificate: unknown issuer";
        assert_eq!(named_in(secure), Refusal::Secure);
        let refused = "client error (connect): tcp connect error: connection refused";
        assert_eq!(named_in(refused), Refusal::Unreachable);
    }

    const DAY: u64 = 24 * 60 * 60 * 1000;

    #[test]
    fn reads_a_source_again_a_day_later_and_not_before() {
        let dir = folder("daily");
        let sources = Sources::open(&dir);
        let (address, server) = serve(vec![answer("304 Not Modified", "", "")]);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        sources
            .add("one".into(), address, None, feed, Some("\"one\"".into()), 1)
            .unwrap();
        assert!(sources.due(DAY).is_empty(), "a day has not gone by");
        tauri::async_runtime::block_on(read_what_is_due(&sources, "0.0.0", DAY + 1));
        let asked = server.join().unwrap();
        assert!(asked[0].to_lowercase().contains("if-none-match: \"one\""));
        assert_eq!(sources.all()[0].read_at, DAY + 1);
        assert!(sources.due(DAY + 2).is_empty());
    }

    #[test]
    fn a_source_read_by_itself_gets_its_new_list() {
        let dir = folder("daily-new");
        let sources = Sources::open(&dir);
        let (address, server) = serve(vec![answer(
            "200 OK",
            "",
            r#"{"name":"new","downloads":[]}"#,
        )]);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        sources
            .add("one".into(), address, None, feed, None, 1)
            .unwrap();
        tauri::async_runtime::block_on(read_what_is_due(&sources, "0.0.0", DAY + 1));
        server.join().unwrap();
        let source = &sources.all()[0];
        assert_eq!((source.name.as_str(), source.items), ("new", 0));
    }

    #[test]
    fn a_failed_reading_keeps_the_list_says_why_and_tries_again_later() {
        let dir = folder("daily-fail");
        let sources = Sources::open(&dir);
        let (address, server) = serve(vec![answer("403 Forbidden", "", "no")]);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        let items = feed.items.len();
        sources
            .add("one".into(), address.clone(), None, feed, None, 1)
            .unwrap();
        tauri::async_runtime::block_on(read_what_is_due(&sources, "0.0.0", DAY + 1));
        server.join().unwrap();
        let source = &sources.all()[0];
        assert_eq!(source.trouble, Some(Refusal::Refused));
        assert_eq!((source.items, source.read_at), (items, 1));
        assert!(sources.due(DAY + 2).is_empty(), "not again at once");
        assert_eq!(sources.due(DAY + 1 + 6 * 60 * 60 * 1000).len(), 1);
    }

    #[test]
    fn a_good_reading_clears_what_a_failed_one_said() {
        let dir = folder("daily-clears");
        let sources = Sources::open(&dir);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                feed,
                None,
                1,
            )
            .unwrap();
        sources.failed_reading("one", Refusal::Name, 2);
        assert_eq!(Sources::open(&dir).all()[0].trouble, Some(Refusal::Name));
        let touched = sources.touch("one", 3).unwrap();
        assert_eq!(touched.trouble, None);
    }

    #[test]
    fn a_source_from_a_file_is_never_read_by_itself() {
        let dir = folder("daily-file");
        let sources = Sources::open(&dir);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        sources
            .add(
                "one".into(),
                "file:a.json".into(),
                Some("a.json".into()),
                feed,
                None,
                1,
            )
            .unwrap();
        assert!(sources.due(DAY * 30).is_empty());
    }

    #[test]
    fn reads_hydras_format() {
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        assert_eq!(feed.name, "Made-up source");
        assert_eq!(feed.items.len(), 3);
        assert_eq!(feed.items[0].title, "Made-up Game: Deluxe Edition v1.2");
        assert_eq!(feed.items[0].uris.len(), 2);
        assert_eq!(feed.items[0].file_size.as_deref(), Some("12.4 GB"));
        assert_eq!(
            feed.items[0].upload_date.as_deref(),
            Some("2026-10-20T12:00:00.000Z")
        );
        // No date or size is still a download.
        assert_eq!(feed.items[2].file_size, None);
    }

    #[test]
    fn leaves_out_and_counts_what_it_cannot_use() {
        // Plain http, only unusable links, an empty title, no title, and not an object.
        assert_eq!(parse(MADE_UP.as_bytes()).unwrap().left_out, 5);
    }

    #[test]
    fn what_is_not_a_source_says_so() {
        for text in [
            "<html>a page</html>",
            "[]",
            "{}",
            r#"{"name":"no list"}"#,
            r#"{"downloads":[]}"#,
            r#"{"name":"   ","downloads":[]}"#,
            r#"{"name":"a list of something else","downloads":{}}"#,
        ] {
            assert_eq!(parse(text.as_bytes()), Err(Refusal::Unsupported), "{text}");
        }
        assert_eq!(
            parse(br#"{"name":"nothing yet","downloads":[]}"#)
                .unwrap()
                .items
                .len(),
            0
        );
    }

    #[test]
    fn words_from_outside_are_kept_short() {
        let long = "x".repeat(1000);
        let text = format!(
            r#"{{"name":"{long}","downloads":[{{"title":"{long}","uris":["https://a.example/b"]}}]}}"#
        );
        let feed = parse(text.as_bytes()).unwrap();
        assert_eq!(feed.name.chars().count(), MOST_WORDS);
        assert_eq!(feed.items[0].title.chars().count(), MOST_WORDS);
    }

    #[test]
    fn only_https_and_magnets_with_a_hash_are_links() {
        assert_eq!(link("https://a.example/b.zip"), Some(Link::Web));
        assert_eq!(
            link("magnet:?xt=urn:btih:0123456789abcdef&dn=x"),
            Some(Link::Magnet)
        );
        for not in [
            "http://a.example/b.zip",
            "magnet:?dn=x",
            "magnet:?xt=urn:btih:",
            "file:///C:/Windows/System32/cmd.exe",
            "steam://install/620",
            "javascript:alert(1)",
            "https://user:secret@a.example/b.zip",
            "not a link",
            "",
        ] {
            assert_eq!(link(not), None, "{not}");
        }
    }

    #[test]
    fn a_group_with_a_link_it_cannot_use_is_dropped() {
        let feed = parse(
            br#"{"name":"parts","downloads":[{"title":"In parts","uris":[],"uriGroups":[
                ["https://a.example/1","https://a.example/2"],
                ["https://b.example/1","http://b.example/2"],
                []
            ]}]}"#,
        )
        .unwrap();
        assert_eq!(
            feed.items[0].uri_groups,
            vec![vec![
                "https://a.example/1".to_string(),
                "https://a.example/2".to_string()
            ]]
        );
    }

    #[test]
    fn an_address_must_be_https_and_out_on_the_internet() {
        assert!(allowed(&url("https://a.example/source.json")));
        for not in [
            "ftp://a.example/source.json",
            "file:///C:/source.json",
            "https://user:secret@a.example/source.json",
            "https://localhost/source.json",
            "https://sub.localhost/source.json",
            "https://127.0.0.1/source.json",
            "https://10.0.0.8/source.json",
            "https://172.16.0.1/source.json",
            "https://192.168.1.1/source.json",
            "https://169.254.169.254/latest/meta-data",
            "https://0.0.0.0/source.json",
            "https://[::1]/source.json",
            "https://[fd00::1]/source.json",
            "https://[fe80::1]/source.json",
            "https://[::ffff:192.168.1.1]/source.json",
            "http://a.example/source.json",
            "http://localhost/source.json",
            "http://192.168.1.1/source.json",
        ] {
            assert!(!allowed(&url(not)), "{not}");
        }
    }

    #[test]
    fn a_pasted_address_is_tidied_or_refused() {
        assert_eq!(
            address("  https://A.example/source.json \n")
                .unwrap()
                .as_str(),
            "https://a.example/source.json"
        );
        assert_eq!(address(""), Err(Refusal::Invalid));
        assert_eq!(address("not an address"), Err(Refusal::Invalid));
        assert_eq!(address("http://a.example/"), Err(Refusal::Invalid));
        let long = format!("https://a.example/{}", "x".repeat(MOST_ADDRESS));
        assert_eq!(address(&long), Err(Refusal::Invalid));
    }

    #[test]
    fn reads_an_address_and_asks_by_its_etag() {
        let (address, server) = serve(vec![
            answer("200 OK", "ETag: \"one\"\r\n", "the list"),
            answer("304 Not Modified", "", ""),
        ]);
        assert_eq!(
            reading(&address, None),
            Ok(Reading::Read {
                bytes: b"the list".to_vec(),
                etag: Some("\"one\"".into())
            })
        );
        assert_eq!(reading(&address, Some("\"one\"")), Ok(Reading::Unchanged));
        let asked = server.join().unwrap();
        assert!(!asked[0].to_lowercase().contains("if-none-match"));
        assert!(asked[1].to_lowercase().contains("if-none-match: \"one\""));
        assert!(asked[0].contains("Shelf/0.0.0"));
    }

    #[test]
    fn an_error_or_nothing_is_unreachable() {
        let (address, server) = serve(vec![answer("404 Not Found", "", "no")]);
        assert_eq!(reading(&address, None), Err(Refusal::Refused));
        server.join().unwrap();

        // Bound, then let go: nothing is listening there any more.
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let gone = format!("http://{}", listener.local_addr().unwrap());
        drop(listener);
        assert_eq!(reading(&gone, None), Err(Refusal::Unreachable));
    }

    #[test]
    fn says_too_large_by_what_it_says_it_is() {
        let too_many = MOST_BYTES + 1;
        let (address, server) = serve(vec![format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {too_many}\r\nConnection: close\r\n\r\n"
        )]);
        assert_eq!(reading(&address, None), Err(Refusal::Large));
        server.join().unwrap();
    }

    #[test]
    fn a_redirect_is_held_to_the_same_rule() {
        let (address, server) = serve(vec![answer(
            "302 Found",
            "Location: http://192.168.1.1/secret\r\n",
            "",
        )]);
        assert_eq!(reading(&address, None), Err(Refusal::Refused));
        server.join().unwrap();

        let (address, server) = serve(vec![answer(
            "302 Found",
            "Location: file:///C:/Windows/win.ini\r\n",
            "",
        )]);
        assert_eq!(reading(&address, None), Err(Refusal::Refused));
        server.join().unwrap();
    }

    #[test]
    fn refuses_to_read_an_address_it_does_not_allow() {
        assert_eq!(
            reading("https://192.168.1.1/source.json", None),
            Err(Refusal::Invalid)
        );
    }

    #[test]
    fn keeps_sources_across_starts_and_counts_their_links() {
        let dir = folder("kept");
        let sources = Sources::open(&dir);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        let added = sources
            .add(
                "one".into(),
                "https://a.example/s.json".into(),
                None,
                feed,
                Some("\"tag\"".into()),
                10,
            )
            .unwrap();
        assert_eq!(
            (added.items, added.magnets, added.web, added.left_out),
            (3, 2, 2, 5)
        );

        let again = Sources::open(&dir);
        assert_eq!(again.all(), vec![added]);
        assert_eq!(
            again.address("one"),
            Some((
                "https://a.example/s.json".to_string(),
                Some("\"tag\"".to_string())
            ))
        );
        assert!(again.has_address("https://a.example/s.json"));
        // The links are on disk, apart from what is read at every start.
        let list = fs::read_to_string(list_file(&dir, "one")).unwrap();
        assert!(list.contains("https://files.example.invalid/made-up-game.zip"));
        let index = fs::read_to_string(dir.join(FILE)).unwrap();
        assert!(!index.contains("files.example.invalid"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_page_is_never_told_the_etag_or_a_link() {
        let dir = folder("view");
        let sources = Sources::open(&dir);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        let added = sources
            .add(
                "one".into(),
                "https://a.example/s.json".into(),
                None,
                feed,
                Some("\"tag\"".into()),
                10,
            )
            .unwrap();
        let view = serde_json::to_string(&added).unwrap();
        assert!(!view.contains("tag"));
        assert!(!view.contains("files.example.invalid"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_address_is_kept_once() {
        let dir = folder("once");
        let sources = Sources::open(&dir);
        let feed = || parse(br#"{"name":"a","downloads":[]}"#).unwrap();
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                feed(),
                None,
                1,
            )
            .unwrap();
        assert_eq!(
            sources.add(
                "two".into(),
                "https://a.example/s".into(),
                None,
                feed(),
                None,
                2
            ),
            Err(Refusal::Duplicate)
        );
        assert!(!list_file(&dir, "two").exists());
        assert_eq!(sources.all().len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn reading_again_replaces_the_list_or_says_when() {
        let dir = folder("again");
        let sources = Sources::open(&dir);
        let first = parse(br#"{"name":"old","downloads":[]}"#).unwrap();
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                first,
                None,
                1,
            )
            .unwrap();

        let touched = sources.touch("one", 5).unwrap();
        assert_eq!((touched.added_at, touched.read_at), (1, 5));

        let next = parse(MADE_UP.as_bytes()).unwrap();
        let replaced = sources
            .replace("one", None, next, Some("\"two\"".into()), 9)
            .unwrap();
        assert_eq!(
            (replaced.name.as_str(), replaced.read_at, replaced.items),
            ("Made-up source", 9, 3)
        );
        assert_eq!(
            sources.replace("nope", None, parse(MADE_UP.as_bytes()).unwrap(), None, 9),
            Err(Refusal::Missing)
        );
        assert_eq!(sources.touch("nope", 9), Err(Refusal::Missing));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn removing_forgets_the_source_and_its_list() {
        let dir = folder("remove");
        let sources = Sources::open(&dir);
        let feed = parse(MADE_UP.as_bytes()).unwrap();
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                feed,
                None,
                1,
            )
            .unwrap();
        sources.remove("one").unwrap();
        assert!(sources.all().is_empty());
        assert!(!list_file(&dir, "one").exists());
        assert_eq!(sources.remove("one"), Err(Refusal::Missing));
        assert!(Sources::open(&dir).all().is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn two_spellings_of_a_name_have_the_same_words() {
        assert_eq!(
            words_in("Assassin's Creed: Valhalla"),
            ["assassins", "creed", "valhalla"]
        );
        assert_eq!(
            words_in("ASSASSINS CREED - VALHALLA"),
            ["assassins", "creed", "valhalla"]
        );
        assert_eq!(words_in("Pokémon"), words_in("Pokemon"));
        assert_eq!(words_in("  :: "), Vec::<String>::new());
    }

    fn searched(asked: &str) -> Vec<Found> {
        let dir = folder(&format!("search-{}", asked.len()));
        let sources = Sources::open(&dir);
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                parse(MADE_UP.as_bytes()).unwrap(),
                None,
                1,
            )
            .unwrap();
        let (place, kept) = sources.searchable();
        let found = search(&place, &kept, asked);
        fs::remove_dir_all(dir).unwrap();
        found
    }

    #[test]
    fn a_search_needs_every_word_and_never_gives_a_link() {
        // Every "made-up game" has both words. The shortest title comes first.
        let found = searched("Made-Up Game");
        assert_eq!(
            found
                .iter()
                .map(|each| each.title.as_str())
                .collect::<Vec<_>>(),
            [
                "Another Made-up Game",
                "A Third Made-up Game",
                "Made-up Game: Deluxe Edition v1.2"
            ]
        );
        assert_eq!((found[2].web, found[2].magnets), (1, 1));
        assert_eq!(found[2].file_size.as_deref(), Some("12.4 GB"));
        assert_eq!(found[2].place, 0);
        assert!(
            !serde_json::to_string(&found)
                .unwrap()
                .contains("example.invalid")
        );

        assert_eq!(searched("Deluxe Made-up").len(), 1);
        // A missing word is no match, however close the rest.
        assert!(searched("Made-up Game Remastered").is_empty());
        assert!(searched("Deluxe Editions").is_empty());
        assert!(searched(" : ").is_empty());
    }

    #[test]
    fn asks_for_a_download_only_as_it_was_shown() {
        let dir = folder("item");
        let sources = Sources::open(&dir);
        sources
            .add(
                "one".into(),
                "https://a.example/s".into(),
                None,
                parse(MADE_UP.as_bytes()).unwrap(),
                None,
                1,
            )
            .unwrap();
        let (name, item) = sources.item("one", 1, "Another Made-up Game").unwrap();
        assert_eq!(name, "Made-up source");
        assert_eq!(item.uris.len(), 1);
        assert!(sources.item("one", 1, "Something else by now").is_none());
        assert!(sources.item("one", 99, "Another Made-up Game").is_none());
        assert!(sources.item("nope", 1, "Another Made-up Game").is_none());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_it_cannot_read_is_put_aside_not_lost() {
        let dir = folder("unreadable");
        fs::write(dir.join(FILE), "{ half a fi").unwrap();
        assert!(Sources::open(&dir).all().is_empty());
        assert_eq!(
            fs::read_to_string(dir.join("sources.unreadable.json")).unwrap(),
            "{ half a fi"
        );
        fs::remove_dir_all(dir).unwrap();
    }
}
