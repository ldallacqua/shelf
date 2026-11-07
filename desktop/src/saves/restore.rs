//! Putting a snapshot back (ADR 008, section 6). Every path is read before anything is written, as
//! `extract.rs` reads an archive: a plain path from a placeholder known here, inside one of the game's
//! locations on this PC, or the whole snapshot is refused. The files come out into a folder of the
//! app's own, each checked against its hash, and only then go into place. What was here was backed up
//! first, and the journal (`mod.rs`) undoes a restore cut short.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, BufReader, BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, UNIX_EPOCH};

use sha2::{Digest, Sha256};

use super::paths::{self, key};
use super::snapshot::{self, Item, List, MOST_FILES};

/// One file a restore writes: what it is, and where it goes on this PC.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Target {
    pub item: Item,
    pub to: PathBuf,
}

/// Why a snapshot won't be put back.
#[derive(Debug, PartialEq, Eq)]
pub enum Refused {
    /// A path that isn't plain, or isn't inside one of the game's locations here.
    Path(String),
    /// More than the caps allow.
    Large,
    /// Its archive isn't what its list says.
    Damaged,
}

/// Where each file of a snapshot goes, every path checked first. `holds` says whether a path written
/// from a placeholder is inside one of the game's locations on this PC.
pub fn plan(
    list: &List,
    holds: impl Fn(&str) -> bool,
    to: impl Fn(&str) -> Option<PathBuf>,
    most_bytes: u64,
) -> Result<Vec<Target>, Refused> {
    if list.files.len() > MOST_FILES || list.bytes() > most_bytes {
        return Err(Refused::Large);
    }
    let mut seen = HashSet::new();
    let mut targets = Vec::with_capacity(list.files.len());
    for item in &list.files {
        let Some(at) = to(&item.path) else {
            return Err(Refused::Path(item.path.clone()));
        };
        if !holds(&item.path) || !seen.insert(key(&at)) || paths::reparse_point(&at) {
            return Err(Refused::Path(item.path.clone()));
        }
        targets.push(Target {
            item: item.clone(),
            to: at,
        });
    }
    Ok(targets)
}

/// Whether an archive is the one its list names: its size and SHA-256.
pub fn archive_whole(archive: &Path, list: &List) -> bool {
    snapshot::hash_file(archive)
        .is_ok_and(|(hash, size)| size == list.archive.size && hash == list.archive.sha256)
}

/// Takes each file out of the archive into `staging`, checked against its size and hash. Nothing is
/// put in place yet.
pub fn stage(archive: &Path, targets: &[Target], staging: &Path) -> Result<Vec<PathBuf>, Refused> {
    let _ = fs::remove_dir_all(staging);
    fs::create_dir_all(staging).map_err(|_| Refused::Damaged)?;
    let file = File::open(archive).map_err(|_| Refused::Damaged)?;
    let mut zip = zip::ZipArchive::new(BufReader::new(file)).map_err(|_| Refused::Damaged)?;
    let mut staged = Vec::with_capacity(targets.len());
    let mut buffer = vec![0u8; 64 * 1024];
    for (at, target) in targets.iter().enumerate() {
        let mut entry = zip
            .by_name(&snapshot::in_archive(&target.item.path))
            .map_err(|_| Refused::Damaged)?;
        let path = staging.join(at.to_string());
        let mut out = BufWriter::new(File::create(&path).map_err(|_| Refused::Damaged)?);
        let mut hash = Sha256::new();
        let mut size = 0u64;
        loop {
            let read = entry.read(&mut buffer).map_err(|_| Refused::Damaged)?;
            if read == 0 {
                break;
            }
            size += read as u64;
            // More than the list says is a damaged archive, however much more it would give.
            if size > target.item.size {
                return Err(Refused::Damaged);
            }
            hash.update(&buffer[..read]);
            out.write_all(&buffer[..read])
                .map_err(|_| Refused::Damaged)?;
        }
        out.flush().map_err(|_| Refused::Damaged)?;
        if size != target.item.size || snapshot::hex(&hash.finalize()) != target.item.sha256 {
            return Err(Refused::Damaged);
        }
        staged.push(path);
    }
    Ok(staged)
}

/// Puts what was staged in place, and takes away the files of the game's locations the snapshot
/// doesn't have: the location becomes what it holds (they are in the backup just made).
pub fn put_in_place(targets: &[Target], staged: &[PathBuf], current: &[PathBuf]) -> io::Result<()> {
    for (target, from) in targets.iter().zip(staged) {
        if let Some(folder) = target.to.parent() {
            fs::create_dir_all(folder)?;
        }
        move_over(from, &target.to)?;
        let when = UNIX_EPOCH + Duration::from_millis(target.item.modified);
        if let Ok(file) = File::options().write(true).open(&target.to) {
            let _ = file.set_modified(when);
        }
    }
    let written: HashSet<String> = targets.iter().map(|target| key(&target.to)).collect();
    for file in current {
        if !written.contains(&key(file)) && file.is_file() && !paths::reparse_point(file) {
            fs::remove_file(file)?;
        }
    }
    Ok(())
}

/// A file moved over another: renamed when both are on one disk, which Windows does in one step;
/// otherwise copied beside it first, then renamed over it.
fn move_over(from: &Path, to: &Path) -> io::Result<()> {
    if fs::rename(from, to).is_ok() {
        return Ok(());
    }
    let beside = to.with_file_name(format!(
        "{}.shelf-new",
        to.file_name()
            .map_or_else(String::new, |name| name.to_string_lossy().into_owned())
    ));
    let copied = fs::copy(from, &beside).and_then(|_| fs::rename(&beside, to));
    if copied.is_err() {
        let _ = fs::remove_file(&beside);
    }
    copied?;
    let _ = fs::remove_file(from);
    Ok(())
}

