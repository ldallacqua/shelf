//! A snapshot of a game's saves (ADR 008, section 4): a zip of the files and a list beside it, each
//! file's path written from a placeholder, with its size, time and SHA-256. Snapshots are only ever
//! new files, so two PCs sharing a folder never destroy each other's work, and which copy wins comes
//! from the parents each names (section 5), never from a clock.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// The list's format, for whatever reads it next.
pub const FORMAT: u32 = 1;
/// The most files one snapshot holds.
pub const MOST_FILES: usize = 20_000;

/// One file in a snapshot.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// From a placeholder, with `/`: `<winAppData>/A Game/slot1.sav`.
    pub path: String,
    pub size: u64,
    /// When it was last written, in milliseconds since 1970: put back on a restore, as some games
    /// pick the newest save by it.
    pub modified: u64,
    pub sha256: String,
}

/// The archive a list goes with.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Archive {
    pub size: u64,
    pub sha256: String,
}

/// A snapshot's list: what makes it exist.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct List {
    pub format: u32,
    pub id: String,
    pub entry: String,
    /// The game's title, for a person looking in the folder.
    pub title: String,
    /// The computer it was made on (`device.rs`).
    pub device: Option<String>,
    pub created_at: u64,
    /// The snapshots it came from: none for a first one, several when it settled a choice.
    #[serde(default)]
    pub parents: Vec<String>,
    /// The files' paths, sizes and hashes together: two snapshots with the same one hold the same saves.
    pub content: String,
    pub files: Vec<Item>,
    pub archive: Archive,
}

impl List {
    pub fn bytes(&self) -> u64 {
        self.files.iter().map(|file| file.size).sum()
    }
}

/// The saves as they are on this computer now: each file, and where it is.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Here {
    pub files: Vec<(Item, PathBuf)>,
    pub content: String,
}

impl Here {
    pub fn new(mut files: Vec<(Item, PathBuf)>) -> Self {
        files.sort_by_key(|(item, _)| item.path.to_lowercase());
        files.dedup_by(|a, b| a.0.path.eq_ignore_ascii_case(&b.0.path));
        let items: Vec<Item> = files.iter().map(|(item, _)| item.clone()).collect();
        Here {
            content: content_of(&items),
            files,
        }
    }

    pub fn bytes(&self) -> u64 {
        self.files.iter().map(|(item, _)| item.size).sum()
    }

    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }
}

/// The hash of what a snapshot holds, whatever made it and whenever: paths without case (Windows
/// doesn't tell them apart), sizes and hashes, in order. Times are left out: copying changes them.
pub fn content_of(items: &[Item]) -> String {
    let mut lines: Vec<String> = items
        .iter()
        .map(|item| {
            format!(
                "{}\t{}\t{}\n",
                item.path.to_lowercase(),
                item.size,
                item.sha256
            )
        })
        .collect();
    lines.sort();
    let mut hash = Sha256::new();
    for line in lines {
        hash.update(line.as_bytes());
    }
    hex(&hash.finalize())
}

pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// A file's SHA-256 and size, read once.
pub fn hash_file(path: &Path) -> io::Result<(String, u64)> {
    let mut reader = BufReader::new(File::open(path)?);
    let mut hash = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    let mut size = 0u64;
    loop {
        let read = reader.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
        size += read as u64;
    }
    Ok((hex(&hash.finalize()), size))
}

/// When a file was last written, in milliseconds since 1970.
pub fn modified_of(meta: &fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |since| since.as_millis() as u64)
}

/// What a snapshot is, apart from when and where: what it holds and what it came from. Going back to an
/// older snapshot writes one holding the same saves with other parents, perhaps in the same second, and
/// it must not take the older one's name (ADR 008, section 5).
pub fn identity(content: &str, parents: &[String]) -> String {
    let mut hash = Sha256::new();
    hash.update(content.as_bytes());
    let mut parents: Vec<&str> = parents.iter().map(String::as_str).collect();
    parents.sort_unstable();
    for parent in parents {
        hash.update(b"\n");
        hash.update(parent.as_bytes());
    }
    hex(&hash.finalize())
}

