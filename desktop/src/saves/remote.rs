//! A place that is a service of mine, reached through its API (ADR 008, phase 5), seen as a folder of
//! snapshots like any other. A service answers four questions (`Remote`): a game's files, one read, one
//! written, one deleted. Everything else is the same for every service and is here: what was read is kept
//! on this computer by name (`Mirror`), as a snapshot never changes once written, and a snapshot counts
//! only once its list and an archive of the list's size are both there, as in a folder.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::snapshot::{self, List};

/// Why a place couldn't be used just now. Nothing is lost: what was being sent waits on this computer.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Away {
    /// No connection, a folder that isn't there, or a service that didn't answer well.
    Unreachable,
    /// The service refused the sign-in: it has to be done again.
    SignedOut,
    /// No room left there.
    Full,
}

/// A file in a game's folder there.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RemoteFile {
    pub name: String,
    pub size: u64,
    /// The service's own id for it, where it has one (Google Drive); its name otherwise.
    pub id: String,
}

/// What a service answers, a game's folder at a time. Each call may take a while: it is only made off a
/// page's thread.
pub trait Remote: Send + Sync {
    /// The files in a game's folder there; none when it has no folder yet.
    fn files(&self, entry: &str) -> Result<Vec<RemoteFile>, Away>;
    /// Reads one into `to`, a file that isn't there yet.
    fn download(&self, entry: &str, file: &RemoteFile, to: &Path) -> Result<(), Away>;
    /// Writes `from` there as `name`, in the game's folder, which is made if need be.
    fn upload(&self, entry: &str, name: &str, from: &Path) -> Result<(), Away>;
    fn delete(&self, entry: &str, file: &RemoteFile) -> Result<(), Away>;
}

/// A service, and what was read of it on this computer: a folder per game, each list and archive read,
/// by its name.
pub struct Mirror<'a> {
    pub remote: &'a dyn Remote,
    pub cache: PathBuf,
}

const GAME_FILE: &str = "game.json";

impl Mirror<'_> {
    fn folder(&self, entry: &str) -> PathBuf {
        self.cache.join(entry)
    }

    /// Reads a file there into the cache, whole or not at all.
    fn read(&self, entry: &str, file: &RemoteFile) -> Result<PathBuf, Away> {
        let folder = self.folder(entry);
        fs::create_dir_all(&folder).map_err(|_| Away::Unreachable)?;
        let to = folder.join(&file.name);
        let partial = folder.join(format!("{}.partial", file.name));
        let _ = fs::remove_file(&partial);
        self.remote.download(entry, file, &partial)?;
        fs::rename(&partial, &to).map_err(|_| Away::Unreachable)?;
        Ok(to)
    }

    /// Every snapshot of a game there that counts, newest first. A list is read once and kept; what is no
    /// longer there is let go of here too.
    pub fn lists(&self, entry: &str) -> Result<Vec<List>, Away> {
        let files = self.remote.files(entry)?;
        let sizes: HashMap<&str, u64> = files
            .iter()
            .map(|file| (file.name.as_str(), file.size))
            .collect();
        let folder = self.folder(entry);
        let mut lists = Vec::new();
        for file in &files {
            let Some(id) = file.name.strip_suffix(".json") else {
                continue;
            };
            if file.name == GAME_FILE || !crate::ids::entry(id) {
                continue;
            }
            let cached = folder.join(&file.name);
            let cached = if cached.is_file() {
                cached
            } else {
                self.read(entry, file)?
            };
            let Some(list) = snapshot::read_list(&cached) else {
                continue;
            };
            if sizes.get(format!("{id}.zip").as_str()) == Some(&list.archive.size) {
                lists.push(list);
            }
        }
        if let Ok(kept) = fs::read_dir(&folder) {
            for each in kept.filter_map(Result::ok) {
                let name = each.file_name().to_string_lossy().into_owned();
                if !sizes.contains_key(name.as_str()) {
                    let _ = fs::remove_file(each.path());
                }
            }
        }
        lists.sort_by(|a, b| b.created_at.cmp(&a.created_at).then(b.id.cmp(&a.id)));
        Ok(lists)
    }

    /// Writes there a snapshot made in `from`: its archive, then its list, which makes it count, so a
    /// sending cut short leaves nothing that counts. One there already is left as it is.
    pub fn send(&self, entry: &str, title: &str, from: &Path, list: &List) -> Result<(), Away> {
        let files = self.remote.files(entry)?;
        let there = |name: &str| files.iter().find(|file| file.name == name);
        let json = format!("{}.json", list.id);
        let zip = format!("{}.zip", list.id);
        if there(&json).is_some() {
            return Ok(());
        }
        let folder = self.folder(entry);
        fs::create_dir_all(&folder).map_err(|_| Away::Unreachable)?;
        if there(GAME_FILE).is_none() {
            // For a person looking in the service: which game a folder of ids is.
            let game = folder.join(GAME_FILE);
            let text = serde_json::json!({ "version": 1, "entry": entry, "title": title });
            fs::write(&game, serde_json::to_vec_pretty(&text).unwrap_or_default())
                .map_err(|_| Away::Unreachable)?;
            self.remote.upload(entry, GAME_FILE, &game)?;
            let _ = fs::remove_file(&game);
        }
        match there(&zip) {
            Some(file) if file.size == list.archive.size => {}
            Some(file) => {
                // Not what the list says: a sending cut short. Never counted, so it goes.
                self.remote.delete(entry, file)?;
                self.remote.upload(entry, &zip, &from.join(&zip))?;
            }
            None => self.remote.upload(entry, &zip, &from.join(&zip))?,
        }
        self.remote.upload(entry, &json, &from.join(&json))?;
        let _ = fs::copy(from.join(&json), folder.join(&json));
        Ok(())
    }

    /// The folder on this computer holding a snapshot's list and archive, the archive read from there if
    /// it isn't here yet.
    pub fn fetch(&self, entry: &str, list: &List) -> Result<PathBuf, Away> {
        let folder = self.folder(entry);
        let json = format!("{}.json", list.id);
        let zip = format!("{}.zip", list.id);
        let here =
            fs::metadata(folder.join(&zip)).is_ok_and(|meta| meta.len() == list.archive.size);
        if !here || !folder.join(&json).is_file() {
            let files = self.remote.files(entry)?;
            for name in [&zip, &json] {
                let file = files
                    .iter()
                    .find(|file| &file.name == name)
                    .ok_or(Away::Unreachable)?;
                if name == &json && folder.join(&json).is_file() {
                    continue;
                }
                self.read(entry, file)?;
            }
        }
        Ok(folder)
    }

    /// Takes snapshots away there, each list first: without it the archive no longer counts.
    pub fn remove(&self, entry: &str, ids: &[&str]) -> Result<(), Away> {
        if ids.is_empty() {
            return Ok(());
        }
        let files = self.remote.files(entry)?;
        let folder = self.folder(entry);
        for id in ids {
            for name in [format!("{id}.json"), format!("{id}.zip")] {
                if let Some(file) = files.iter().find(|file| file.name == name) {
                    self.remote.delete(entry, file)?;
                }
                let _ = fs::remove_file(folder.join(&name));
            }
        }
        Ok(())
    }
}

