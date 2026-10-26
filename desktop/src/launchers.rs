//! The files chosen for games on this computer (ADR 005, section 4), by
//! entry id, in `launchers.json` in the app's own folder. Never sent to
//! Shelf's server; another computer keeps its own.

use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

/// A game's file, as it was chosen.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Launcher {
    pub path: PathBuf,
    /// When it was chosen, in milliseconds since 1970.
    pub chosen_at: u64,
}

/// What `launchers.json` holds. `version` is for whatever reads it next.
#[derive(Default, Serialize, Deserialize)]
struct Kept {
    version: u32,
    launchers: BTreeMap<String, Launcher>,
}

const FILE: &str = "launchers.json";

pub struct Launchers {
    file: PathBuf,
    kept: Mutex<Kept>,
}

impl Launchers {
    /// The files kept in `folder`. A file that cannot be read is put aside as
    /// `launchers.unreadable.json`, not lost, and the app starts with none.
    pub fn open(folder: &Path) -> Self {
        let file = folder.join(FILE);
        let kept = match fs::read_to_string(&file) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| {
                let _ = fs::rename(&file, folder.join("launchers.unreadable.json"));
                Kept::default()
            }),
            Err(_) => Kept::default(),
        };
        Launchers {
            file,
            kept: Mutex::new(kept),
        }
    }

    pub fn get(&self, entry: &str) -> Option<Launcher> {
        self.kept.lock().unwrap().launchers.get(entry).cloned()
    }

    pub fn set(&self, entry: &str, path: PathBuf, now: u64) -> io::Result<Launcher> {
        let launcher = Launcher {
            path,
            chosen_at: now,
        };
        let mut kept = self.kept.lock().unwrap();
        kept.launchers.insert(entry.to_string(), launcher.clone());
        self.save(&kept)?;
        Ok(launcher)
    }

    pub fn forget(&self, entry: &str) -> io::Result<()> {
        let mut kept = self.kept.lock().unwrap();
        if kept.launchers.remove(entry).is_some() {
            self.save(&kept)?;
        }
        Ok(())
    }

    /// Written whole to a new file, then put in place: a write cut short
    /// leaves the last good file, never half of one.
    fn save(&self, kept: &Kept) -> io::Result<()> {
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder)?;
        }
        let next = self.file.with_extension("json.next");
        let text = serde_json::to_string_pretty(&Kept {
            version: 1,
            launchers: kept.launchers.clone(),
        })
        .map_err(io::Error::other)?;
        fs::write(&next, text)?;
        fs::rename(&next, &self.file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-launchers-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn keeps_a_file_per_entry_across_starts() {
        let dir = folder("kept");
        let launchers = Launchers::open(&dir);
        launchers
            .set("entry-1", PathBuf::from("C:\\Games\\Hades\\Hades.exe"), 10)
            .unwrap();
        launchers
            .set(
                "entry-2",
                PathBuf::from("D:\\Grim Dawn\\x64\\Grim Dawn.exe"),
                20,
            )
            .unwrap();

        let again = Launchers::open(&dir);
        assert_eq!(
            again.get("entry-2"),
            Some(Launcher {
                path: PathBuf::from("D:\\Grim Dawn\\x64\\Grim Dawn.exe"),
                chosen_at: 20
            })
        );
        again.forget("entry-1").unwrap();
        assert_eq!(Launchers::open(&dir).get("entry-1"), None);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_file_it_cannot_read_is_put_aside_not_lost() {
        let dir = folder("unreadable");
        fs::write(dir.join(FILE), "{ half a fi").unwrap();
        let launchers = Launchers::open(&dir);
        assert_eq!(launchers.get("entry-1"), None);
        assert_eq!(
            fs::read_to_string(dir.join("launchers.unreadable.json")).unwrap(),
            "{ half a fi"
        );
        launchers
            .set("entry-1", PathBuf::from("C:\\x.exe"), 1)
            .unwrap();
        assert!(Launchers::open(&dir).get("entry-1").is_some());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_write_cut_short_leaves_the_last_good_file() {
        let dir = folder("cut-short");
        let launchers = Launchers::open(&dir);
        launchers
            .set("entry-1", PathBuf::from("C:\\x.exe"), 1)
            .unwrap();
        // What a write cut short leaves behind: the next file, never moved into place.
        fs::write(dir.join("launchers.json.next"), "{ half").unwrap();
        assert!(Launchers::open(&dir).get("entry-1").is_some());
        fs::remove_dir_all(dir).unwrap();
    }
}