/// A snapshot's name, which no other can have: when, on which computer, and what it is (`identity`).
/// `20261107T193000Z-1a2b3c4d-0f1e2d3c4b5a`.
pub fn name(created_at: u64, device: Option<&str>, content: &str) -> String {
    let device: String = device
        .unwrap_or("")
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .take(8)
        .collect();
    let device = if device.is_empty() {
        "computer".to_string()
    } else {
        device.to_lowercase()
    };
    format!(
        "{}-{device}-{}",
        stamp(created_at),
        &content[..content.len().min(12)]
    )
}

/// A moment as `20261107T193000Z`, in UTC, from milliseconds since 1970.
pub fn stamp(ms: u64) -> String {
    let seconds = ms / 1000;
    let (hour, minute, second) = (seconds / 3600 % 24, seconds / 60 % 60, seconds % 60);
    let (year, month, day) = civil(seconds / 86_400);
    format!("{year:04}{month:02}{day:02}T{hour:02}{minute:02}{second:02}Z")
}

/// A day since 1970 as a year, month and day (Howard Hinnant's `civil_from_days`).
fn civil(days: u64) -> (u64, u64, u64) {
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year as u64, month as u64, day as u64)
}

/// Where a path from a placeholder is kept inside the zip: without the angle brackets, which Windows
/// won't have in a name, so Explorer can take a save out without Shelf.
pub fn in_archive(path: &str) -> String {
    match path.strip_prefix('<').and_then(|rest| rest.split_once('>')) {
        Some((token, rest)) => format!("{token}{rest}"),
        None => path.to_string(),
    }
}

/// What a snapshot is made with, besides the files.
pub struct Making<'a> {
    pub entry: &'a str,
    pub title: &'a str,
    pub device: Option<&'a str>,
    pub parents: Vec<String>,
    pub created_at: u64,
}

/// Why a snapshot wasn't made.
#[derive(Debug)]
pub enum Unmade {
    /// A file changed while it was being read: the game, or something else, was writing.
    Changed,
    /// The disk wouldn't have it.
    Io,
}

impl From<io::Error> for Unmade {
    fn from(_: io::Error) -> Self {
        Unmade::Io
    }
}

/// Writes a snapshot of what is here into `folder`: the archive under a `.partial` name, renamed once
/// whole, then the list, which is what makes it exist. A name that is there is never written again.
pub fn write(folder: &Path, here: &Here, making: Making) -> Result<List, Unmade> {
    write_watched(folder, here, making, &|_| {})
}

/// As `write`, saying how many of the files' bytes are in the archive as it goes.
pub fn write_watched(
    folder: &Path,
    here: &Here,
    making: Making,
    packed: &dyn Fn(u64),
) -> Result<List, Unmade> {
    fs::create_dir_all(folder)?;
    let id = name(
        making.created_at,
        making.device,
        &identity(&here.content, &making.parents),
    );
    let list_file = folder.join(format!("{id}.json"));
    if list_file.exists()
        && let Some(list) = read_list(&list_file)
    {
        return Ok(list);
    }
    let archive_file = folder.join(format!("{id}.zip"));
    let partial = folder.join(format!("{id}.zip.partial"));
    let written = write_archive(&partial, here, packed);
    let (archive_hash, archive_size) = match written {
        Ok(()) => hash_file(&partial)?,
        Err(error) => {
            let _ = fs::remove_file(&partial);
            return Err(error);
        }
    };
    fs::rename(&partial, &archive_file)?;
    let list = List {
        format: FORMAT,
        id: id.clone(),
        entry: making.entry.to_string(),
        title: making.title.to_string(),
        device: making.device.map(str::to_string),
        created_at: making.created_at,
        parents: making.parents,
        content: here.content.clone(),
        files: here.files.iter().map(|(item, _)| item.clone()).collect(),
        archive: Archive {
            size: archive_size,
            sha256: archive_hash,
        },
    };
    let next = folder.join(format!("{id}.json.partial"));
    fs::write(
        &next,
        serde_json::to_vec_pretty(&list).map_err(io::Error::other)?,
    )?;
    fs::rename(&next, &list_file)?;
    Ok(list)
}

