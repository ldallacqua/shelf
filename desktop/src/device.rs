//! This computer, as Shelf knows it: a random id made on the app's first start and kept in its
//! own folder, sent with every session (`tracker.rs`) so Shelf can say which of my computers played
//! what. Nothing of Windows goes into it: not the computer's name, its hardware or its user. Its
//! name is the one I give it on Shelf, kept with my account.

use std::fs;
use std::io;
use std::path::Path;

use serde::{Deserialize, Serialize};

const FILE: &str = "device.json";

/// What `device.json` holds. `version` is for whatever reads it next.
#[derive(Serialize, Deserialize)]
struct Kept {
    version: u32,
    id: String,
}

/// This computer's id.
pub struct Device {
    pub id: String,
}

impl Device {
    /// The id kept in `folder`, or a new one from `new_id`, kept there for every start after. A
    /// file that cannot be read gives way to a new id: what it named is only a name to lose.
    pub fn open(folder: &Path, new_id: impl FnOnce() -> String) -> Self {
        let file = folder.join(FILE);
        let kept = fs::read_to_string(&file)
            .ok()
            .and_then(|text| serde_json::from_str::<Kept>(&text).ok())
            .filter(|kept| !kept.id.trim().is_empty());
        if let Some(kept) = kept {
            return Device { id: kept.id };
        }
        let id = new_id();
        if let Err(error) = keep(folder, &id) {
            // Counted all the same: only this start's sessions are told apart from the next's.
            eprintln!("could not keep this computer's id: {error}");
        }
        Device { id }
    }
}

/// Written whole to a new file, then put in place, as the tracker writes its own.
fn keep(folder: &Path, id: &str) -> io::Result<()> {
    fs::create_dir_all(folder)?;
    let text = serde_json::to_string(&Kept {
        version: 1,
        id: id.to_string(),
    })
    .map_err(io::Error::other)?;
    let writing = folder.join("device.json.new");
    fs::write(&writing, text)?;
    fs::rename(&writing, folder.join(FILE))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-device-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    #[test]
    fn the_first_start_makes_an_id_and_every_start_after_keeps_it() {
        let folder = folder("kept");
        let first = Device::open(&folder, || "first".into());
        assert_eq!(first.id, "first");
        let again = Device::open(&folder, || "second".into());
        assert_eq!(again.id, "first");
        fs::remove_dir_all(&folder).unwrap();
    }

    #[test]
    fn a_file_that_cannot_be_read_gives_way_to_a_new_id() {
        let folder = folder("unreadable");
        fs::write(folder.join(FILE), "not json").unwrap();
        assert_eq!(Device::open(&folder, || "new".into()).id, "new");
        assert_eq!(Device::open(&folder, || "newer".into()).id, "new");
        fs::remove_dir_all(&folder).unwrap();
    }

    #[test]
    fn it_holds_nothing_but_the_id() {
        let folder = folder("only");
        Device::open(&folder, || "abc".into());
        assert_eq!(
            fs::read_to_string(folder.join(FILE)).unwrap(),
            r#"{"version":1,"id":"abc"}"#
        );
        fs::remove_dir_all(&folder).unwrap();
    }
}