#[cfg(test)]
pub mod double {
    //! A service of mine on this computer, in memory: tests never talk to a real one.
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    pub struct InMemory {
        /// A game's files, by name.
        pub games: Mutex<HashMap<String, HashMap<String, Vec<u8>>>>,
        /// Answers every call with this, while set.
        pub away: Mutex<Option<Away>>,
        /// Every call made, `files entry`, `upload entry name` and so on.
        pub calls: Mutex<Vec<String>>,
    }

    impl InMemory {
        fn ask(&self, call: String) -> Result<(), Away> {
            self.calls.lock().unwrap().push(call);
            match *self.away.lock().unwrap() {
                Some(away) => Err(away),
                None => Ok(()),
            }
        }

        pub fn names(&self, entry: &str) -> Vec<String> {
            let mut names: Vec<String> = self
                .games
                .lock()
                .unwrap()
                .get(entry)
                .map(|files| files.keys().cloned().collect())
                .unwrap_or_default();
            names.sort();
            names
        }
    }

    impl Remote for InMemory {
        fn files(&self, entry: &str) -> Result<Vec<RemoteFile>, Away> {
            self.ask(format!("files {entry}"))?;
            Ok(self
                .games
                .lock()
                .unwrap()
                .get(entry)
                .map(|files| {
                    files
                        .iter()
                        .map(|(name, bytes)| RemoteFile {
                            name: name.clone(),
                            size: bytes.len() as u64,
                            id: name.clone(),
                        })
                        .collect()
                })
                .unwrap_or_default())
        }
        fn download(&self, entry: &str, file: &RemoteFile, to: &Path) -> Result<(), Away> {
            self.ask(format!("download {entry} {}", file.name))?;
            let bytes = self.games.lock().unwrap()[entry][&file.name].clone();
            fs::write(to, bytes).map_err(|_| Away::Unreachable)
        }
        fn upload(&self, entry: &str, name: &str, from: &Path) -> Result<(), Away> {
            self.ask(format!("upload {entry} {name}"))?;
            let bytes = fs::read(from).map_err(|_| Away::Unreachable)?;
            self.games
                .lock()
                .unwrap()
                .entry(entry.to_string())
                .or_default()
                .insert(name.to_string(), bytes);
            Ok(())
        }
        fn delete(&self, entry: &str, file: &RemoteFile) -> Result<(), Away> {
            self.ask(format!("delete {entry} {}", file.name))?;
            if let Some(files) = self.games.lock().unwrap().get_mut(entry) {
                files.remove(&file.name);
            }
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::double::InMemory;
    use super::*;
    use crate::saves::paths::tests::folder;
    use crate::saves::restore::archive_whole;
    use crate::saves::snapshot::tests::here_of;
    use crate::saves::snapshot::{Making, write};

    fn made(at: &Path, text: &str, created_at: u64) -> List {
        let here = here_of(
            &at.join("files"),
            &[("<winAppData>/A Game/slot1.sav", text)],
        );
        write(
            &at.join("made"),
            &here,
            Making {
                entry: "entry-1",
                title: "A Game",
                device: Some("one"),
                parents: vec![],
                created_at,
            },
        )
        .unwrap()
    }

    #[test]
    fn a_snapshot_sent_counts_once_its_list_is_there_and_is_read_back_whole() {
        let root = folder("remote-send");
        let service = InMemory::default();
        let mirror = Mirror {
            remote: &service,
            cache: root.join("cache"),
        };
        let list = made(&root, "chapter one", 1000);
        mirror
            .send("entry-1", "A Game", &root.join("made"), &list)
            .unwrap();
        assert_eq!(
            service.names("entry-1"),
            [
                format!("{}.json", list.id),
                format!("{}.zip", list.id),
                "game.json".to_string(),
            ]
        );
        // The archive went before the list.
        let calls = service.calls.lock().unwrap().clone();
        let zip = calls.iter().position(|call| call.ends_with(".zip"));
        let json = calls
            .iter()
            .position(|call| call.ends_with(&format!("{}.json", list.id)));
        assert!(zip < json);
        // Another computer, with nothing read yet, finds it, and reads its archive only when asked.
        let other = Mirror {
            remote: &service,
            cache: root.join("other"),
        };
        let lists = other.lists("entry-1").unwrap();
        assert_eq!(lists.len(), 1);
        assert!(
            !root
                .join("other")
                .join("entry-1")
                .join(format!("{}.zip", list.id))
                .exists()
        );
        let at = other.fetch("entry-1", &lists[0]).unwrap();
        assert!(archive_whole(
            &at.join(format!("{}.zip", list.id)),
            &lists[0]
        ));
        // Sent again, nothing is written twice.
        let before = service.calls.lock().unwrap().len();
        mirror
            .send("entry-1", "A Game", &root.join("made"), &list)
            .unwrap();
        let after = service.calls.lock().unwrap()[before..].to_vec();
        assert_eq!(after, ["files entry-1"]);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn a_sending_cut_short_never_counts_and_is_finished_the_next_time() {
        let root = folder("remote-half");
        let service = InMemory::default();
        let mirror = Mirror {
            remote: &service,
            cache: root.join("cache"),
        };
        let list = made(&root, "chapter one", 1000);
        // Part of the archive got there, and no list.
        service
            .games
            .lock()
            .unwrap()
            .entry("entry-1".into())
            .or_default()
            .insert(format!("{}.zip", list.id), b"short".to_vec());
        assert!(mirror.lists("entry-1").unwrap().is_empty());
        mirror
            .send("entry-1", "A Game", &root.join("made"), &list)
            .unwrap();
        let lists = mirror.lists("entry-1").unwrap();
        assert_eq!(lists.len(), 1);
        let at = mirror.fetch("entry-1", &lists[0]).unwrap();
        assert!(archive_whole(
            &at.join(format!("{}.zip", list.id)),
            &lists[0]
        ));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn what_is_taken_away_there_goes_from_here_too_and_a_service_away_says_so() {
        let root = folder("remote-remove");
        let service = InMemory::default();
        let mirror = Mirror {
            remote: &service,
            cache: root.join("cache"),
        };
        let first = made(&root.join("a"), "one", 1000);
        let second = made(&root.join("b"), "two", 2000);
        mirror
            .send("entry-1", "A Game", &root.join("a").join("made"), &first)
            .unwrap();
        mirror
            .send("entry-1", "A Game", &root.join("b").join("made"), &second)
            .unwrap();
        let lists = mirror.lists("entry-1").unwrap();
        assert_eq!(
            lists.iter().map(|list| list.id.clone()).collect::<Vec<_>>(),
            [second.id.clone(), first.id.clone()]
        );
        mirror.fetch("entry-1", &lists[1]).unwrap();
        mirror.remove("entry-1", &[first.id.as_str()]).unwrap();
        assert_eq!(mirror.lists("entry-1").unwrap().len(), 1);
        let cached = root.join("cache").join("entry-1");
        assert!(!cached.join(format!("{}.zip", first.id)).exists());
        *service.away.lock().unwrap() = Some(Away::SignedOut);
        assert_eq!(mirror.lists("entry-1"), Err(Away::SignedOut));
        let _ = fs::remove_dir_all(root);
    }
}