fn write_archive(path: &Path, here: &Here, packed: &dyn Fn(u64)) -> Result<(), Unmade> {
    use zip::write::SimpleFileOptions;

    let mut zip = zip::ZipWriter::new(BufWriter::new(File::create(path)?));
    let mut buffer = vec![0u8; 64 * 1024];
    let mut done = 0u64;
    packed(done);
    for (item, source) in &here.files {
        let options = SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .large_file(item.size >= u64::from(u32::MAX));
        zip.start_file(in_archive(&item.path), options)
            .map_err(io::Error::other)?;
        let mut reader = BufReader::new(File::open(source)?);
        let mut hash = Sha256::new();
        let mut size = 0u64;
        loop {
            let read = reader.read(&mut buffer)?;
            if read == 0 {
                break;
            }
            hash.update(&buffer[..read]);
            zip.write_all(&buffer[..read])?;
            size += read as u64;
            done += read as u64;
            packed(done);
        }
        // What was hashed before is what went in, or the snapshot would lie.
        if size != item.size || hex(&hash.finalize()) != item.sha256 {
            return Err(Unmade::Changed);
        }
    }
    zip.finish().map_err(io::Error::other)?.flush()?;
    Ok(())
}

/// Copies a snapshot into another folder as new files, the archive first and the list last, each under a
/// `.partial` name until whole. One already there is left as it is. The folder gets the game's
/// `game.json` if it has none.
pub fn copy(from: &Path, to: &Path, list: &List) -> io::Result<()> {
    fs::create_dir_all(to)?;
    let game = to.join("game.json");
    if !game.exists() {
        let text = serde_json::json!({ "version": 1, "entry": list.entry, "title": list.title });
        let _ = fs::write(&game, serde_json::to_vec_pretty(&text).unwrap_or_default());
    }
    if to.join(format!("{}.json", list.id)).is_file() {
        return Ok(());
    }
    for name in [format!("{}.zip", list.id), format!("{}.json", list.id)] {
        let partial = to.join(format!("{name}.partial"));
        fs::copy(from.join(&name), &partial)?;
        fs::rename(&partial, to.join(&name))?;
    }
    Ok(())
}

pub fn read_list(path: &Path) -> Option<List> {
    let list: List = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
    let named = path.file_stem().and_then(|stem| stem.to_str()) == Some(list.id.as_str());
    (list.format <= FORMAT && named).then_some(list)
}

/// Every snapshot in a game's folder that counts: its list read, and its archive there with the
/// list's size. A cloud client may still be bringing the rest of one; until then it doesn't count.
pub fn whole(folder: &Path) -> Vec<List> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut lists: Vec<List> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "json"))
        .filter(|path| path.file_name().is_some_and(|name| name != "game.json"))
        .filter_map(|path| read_list(&path))
        .filter(|list| {
            fs::metadata(folder.join(format!("{}.zip", list.id)))
                .is_ok_and(|meta| meta.len() == list.archive.size)
        })
        .collect();
    lists.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
    lists
}

/// The snapshots no other names as its parent: the latest of each line.
pub fn heads(lists: &[List]) -> Vec<&List> {
    let parents: HashSet<&str> = lists
        .iter()
        .flat_map(|list| list.parents.iter().map(String::as_str))
        .collect();
    lists
        .iter()
        .filter(|list| !parents.contains(list.id.as_str()))
        .collect()
}

/// Whether `ancestor` is reached by following `from`'s parents.
#[derive(Debug, PartialEq, Eq)]
pub enum Line {
    Reached,
    /// Every parent followed, and it isn't among them.
    Apart,
    /// A parent is missing, pruned or not yet here: it can't be told.
    Broken,
}

pub fn line(lists: &[List], from: &str, ancestor: &str) -> Line {
    let mut seen: HashSet<&str> = HashSet::new();
    let mut next: Vec<&str> = vec![from];
    let mut broken = false;
    while let Some(id) = next.pop() {
        if id == ancestor {
            return Line::Reached;
        }
        if !seen.insert(id) {
            continue;
        }
        match lists.iter().find(|list| list.id == id) {
            Some(list) => next.extend(list.parents.iter().map(String::as_str)),
            None => broken = true,
        }
    }
    if broken { Line::Broken } else { Line::Apart }
}

/// The snapshot this PC last made or restored, as `saves.json` keeps it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Known {
    pub id: String,
    pub content: String,
}