/// Reads an archive's files back to where a list of them says, for undoing a restore from its backup.
pub fn put_back_all(
    archive: &Path,
    files: &[Target],
    touched: &[PathBuf],
    staging: &Path,
) -> io::Result<()> {
    let staged =
        stage(archive, files, staging).map_err(|_| io::Error::other("backup unreadable"))?;
    put_in_place(files, &staged, touched)?;
    let _ = fs::remove_dir_all(staging);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::saves::paths::tests::{computer, folder, put};
    use crate::saves::paths::{Pattern, pattern};
    use crate::saves::snapshot::tests::item;
    use crate::saves::snapshot::{Archive, FORMAT, Here, Making, write};

    fn list_of(files: Vec<Item>) -> List {
        List {
            format: FORMAT,
            id: "x".into(),
            entry: "entry".into(),
            title: "A Game".into(),
            device: None,
            created_at: 0,
            parents: vec![],
            content: String::new(),
            files,
            archive: Archive {
                size: 0,
                sha256: String::new(),
            },
        }
    }

    #[test]
    fn a_path_outside_the_game_s_locations_refuses_the_whole_snapshot() {
        let root = Path::new("C:\\x");
        let (folders, game) = computer(root);
        let saves = pattern("<winAppData>/A Game", &game, &folders, false).unwrap();
        let holds = |path: &str| saves.holds(path);
        let to = |path: &str| paths::here(path, &folders, &game);
        let good = list_of(vec![item("<winAppData>/A Game/slot1.sav", "a")]);
        assert_eq!(plan(&good, holds, to, 1000).unwrap().len(), 1);
        for bad in [
            "<winAppData>/Another Game/slot1.sav",
            "<winAppData>/A Game/../../Windows/x.dll",
            "<winAppData>/A Game/a.sav:stream",
            "<home>/AppData/Roaming/A Game/slot1.sav",
        ] {
            let list = list_of(vec![
                item("<winAppData>/A Game/slot1.sav", "a"),
                item(bad, "b"),
            ]);
            assert_eq!(
                plan(&list, holds, to, 1000),
                Err(Refused::Path(bad.into())),
                "{bad}"
            );
        }
        let twice = list_of(vec![
            item("<winAppData>/A Game/slot1.sav", "a"),
            item("<winAppData>/A Game/SLOT1.sav", "b"),
        ]);
        assert!(plan(&twice, holds, to, 1000).is_err());
        assert_eq!(plan(&good, holds, to, 0), Err(Refused::Large));
    }

    #[test]
    fn a_restore_puts_the_files_back_and_takes_away_what_the_snapshot_lacks() {
        let root = folder("restore-put");
        let (folders, game) = computer(&root);
        let saves = folders.app_data.clone().unwrap().join("A Game");
        put(&saves.join("slot1.sav"), "old one");
        put(&saves.join("slot2.sav"), "new on this pc");
        let made = Here::new(vec![(
            item("<winAppData>/A Game/slot1.sav", "from the other pc"),
            {
                let at = root.join("other").join("slot1.sav");
                put(&at, "from the other pc");
                at
            },
        )]);
        let list = write(
            &root.join("place"),
            &made,
            Making {
                entry: "entry",
                title: "A Game",
                device: None,
                parents: vec![],
                created_at: 5,
            },
        )
        .unwrap();
        let archive = root.join("place").join(format!("{}.zip", list.id));
        assert!(archive_whole(&archive, &list));
        let location: Pattern = pattern("<winAppData>/A Game", &game, &folders, false).unwrap();
        let targets = plan(
            &list,
            |path| location.holds(path),
            |path| paths::here(path, &folders, &game),
            1000,
        )
        .unwrap();
        let staged = stage(&archive, &targets, &root.join("staging")).unwrap();
        let current = vec![saves.join("slot1.sav"), saves.join("slot2.sav")];
        put_in_place(&targets, &staged, &current).unwrap();
        assert_eq!(
            fs::read_to_string(saves.join("slot1.sav")).unwrap(),
            "from the other pc"
        );
        assert!(!saves.join("slot2.sav").exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_damaged_archive_puts_nothing_in_place() {
        let root = folder("restore-damaged");
        let (folders, game) = computer(&root);
        let live = root.join("live").join("slot1.sav");
        put(&live, "saved");
        let made = Here::new(vec![(item("<winAppData>/A Game/slot1.sav", "saved"), live)]);
        let list = write(
            &root.join("place"),
            &made,
            Making {
                entry: "entry",
                title: "A Game",
                device: None,
                parents: vec![],
                created_at: 5,
            },
        )
        .unwrap();
        let archive = root.join("place").join(format!("{}.zip", list.id));
        let mut tampered = list.clone();
        tampered.files[0].sha256 = "0".repeat(64);
        let location = pattern("<winAppData>/A Game", &game, &folders, false).unwrap();
        let targets = plan(
            &tampered,
            |path| location.holds(path),
            |path| paths::here(path, &folders, &game),
            1000,
        )
        .unwrap();
        assert_eq!(
            stage(&archive, &targets, &root.join("staging")),
            Err(Refused::Damaged)
        );
        assert!(
            !folders
                .app_data
                .unwrap()
                .join("A Game")
                .join("slot1.sav")
                .exists()
        );
        assert!(!archive_whole(&archive, &tampered) || tampered.archive == list.archive);
        fs::write(&archive, b"not a zip at all").unwrap();
        assert!(!archive_whole(&archive, &list));
        fs::remove_dir_all(root).unwrap();
    }
}