/// What to do about a game's saves, from what is here and what the place has (ADR 008, section 5).
#[derive(Debug, PartialEq, Eq)]
pub enum Verdict {
    /// No snapshot anywhere, and no saves here.
    Nothing,
    /// The place's one head holds what is here.
    InStep(String),
    /// Another PC played since: put its head here.
    Restore(String),
    /// This PC played since its last snapshot: make one.
    BackUp,
    /// Both sides moved, or the place has two heads: the person chooses. Never decided here.
    Choose { heads: Vec<String>, here: bool },
}

/// Section 5's table. `here` is the content hash of the saves on this PC, None when it has none.
pub fn decide(here: Option<&str>, known: Option<&Known>, lists: &[List]) -> Verdict {
    let heads = heads(lists);
    let choose = |heads: &[&List]| Verdict::Choose {
        heads: heads.iter().map(|head| head.id.clone()).collect(),
        here: here.is_some_and(|here| heads.iter().all(|head| head.content != here)),
    };
    match heads.as_slice() {
        [] => {
            if here.is_some() {
                Verdict::BackUp
            } else {
                Verdict::Nothing
            }
        }
        [head] => {
            if here == Some(head.content.as_str()) {
                return Verdict::InStep(head.id.clone());
            }
            let Some(known) = known else {
                // A PC that never synced: nothing of its own to lose, or a choice.
                return if here.is_none() {
                    Verdict::Restore(head.id.clone())
                } else {
                    choose(&heads)
                };
            };
            let here_is_known = here.is_none_or(|here| here == known.content);
            if head.id == known.id {
                return if here.is_none() {
                    // The saves went from here, and the place still has them.
                    Verdict::Restore(head.id.clone())
                } else {
                    Verdict::BackUp
                };
            }
            match line(lists, &head.id, &known.id) {
                Line::Reached if here_is_known => Verdict::Restore(head.id.clone()),
                _ => choose(&heads),
            }
        }
        _ => choose(&heads),
    }
}

/// Takes the oldest snapshots past `kept` away: never a head, nor one named in `keep` (what this PC
/// knows, what a choice waits on). How many went.
pub fn prune(folder: &Path, lists: &[List], kept: usize, keep: &[&str]) -> usize {
    let mut gone = 0;
    for list in past_the_caps(lists, kept, keep) {
        // The list first: without it the archive no longer counts, whatever happens next.
        if fs::remove_file(folder.join(format!("{}.json", list.id))).is_ok() {
            let _ = fs::remove_file(folder.join(format!("{}.zip", list.id)));
            gone += 1;
        }
    }
    gone
}

/// The snapshots past the count kept, oldest last as `lists` has them (newest first), never a head nor
/// one named in `keep`: what pruning takes away, wherever they are.
pub fn past_the_caps<'a>(lists: &'a [List], kept: usize, keep: &[&str]) -> Vec<&'a List> {
    let head_ids: HashSet<&str> = heads(lists).iter().map(|head| head.id.as_str()).collect();
    lists
        .iter()
        .skip(kept)
        .filter(|list| !head_ids.contains(list.id.as_str()) && !keep.contains(&list.id.as_str()))
        .collect()
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::saves::paths::tests::{folder, put};

    pub fn item(path: &str, text: &str) -> Item {
        let mut hash = Sha256::new();
        hash.update(text.as_bytes());
        Item {
            path: path.into(),
            size: text.len() as u64,
            modified: 1,
            sha256: hex(&hash.finalize()),
        }
    }

    /// Files written into `root`, and what is here once they are.
    pub fn here_of(root: &Path, files: &[(&str, &str)]) -> Here {
        Here::new(
            files
                .iter()
                .map(|(path, text)| {
                    let on_disk = root.join(in_archive(path));
                    put(&on_disk, text);
                    (item(path, text), on_disk)
                })
                .collect(),
        )
    }

    fn list(id: &str, parents: &[&str], content: &str) -> List {
        List {
            format: FORMAT,
            id: id.into(),
            entry: "entry".into(),
            title: "A Game".into(),
            device: None,
            created_at: 0,
            parents: parents.iter().map(|parent| parent.to_string()).collect(),
            content: content.into(),
            files: Vec::new(),
            archive: Archive {
                size: 0,
                sha256: String::new(),
            },
        }
    }

    fn known(id: &str, content: &str) -> Known {
        Known {
            id: id.into(),
            content: content.into(),
        }
    }

    #[test]
    fn a_name_says_when_where_and_what() {
        assert_eq!(stamp(0), "19700101T000000Z");
        assert_eq!(stamp(1_794_079_800_000), "20261107T193000Z");
        assert_eq!(
            name(
                1_794_079_800_000,
                Some("1A2B3C4D-aaaa-bbbb"),
                "0f1e2d3c4b5a6978"
            ),
            "20261107T193000Z-1a2b3c4d-0f1e2d3c4b5a"
        );
        assert!(crate::ids::entry(&name(0, None, &"f".repeat(64))));
    }

    #[test]
    fn the_same_saves_with_other_parents_in_the_same_second_are_another_snapshot() {
        // `pnpm desktop:check` restored the first snapshot in the second it was made: the snapshot that
        // makes it the latest took its name, was never written, and the page said a newer one waited.
        let root = folder("snapshot-same-second");
        let here = here_of(&root.join("live"), &[("<base>/a.sav", "chapter one")]);
        let place = root.join("place");
        let making = |parents: Vec<String>| Making {
            entry: "entry",
            title: "A Game",
            device: Some("dev1"),
            parents,
            created_at: 5_000,
        };
        let first = write(&place, &here, making(vec![])).unwrap();
        let settled = write(&place, &here, making(vec!["later".into()])).unwrap();
        assert_ne!(settled.id, first.id);
        assert_eq!(settled.parents, ["later"]);
        assert_eq!(whole(&place).len(), 2);
        // The very same snapshot, written twice, is still one.
        assert_eq!(write(&place, &here, making(vec![])).unwrap().id, first.id);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn the_same_saves_have_the_same_content_whatever_the_case_or_order() {
        let a = Here::new(vec![
            (item("<base>/b.sav", "b"), PathBuf::new()),
            (item("<base>/A.sav", "a"), PathBuf::new()),
        ]);
        let b = Here::new(vec![
            (item("<base>/a.sav", "a"), PathBuf::new()),
            (item("<base>/b.sav", "b"), PathBuf::new()),
        ]);
        assert_eq!(a.content, b.content);
        let c = Here::new(vec![(item("<base>/a.sav", "changed"), PathBuf::new())]);
        assert_ne!(a.content, c.content);
    }

    #[test]
    fn a_snapshot_is_written_whole_and_read_back() {
        let root = folder("snapshot-write");
        let here = here_of(
            &root.join("live"),
            &[
                ("<winAppData>/A Game/slot1.sav", "one"),
                ("<base>/save/2.sav", "two"),
            ],
        );
        let place = root.join("place");
        let list = write(
            &place,
            &here,
            Making {
                entry: "entry",
                title: "A Game",
                device: Some("dev1"),
                parents: vec![],
                created_at: 1_794_079_800_000,
            },
        )
        .unwrap();
        assert_eq!(list.files.len(), 2);
        assert_eq!(whole(&place), std::slice::from_ref(&list));
        assert!(!place.join(format!("{}.zip.partial", list.id)).exists());
        let archive = File::open(place.join(format!("{}.zip", list.id))).unwrap();
        let mut zip = zip::ZipArchive::new(archive).unwrap();
        let mut text = String::new();
        zip.by_name("winAppData/A Game/slot1.sav")
            .unwrap()
            .read_to_string(&mut text)
            .unwrap();
        assert_eq!(text, "one");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_snapshot_half_arrived_does_not_count() {
        let root = folder("snapshot-half");
        let here = here_of(&root.join("live"), &[("<base>/a.sav", "a")]);
        let place = root.join("place");
        let making = || Making {
            entry: "entry",
            title: "A Game",
            device: None,
            parents: vec![],
            created_at: 5,
        };
        let list = write(&place, &here, making()).unwrap();
        // A cloud client still bringing the archive: shorter than the list says.
        fs::write(place.join(format!("{}.zip", list.id)), b"half").unwrap();
        assert!(whole(&place).is_empty());
        // A list alone, its archive not here yet.
        fs::remove_file(place.join(format!("{}.zip", list.id))).unwrap();
        assert!(whole(&place).is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_file_changed_while_read_makes_no_snapshot() {
        let root = folder("snapshot-changed");
        let here = here_of(&root.join("live"), &[("<base>/a.sav", "before")]);
        fs::write(&here.files[0].1, "after!").unwrap();
        let made = write(
            &root.join("place"),
            &here,
            Making {
                entry: "entry",
                title: "A Game",
                device: None,
                parents: vec![],
                created_at: 5,
            },
        );
        assert!(matches!(made, Err(Unmade::Changed)));
        assert!(whole(&root.join("place")).is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn heads_are_what_no_snapshot_came_from() {
        let lists = [
            list("a", &[], "1"),
            list("b", &["a"], "2"),
            list("c", &["a"], "3"),
        ];
        let ids: Vec<&str> = heads(&lists).iter().map(|head| head.id.as_str()).collect();
        assert_eq!(ids, ["b", "c"]);
        assert_eq!(line(&lists, "b", "a"), Line::Reached);
        assert_eq!(line(&lists, "b", "c"), Line::Apart);
        assert_eq!(line(&[list("d", &["gone"], "4")], "d", "a"), Line::Broken);
    }

    #[test]
    fn section_five_s_table() {
        let one = [list("a", &[], "1")];
        let two = [list("a", &[], "1"), list("b", &["a"], "2")];
        // Nothing anywhere.
        assert_eq!(decide(None, None, &[]), Verdict::Nothing);
        assert_eq!(decide(Some("1"), None, &[]), Verdict::BackUp);
        // In step.
        assert_eq!(
            decide(Some("1"), Some(&known("a", "1")), &one),
            Verdict::InStep("a".into())
        );
        // Another PC played since.
        assert_eq!(
            decide(Some("1"), Some(&known("a", "1")), &two),
            Verdict::Restore("b".into())
        );
        // This PC played since.
        assert_eq!(
            decide(Some("9"), Some(&known("a", "1")), &one),
            Verdict::BackUp
        );
        // Both.
        assert_eq!(
            decide(Some("9"), Some(&known("a", "1")), &two),
            Verdict::Choose {
                heads: vec!["b".into()],
                here: true
            }
        );
        // A PC that never synced: restores onto nothing, asks over something.
        assert_eq!(decide(None, None, &two), Verdict::Restore("b".into()));
        assert_eq!(
            decide(Some("9"), None, &two),
            Verdict::Choose {
                heads: vec!["b".into()],
                here: true
            }
        );
        // Two heads.
        let forked = [
            list("a", &[], "1"),
            list("b", &["a"], "2"),
            list("c", &["a"], "3"),
        ];
        assert_eq!(
            decide(Some("2"), Some(&known("b", "2")), &forked),
            Verdict::Choose {
                heads: vec!["b".into(), "c".into()],
                here: false
            }
        );
        // A parent gone: not guessed past.
        let broken = [list("z", &["y"], "5")];
        assert_eq!(
            decide(Some("1"), Some(&known("a", "1")), &broken),
            Verdict::Choose {
                heads: vec!["z".into()],
                here: true
            }
        );
        // The saves went from here: the place still has them.
        assert_eq!(
            decide(None, Some(&known("a", "1")), &one),
            Verdict::Restore("a".into())
        );
    }

    #[test]
    fn pruning_keeps_heads_and_what_it_is_told() {
        let root = folder("snapshot-prune");
        let place = root.join("place");
        let mut ids = Vec::new();
        let mut parent: Option<String> = None;
        for at in 0..6u64 {
            let here = here_of(
                &root.join(format!("live{at}")),
                &[("<base>/a.sav", &format!("v{at}"))],
            );
            let list = write(
                &place,
                &here,
                Making {
                    entry: "entry",
                    title: "A Game",
                    device: None,
                    parents: parent.iter().cloned().collect(),
                    created_at: 1000 * (at + 1),
                },
            )
            .unwrap();
            parent = Some(list.id.clone());
            ids.push(list.id);
        }
        let lists = whole(&place);
        assert_eq!(prune(&place, &lists, 3, &[&ids[0]]), 2);
        let left: Vec<String> = whole(&place).into_iter().map(|list| list.id).collect();
        assert_eq!(
            left,
            [
                ids[5].clone(),
                ids[4].clone(),
                ids[3].clone(),
                ids[0].clone()
            ]
        );
        fs::remove_dir_all(root).unwrap();
    }
}
