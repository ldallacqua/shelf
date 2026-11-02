//! Opening an archive that was downloaded (ADR 007, phase 4): zip, 7z or rar, into a folder of its own.
//! Everything in it is read first, and one path that would leave the folder, or one link, refuses the whole
//! archive before anything is written. Shelf writes every file itself, under a name it has made safe, and
//! nothing that comes out is started.

use std::fs::{self, File};
use std::io::{self, BufReader, Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

use serde::Serialize;
use sevenz_rust2::{Archive, ArchiveReader, Password};
use zip::ZipArchive;

use crate::downloads::safe_name;

/// More entries than any game has: past this it is meant to wear a disk out, not to be a game.
const MOST_ENTRIES: usize = 1_000_000;
const CHUNK: usize = 256 * 1024;
/// What Windows starts by itself, which keeps the archive's mark. Marking everything would break games
/// that load their own libraries, as .NET refuses a marked one.
const STARTABLE: [&str; 16] = [
    "bat", "cmd", "com", "cpl", "exe", "hta", "jar", "js", "lnk", "msi", "pif", "ps1", "scr",
    "url", "vbs", "wsf",
];

/// Why an archive wasn't opened, in a word a page has a sentence for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Failure {
    /// Cancel. Never shown.
    Stopped,
    /// The app ended while it was at it.
    Interrupted,
    /// It needs a password, which Shelf doesn't ask for (ADR 007, decision 3).
    Password,
    /// A path that would leave the folder, or a link.
    Unsafe,
    /// Damaged, incomplete, or packed in a way these readers don't know.
    Damaged,
    /// A later part isn't there.
    Volume,
    Disk,
    Write,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Kind {
    Zip,
    SevenZip,
    Rar,
}

/// One thing an archive holds, as it says.
struct Listed {
    name: String,
    directory: bool,
    link: bool,
    encrypted: bool,
    size: u64,
}

/// An archive that has been read through and can be opened.
#[derive(Debug)]
pub struct Plan {
    archive: PathBuf,
    kind: Kind,
    /// What it comes to, which the disk needs room for.
    pub total: u64,
    /// One folder around everything, which would only stand inside the folder made for it.
    strip_top: bool,
    /// What to call the folder.
    pub name: String,
}

/// How a page hears of it, and stops it.
pub struct Progress<'a> {
    pub stop: &'a AtomicBool,
    pub done: &'a AtomicU64,
}

fn name_of(file: &Path) -> String {
    file.file_name()
        .map(|name| name.to_string_lossy().to_lowercase())
        .unwrap_or_default()
}

/// `game.part2.rar`'s and `game.7z.002`'s number, and 1 for anything that isn't a later part.
fn part_number(name: &str) -> u32 {
    let numbered = |text: &str| text.parse::<u32>().ok().filter(|_| !text.is_empty());
    if let Some((stem, number)) = name.rsplit_once('.')
        && stem.ends_with(".7z")
        && let Some(number) = numbered(number)
    {
        return number;
    }
    name.strip_suffix(".rar")
        .and_then(|stem| stem.rsplit_once(".part"))
        .and_then(|(_, number)| numbered(number))
        .unwrap_or(1)
}

/// By its name and then by what it starts with: a game's own data can start like a zip, and a name alone
/// proves nothing.
fn kind_of(file: &Path) -> Option<Kind> {
    let name = name_of(file);
    let by_name = if name.ends_with(".zip") {
        Kind::Zip
    } else if name.ends_with(".rar") {
        Kind::Rar
    } else if name.ends_with(".7z") || name.ends_with(".7z.001") {
        Kind::SevenZip
    } else {
        return None;
    };
    let mut start = [0; 6];
    File::open(file).ok()?.read_exact(&mut start).ok()?;
    let by_start = match start {
        [b'P', b'K', 3, 4, ..] | [b'P', b'K', 5, 6, ..] => Kind::Zip,
        [b'7', b'z', 0xBC, 0xAF, 0x27, 0x1C] => Kind::SevenZip,
        [b'R', b'a', b'r', b'!', 0x1A, 7] => Kind::Rar,
        _ => return None,
    };
    (by_name == by_start).then_some(by_start)
}

/// Of these files, the archives to open: an archive in several parts counts once, by its first.
pub fn archives_in(files: &[PathBuf]) -> Vec<PathBuf> {
    files
        .iter()
        .filter(|file| part_number(&name_of(file)) == 1 && kind_of(file).is_some())
        .cloned()
        .collect()
}

/// What to call the folder: the archive's name without its kind or its part.
fn stem_of(archive: &Path) -> String {
    let full = archive
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let lower = full.to_lowercase();
    let mut keep = full.len();
    for ending in [".zip", ".rar", ".7z", ".7z.001"] {
        if lower.ends_with(ending) {
            keep = keep.min(full.len() - ending.len());
        }
    }
    let mut stem = &full[..keep];
    if lower.ends_with(".rar")
        && let Some((before, number)) = stem.rsplit_once(".part")
        && number.parse::<u32>().is_ok()
    {
        stem = before;
    }
    let stem = safe_name(stem);
    if stem.is_empty() {
        "extracted".to_string()
    } else {
        stem
    }
}

/// A path from inside an archive as folders and a name that stay in the folder, or `Err` if it was
/// going to leave it. No parts at all is a name that says nothing, like `./`.
fn safe_path(name: &str) -> Result<Vec<String>, Failure> {
    // From the root, or from a drive or a share. `:` also names a file's hidden stream.
    if name.starts_with(['/', '\\']) || name.contains(':') {
        return Err(Failure::Unsafe);
    }
    let mut parts = Vec::new();
    for part in name.split(['/', '\\']) {
        if part.is_empty() || part == "." {
            continue;
        }
        // Windows drops spaces and dots from a name's end, so `.. ` is `..`.
        if part.trim_end_matches([' ', '.']).is_empty() {
            return Err(Failure::Unsafe);
        }
        let safe = safe_name(part);
        if safe.is_empty() {
            return Err(Failure::Unsafe);
        }
        // A download's name loses its leading dots, and a game's own `.config` needs them.
        let dots = part.len() - part.trim_start_matches('.').len();
        parts.push(format!("{}{safe}", &part[..dots]));
    }
    Ok(parts)
}

/// Reads an archive through without writing anything, and says whether it can be opened.
pub fn plan(archive: &Path) -> Result<Plan, Failure> {
    let kind = kind_of(archive).ok_or(Failure::Damaged)?;
    let listed = match kind {
        Kind::Zip => list_zip(archive)?,
        Kind::SevenZip => list_seven_zip(archive)?,
        Kind::Rar => rar::list(archive)?,
    };
    if listed.len() > MOST_ENTRIES {
        return Err(Failure::Damaged);
    }
    let mut total: u64 = 0;
    let mut top: Option<String> = None;
    let mut one_top = true;
    for each in &listed {
        if each.link {
            return Err(Failure::Unsafe);
        }
        if each.encrypted {
            return Err(Failure::Password);
        }
        let path = safe_path(&each.name)?;
        total = total.checked_add(each.size).ok_or(Failure::Damaged)?;
        let Some(first) = path.first() else {
            continue;
        };
        one_top &= match &top {
            Some(top) => top == first,
            None => {
                top = Some(first.clone());
                true
            }
        };
        // A file beside everything else means nothing stands around it all.
        one_top &= path.len() > 1 || is_directory(each);
    }
    Ok(Plan {
        archive: archive.to_path_buf(),
        kind,
        total,
        strip_top: one_top && top.is_some(),
        name: stem_of(archive),
    })
}

fn is_directory(each: &Listed) -> bool {
    each.directory || each.name.ends_with(['/', '\\'])
}

/// Writes what the archive holds into an empty folder.
pub fn unpack(plan: &Plan, into: &Path, progress: &Progress<'_>) -> Result<(), Failure> {
    let writer = Writer {
        into,
        strip_top: plan.strip_top,
        mark: mark_of(&plan.archive),
        progress,
    };
    match plan.kind {
        Kind::Zip => unpack_zip(&plan.archive, &writer),
        Kind::SevenZip => unpack_seven_zip(&plan.archive, &writer),
        Kind::Rar => rar::unpack(&plan.archive, &writer),
    }
}

/// The mark the archive came with, so that what comes out of it is looked at as it would have been.
/// One taken off by hand isn't copied, and an archive is marked again: this came from the internet.
fn mark_of(archive: &Path) -> String {
    let mut stream = archive.as_os_str().to_owned();
    stream.push(":Zone.Identifier");
    #[cfg(windows)]
    if let Ok(mark) = fs::read_to_string(stream) {
        return mark;
    }
    "[ZoneTransfer]\r\nZoneId=3\r\n".to_string()
}

fn startable(file: &Path) -> bool {
    file.extension()
        .map(|kind| kind.to_string_lossy().to_lowercase())
        .is_some_and(|kind| STARTABLE.contains(&kind.as_str()))
}

fn write_failure(error: &io::Error) -> Failure {
    if error.kind() == io::ErrorKind::StorageFull {
        Failure::Disk
    } else {
        Failure::Write
    }
}

/// Everything that goes on the disk goes through here.
struct Writer<'a> {
    into: &'a Path,
    strip_top: bool,
    mark: String,
    progress: &'a Progress<'a>,
}

impl Writer<'_> {
    /// Where a name goes, checked again: this is the one that counts. None for what has nowhere to go,
    /// like the one folder around everything.
    fn place(&self, name: &str) -> Result<Option<PathBuf>, Failure> {
        let path = safe_path(name)?;
        let skip = usize::from(self.strip_top);
        if path.len() <= skip {
            return Ok(None);
        }
        Ok(Some(
            path[skip..]
                .iter()
                .fold(self.into.to_path_buf(), |folder, part| folder.join(part)),
        ))
    }

    fn directory(&self, name: &str) -> Result<(), Failure> {
        if let Some(path) = self.place(name)? {
            fs::create_dir_all(path).map_err(|error| write_failure(&error))?;
        }
        Ok(())
    }

    /// A file about to be written, of the size the archive said, or none if it has nowhere to go.
    fn file(&self, name: &str, size: u64) -> Result<Option<Sink<'_>>, Failure> {
        let Some(path) = self.place(name)? else {
            return Ok(None);
        };
        if let Some(folder) = path.parent() {
            fs::create_dir_all(folder).map_err(|error| write_failure(&error))?;
        }
        let file = File::create(&path).map_err(|error| write_failure(&error))?;
        Ok(Some(Sink {
            file,
            path,
            left: size,
            writer: self,
        }))
    }
}

struct Sink<'a> {
    file: File,
    path: PathBuf,
    left: u64,
    writer: &'a Writer<'a>,
}

impl Sink<'_> {
    fn write(&mut self, bytes: &[u8]) -> Result<(), Failure> {
        let progress = self.writer.progress;
        if progress.stop.load(Ordering::Relaxed) {
            return Err(Failure::Stopped);
        }
        // More than the archive said is how a small file fills a disk.
        self.left = self
            .left
            .checked_sub(bytes.len() as u64)
            .ok_or(Failure::Damaged)?;
        self.file
            .write_all(bytes)
            .map_err(|error| write_failure(&error))?;
        progress
            .done
            .fetch_add(bytes.len() as u64, Ordering::Relaxed);
        Ok(())
    }

    fn pour(
        &mut self,
        from: &mut dyn Read,
        unreadable: fn(io::Error) -> Failure,
    ) -> Result<(), Failure> {
        let mut chunk = vec![0; CHUNK];
        loop {
            let size = from.read(&mut chunk).map_err(unreadable)?;
            if size == 0 {
                return Ok(());
            }
            self.write(&chunk[..size])?;
        }
    }

    /// All of it arrived. Less than the archive said is an archive that lied.
    fn finish(self) -> Result<(), Failure> {
        if self.left != 0 {
            return Err(Failure::Damaged);
        }
        self.file
            .sync_all()
            .map_err(|error| write_failure(&error))?;
        drop(self.file);
        if startable(&self.path) {
            mark(&self.path, &self.writer.mark);
        }
        Ok(())
    }
}

fn mark(file: &Path, text: &str) {
    #[cfg(windows)]
    {
        let mut stream = file.as_os_str().to_owned();
        stream.push(":Zone.Identifier");
        let _ = fs::write(stream, text);
    }
    #[cfg(not(windows))]
    let _ = (file, text);
}

fn open_zip(archive: &Path) -> Result<ZipArchive<BufReader<File>>, Failure> {
    let file = File::open(archive).map_err(|_| Failure::Damaged)?;
    ZipArchive::new(BufReader::new(file)).map_err(|_| Failure::Damaged)
}

fn list_zip(archive: &Path) -> Result<Vec<Listed>, Failure> {
    let mut zip = open_zip(archive)?;
    (0..zip.len())
        .map(|at| {
            let file = zip.by_index_raw(at).map_err(|_| Failure::Damaged)?;
            Ok(Listed {
                name: file.name().map_err(|_| Failure::Damaged)?.into_owned(),
                directory: file.is_dir(),
                link: file.is_symlink(),
                encrypted: file.encrypted(),
                size: file.size(),
            })
        })
        .collect()
}

fn unpack_zip(archive: &Path, writer: &Writer<'_>) -> Result<(), Failure> {
    let mut zip = open_zip(archive)?;
    for at in 0..zip.len() {
        let mut file = zip.by_index(at).map_err(|_| Failure::Damaged)?;
        let name = file.name().map_err(|_| Failure::Damaged)?.into_owned();
        if file.is_dir() || name.ends_with(['/', '\\']) {
            writer.directory(&name)?;
            continue;
        }
        let size = file.size();
        if let Some(mut sink) = writer.file(&name, size)? {
            // A checksum that doesn't match comes as an error at the end of reading.
            sink.pour(&mut file, |_| Failure::Damaged)?;
            sink.finish()?;
        }
    }
    Ok(())
}

/// The parts of a 7z in several, read as the one file they were cut from.
struct Volumes {
    files: Vec<(File, u64)>,
    at: u64,
    whole: u64,
}

impl Volumes {
    /// `game.7z`, or `game.7z.001` and as many after it, in order, as there are.
    fn open(first: &Path) -> io::Result<Self> {
        let mut files = Vec::new();
        let mut number = 1;
        let mut path = first.to_path_buf();
        loop {
            let file = File::open(&path)?;
            let size = file.metadata()?.len();
            files.push((file, size));
            if part_number(&name_of(first)) != 1 || !name_of(first).ends_with(".001") {
                break;
            }
            number += 1;
            path = first.with_extension(format!("{number:03}"));
            if !path.is_file() {
                break;
            }
        }
        let whole = files.iter().map(|(_, size)| size).sum();
        Ok(Volumes {
            files,
            at: 0,
            whole,
        })
    }
}

impl Read for Volumes {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let mut start = 0;
        for (file, size) in &mut self.files {
            let end = start + *size;
            if self.at < end {
                file.seek(SeekFrom::Start(self.at - start))?;
                let room = (end - self.at).min(buffer.len() as u64) as usize;
                let read = file.read(&mut buffer[..room])?;
                self.at += read as u64;
                return Ok(read);
            }
            start = end;
        }
        Ok(0)
    }
}

impl Seek for Volumes {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let at = match to {
            SeekFrom::Start(at) => Some(at),
            SeekFrom::End(by) => self.whole.checked_add_signed(by),
            SeekFrom::Current(by) => self.at.checked_add_signed(by),
        };
        self.at = at.ok_or_else(|| io::Error::from(io::ErrorKind::InvalidInput))?;
        Ok(self.at)
    }
}

fn seven_zip_failure(error: &sevenz_rust2::Error) -> Failure {
    match error {
        sevenz_rust2::Error::PasswordRequired | sevenz_rust2::Error::MaybeBadPassword(_) => {
            Failure::Password
        }
        _ => Failure::Damaged,
    }
}

fn open_seven_zip(archive: &Path) -> Result<(Archive, BufReader<Volumes>), Failure> {
    let volumes = Volumes::open(archive).map_err(|_| Failure::Damaged)?;
    let mut reader = BufReader::with_capacity(CHUNK, volumes);
    let read = Archive::read(&mut reader, &Password::empty())
        .map_err(|error| seven_zip_failure(&error))?;
    Ok((read, reader))
}

/// Bits a 7z made on Windows and on Unix each use for "this is a link".
fn is_seven_zip_link(windows_attributes: u32) -> bool {
    const REPARSE_POINT: u32 = 0x400;
    const UNIX_MODE_FOLLOWS: u32 = 0x8000;
    const UNIX_LINK: u32 = 0o120_000;
    windows_attributes & REPARSE_POINT != 0
        || (windows_attributes & UNIX_MODE_FOLLOWS != 0
            && (windows_attributes >> 16) & 0o170_000 == UNIX_LINK)
}

fn list_seven_zip(archive: &Path) -> Result<Vec<Listed>, Failure> {
    let (read, _) = open_seven_zip(archive)?;
    Ok(read
        .files
        .iter()
        .filter(|entry| !entry.is_anti_item)
        .map(|entry| Listed {
            name: entry.name.clone(),
            directory: entry.is_directory,
            link: entry.has_windows_attributes && is_seven_zip_link(entry.windows_attributes),
            encrypted: false,
            size: entry.size,
        })
        .collect())
}

fn unpack_seven_zip(archive: &Path, writer: &Writer<'_>) -> Result<(), Failure> {
    let (read, source) = open_seven_zip(archive)?;
    let mut reader = ArchiveReader::from_archive(read, source, Password::empty());
    // Its errors can't carry this one's, so it waits here for after.
    let mut failed = None;
    let outcome = reader.for_each_entries(|entry, data| {
        let written = if entry.is_anti_item {
            Ok(())
        } else if entry.is_directory {
            writer.directory(&entry.name)
        } else {
            writer.file(&entry.name, entry.size).and_then(|sink| {
                let Some(mut sink) = sink else {
                    return Ok(());
                };
                sink.pour(data, |error| match error.kind() {
                    // How a wrong or missing password shows up when the data is read.
                    io::ErrorKind::PermissionDenied => Failure::Password,
                    _ => Failure::Damaged,
                })?;
                sink.finish()
            })
        };
        match written {
            Ok(()) => Ok(true),
            Err(failure) => {
                failed = Some(failure);
                Ok(false)
            }
        }
    });
    if let Some(failure) = failed {
        return Err(failure);
    }
    outcome.map_err(|error| seven_zip_failure(&error))
}

/// RAR, through the decoder its makers publish, in C++. It is only ever asked to test: then it hands over
/// each file's bytes and creates nothing, so what is wrong with where it would write (CVE-2025-6218,
/// CVE-2025-8088, in versions as old as the one this crate carries) has nothing to act on.
#[cfg(windows)]
mod rar {
    use std::ffi::OsStr;
    use std::mem;
    use std::os::raw::{c_char, c_int};
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use std::ptr;

    use unrar_sys::{
        Callback, ERAR_BAD_PASSWORD, ERAR_END_ARCHIVE, ERAR_EOPEN, ERAR_MISSING_PASSWORD,
        ERAR_SUCCESS, Handle, HeaderDataEx, LPARAM, OpenArchiveDataEx, RAR_OM_EXTRACT, RAR_OM_LIST,
        RAR_SKIP, RAR_TEST, RAR_VOL_ASK, RARCloseArchive, RAROpenArchiveEx, RARProcessFileW,
        RARReadHeaderEx, RHDF_DIRECTORY, RHDF_ENCRYPTED, UCM_CHANGEVOLUMEW, UCM_NEEDPASSWORDW,
        UCM_PROCESSDATA, UINT,
    };

    use super::{Failure, Listed, Sink, Writer};

    // The decoder's `dll.hpp` packs its structs, and the crate's copies of them aren't: past the first
    // pointer they don't line up, so its `redir_type`, which says a file is a link, reads the wrong bytes.
    // These are the decoder's, as `dll.hpp` of the version this crate carries has them.

    #[repr(C, packed)]
    struct OpenData {
        archive_name: *const c_char,
        archive_name_w: *const u16,
        open_mode: u32,
        open_result: u32,
        comment_buffer: *mut c_char,
        comment_buffer_size: u32,
        comment_size: u32,
        comment_state: u32,
        flags: u32,
        callback: Option<Callback>,
        user_data: LPARAM,
        op_flags: u32,
        comment_buffer_w: *mut u16,
        reserved: [u32; 25],
    }

    #[repr(C, packed)]
    struct Header {
        archive_name: [c_char; 1024],
        archive_name_w: [u16; 1024],
        filename: [c_char; 1024],
        filename_w: [u16; 1024],
        flags: u32,
        pack_size: u32,
        pack_size_high: u32,
        unp_size: u32,
        unp_size_high: u32,
        host_os: u32,
        file_crc: u32,
        file_time: u32,
        unp_ver: u32,
        method: u32,
        file_attr: u32,
        comment_buffer: *mut c_char,
        comment_buffer_size: u32,
        comment_size: u32,
        comment_state: u32,
        dict_size: u32,
        hash_type: u32,
        hash: [c_char; 32],
        redir_type: u32,
        redir_name: *mut u16,
        redir_name_size: u32,
        dir_target: u32,
        mtime_low: u32,
        mtime_high: u32,
        ctime_low: u32,
        ctime_high: u32,
        atime_low: u32,
        atime_high: u32,
        arc_name_ex: *mut u16,
        arc_name_ex_size: u32,
        file_name_ex: *mut u16,
        file_name_ex_size: u32,
        reserved: [u32; 982],
    }

    /// What the decoder's callback reaches. It is called on this thread, inside `RARProcessFileW`.
    #[derive(Default)]
    struct Talk<'a> {
        sink: Option<Sink<'a>>,
        /// Why the callback told it to stop.
        failed: Option<Failure>,
    }

    /// Never asks anyone anything: a part that isn't there and a password both end it.
    extern "C" fn answer(message: UINT, user: LPARAM, first: LPARAM, second: LPARAM) -> c_int {
        // SAFETY: `user` is the `Talk` given to `open`, which outlives the handle (see `Archive`), and
        // nothing else touches it during a call into the decoder.
        let talk = unsafe { &mut *(user as *mut Talk<'_>) };
        match message {
            UCM_PROCESSDATA => {
                // SAFETY: the decoder hands a block of `second` bytes at `first`, for this call.
                let bytes =
                    unsafe { std::slice::from_raw_parts(first as *const u8, second as usize) };
                let Some(sink) = talk.sink.as_mut() else {
                    return 1;
                };
                // Past the file's size is a hidden stream it tests along with it. Those aren't kept.
                let keep = bytes
                    .len()
                    .min(usize::try_from(sink.left).unwrap_or(usize::MAX));
                match sink.write(&bytes[..keep]) {
                    Ok(()) => 1,
                    Err(failure) => {
                        talk.failed = Some(failure);
                        -1
                    }
                }
            }
            UCM_CHANGEVOLUMEW if second == RAR_VOL_ASK => {
                talk.failed = Some(Failure::Volume);
                -1
            }
            UCM_NEEDPASSWORDW => {
                talk.failed = Some(Failure::Password);
                -1
            }
            // Anything else, such as a dictionary too large to accept without asking, gets no yes.
            _ => 0,
        }
    }

    struct Archive(*const Handle);

    impl Drop for Archive {
        fn drop(&mut self) {
            // SAFETY: the handle came from `RAROpenArchiveEx`, and this is the one place it is closed.
            unsafe { RARCloseArchive(self.0) };
        }
    }

    fn wide(text: &OsStr) -> Vec<u16> {
        text.encode_wide().chain(std::iter::once(0)).collect()
    }

    /// `talk` must outlive what this returns: declared first, it does.
    fn open(path: &Path, mode: u32, talk: *mut Talk<'_>) -> Result<Archive, Failure> {
        let name = wide(path.as_os_str());
        let mut data = OpenData {
            archive_name: ptr::null(),
            archive_name_w: name.as_ptr(),
            open_mode: mode,
            open_result: 0,
            comment_buffer: ptr::null_mut(),
            comment_buffer_size: 0,
            comment_size: 0,
            comment_state: 0,
            flags: 0,
            callback: Some(answer),
            user_data: talk as LPARAM,
            op_flags: 0,
            comment_buffer_w: ptr::null_mut(),
            reserved: [0; 25],
        };
        // SAFETY: `data` and `name` last through the call, the name ends in a zero, and `data` is laid
        // out as the decoder reads it, whatever the declaration's type says.
        let handle = unsafe { RAROpenArchiveEx((&raw mut data).cast::<OpenArchiveDataEx>()) };
        if handle.is_null() {
            return Err(match data.open_result as c_int {
                ERAR_MISSING_PASSWORD | ERAR_BAD_PASSWORD => Failure::Password,
                _ => Failure::Damaged,
            });
        }
        Ok(Archive(handle))
    }

    fn failure(code: c_int, talk: &mut Talk<'_>) -> Failure {
        talk.failed.take().unwrap_or(match code {
            ERAR_MISSING_PASSWORD | ERAR_BAD_PASSWORD => Failure::Password,
            ERAR_EOPEN => Failure::Volume,
            _ => Failure::Damaged,
        })
    }

    /// The next file's header. None at the end.
    fn next(archive: &Archive, talk: *mut Talk<'_>) -> Result<Option<Box<Header>>, Failure> {
        // SAFETY: every field is a number or a raw pointer, for which all zeros is a value: no pointers
        // set is what the decoder asks of one that wants nothing but the header.
        let mut header: Box<Header> = Box::new(unsafe { mem::zeroed() });
        // SAFETY: the handle is open, and `header` is laid out as the decoder fills it in.
        let code = unsafe { RARReadHeaderEx(archive.0, (&raw mut *header).cast::<HeaderDataEx>()) };
        match code {
            ERAR_SUCCESS => Ok(Some(header)),
            ERAR_END_ARCHIVE => Ok(None),
            // SAFETY: the callback is not running: the call above has returned.
            code => Err(failure(code, unsafe { &mut *talk })),
        }
    }

    fn name_in(header: &Header) -> Result<String, Failure> {
        // A copy, since a packed field can't be borrowed.
        let name = header.filename_w;
        let end = name
            .iter()
            .position(|unit| *unit == 0)
            .ok_or(Failure::Damaged)?;
        Ok(String::from_utf16_lossy(&name[..end]))
    }

    fn size_in(header: &Header) -> u64 {
        u64::from(header.unp_size_high) << 32 | u64::from(header.unp_size)
    }

    pub(super) fn list(path: &Path) -> Result<Vec<Listed>, Failure> {
        let mut talk = Talk::default();
        let talk_at: *mut Talk<'_> = &mut talk;
        let archive = open(path, RAR_OM_LIST, talk_at)?;
        let mut listed = Vec::new();
        while let Some(header) = next(&archive, talk_at)? {
            listed.push(Listed {
                name: name_in(&header)?,
                directory: header.flags & RHDF_DIRECTORY != 0,
                // A link, a junction, or a copy of a file elsewhere in the archive.
                link: header.redir_type != 0,
                encrypted: header.flags & RHDF_ENCRYPTED != 0,
                size: size_in(&header),
            });
            // SAFETY: the handle is open, and no destination is given.
            let code = unsafe { RARProcessFileW(archive.0, RAR_SKIP, ptr::null(), ptr::null()) };
            if code != ERAR_SUCCESS {
                // SAFETY: as in `next`.
                return Err(failure(code, unsafe { &mut *talk_at }));
            }
        }
        Ok(listed)
    }

    pub(super) fn unpack(path: &Path, writer: &Writer<'_>) -> Result<(), Failure> {
        let mut talk = Talk::default();
        let talk_at: *mut Talk<'_> = &mut talk;
        let archive = open(path, RAR_OM_EXTRACT, talk_at)?;
        while let Some(header) = next(&archive, talk_at)? {
            let name = name_in(&header)?;
            let directory = header.flags & RHDF_DIRECTORY != 0;
            let sink = if directory {
                writer.directory(&name)?;
                None
            } else {
                writer.file(&name, size_in(&header))?
            };
            // SAFETY: the callback is not running: nothing has been called yet.
            unsafe { (*talk_at).sink = sink };
            // Tested and never extracted: this is what keeps the decoder from creating anything. Files
            // are tested even when there is nowhere to put them, as a solid archive's depend on those
            // before them.
            // SAFETY: the handle is open, no destination is given, and `talk` is alive for the callback.
            let code = unsafe { RARProcessFileW(archive.0, RAR_TEST, ptr::null(), ptr::null()) };
            // SAFETY: the call has returned, so the callback is not running.
            let talking = unsafe { &mut *talk_at };
            if code != ERAR_SUCCESS {
                return Err(failure(code, talking));
            }
            if let Some(sink) = talking.sink.take() {
                sink.finish()?;
            }
        }
        Ok(())
    }
}

#[cfg(not(windows))]
mod rar {
    use std::path::Path;

    use super::{Failure, Listed, Writer};

    pub(super) fn list(_path: &Path) -> Result<Vec<Listed>, Failure> {
        Err(Failure::Damaged)
    }

    pub(super) fn unpack(_path: &Path, _writer: &Writer<'_>) -> Result<(), Failure> {
        Err(Failure::Damaged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sevenz_rust2::{ArchiveEntry, ArchiveWriter};
    use std::io::Cursor;
    use zip::write::SimpleFileOptions;

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-extract-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    /// Opens an archive into `out` beside it, and hands back what it said.
    fn open(archive: &Path) -> Result<PathBuf, Failure> {
        let plan = plan(archive)?;
        let out = archive.parent().unwrap().join("out");
        fs::create_dir_all(&out).unwrap();
        let (stop, done) = (AtomicBool::new(false), AtomicU64::new(0));
        unpack(
            &plan,
            &out,
            &Progress {
                stop: &stop,
                done: &done,
            },
        )?;
        assert_eq!(done.load(Ordering::Relaxed), plan.total);
        Ok(out)
    }

    fn zip_of(path: &Path, files: &[(&str, &[u8])]) {
        let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
        let stored =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for (name, bytes) in files {
            zip.start_file(*name, stored).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }

    fn seven_zip_bytes(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = ArchiveWriter::new(Cursor::new(Vec::new())).unwrap();
        for (name, bytes) in files {
            writer
                .push_archive_entry(ArchiveEntry::new_file(name), Some(*bytes))
                .unwrap();
        }
        writer.finish().unwrap().into_inner()
    }

    // RAR has no writer in Rust, and an archive a test needs can have a bad path, so these are put
    // together by hand: stored and in the RAR 5 format, from its published description.

    fn number(mut value: u64, into: &mut Vec<u8>) {
        while value >= 0x80 {
            into.push((value & 0x7F) as u8 | 0x80);
            value >>= 7;
        }
        into.push(value as u8);
    }

    fn crc(bytes: &[u8]) -> u32 {
        let mut crc = !0u32;
        for byte in bytes {
            crc ^= u32::from(*byte);
            for _ in 0..8 {
                crc = if crc & 1 == 1 {
                    (crc >> 1) ^ 0xEDB8_8320
                } else {
                    crc >> 1
                };
            }
        }
        !crc
    }

    fn block(header: &[u8], into: &mut Vec<u8>) {
        let mut sized = Vec::new();
        number(header.len() as u64, &mut sized);
        sized.extend_from_slice(header);
        into.extend_from_slice(&crc(&sized).to_le_bytes());
        into.extend_from_slice(&sized);
    }

    struct RarFile<'a> {
        name: &'a str,
        bytes: &'a [u8],
        /// What the header says it comes to, which may be more than this part holds.
        size: u64,
        /// The file's own flags beyond "has a checksum": 1 is a directory.
        flags: u64,
        /// 8: it began in the part before. 16: it goes on in the next.
        split: u64,
        /// The header's extra area: a link, or encryption.
        extra: Vec<u8>,
    }

    fn rar_file<'a>(name: &'a str, bytes: &'a [u8]) -> RarFile<'a> {
        RarFile {
            name,
            bytes,
            size: bytes.len() as u64,
            flags: 0,
            split: 0,
            extra: Vec::new(),
        }
    }

    /// `volume`: this part's number when there are several, and whether another follows.
    fn rar_bytes(files: &[RarFile<'_>], volume: Option<(u64, bool)>, checksum: u32) -> Vec<u8> {
        let mut out = b"Rar!\x1a\x07\x01\x00".to_vec();
        let mut main = Vec::new();
        number(1, &mut main);
        number(0, &mut main);
        match volume {
            Some((part, _)) if part > 0 => {
                number(3, &mut main);
                number(part, &mut main);
            }
            Some(_) => number(1, &mut main),
            None => number(0, &mut main),
        }
        block(&main, &mut out);
        for file in files {
            let mut header = Vec::new();
            number(2, &mut header);
            let has_extra = u64::from(!file.extra.is_empty());
            number(2 | has_extra | file.split, &mut header);
            if has_extra == 1 {
                number(file.extra.len() as u64, &mut header);
            }
            number(file.bytes.len() as u64, &mut header);
            number(4 | file.flags, &mut header);
            number(file.size, &mut header);
            number(0x20, &mut header);
            let sum = if checksum != 0 {
                checksum
            } else {
                crc(file.bytes)
            };
            header.extend_from_slice(&sum.to_le_bytes());
            number(0, &mut header);
            number(0, &mut header);
            number(file.name.len() as u64, &mut header);
            header.extend_from_slice(file.name.as_bytes());
            header.extend_from_slice(&file.extra);
            block(&header, &mut out);
            out.extend_from_slice(file.bytes);
        }
        let mut end = Vec::new();
        number(5, &mut end);
        number(0, &mut end);
        number(u64::from(volume.is_some_and(|(_, more)| more)), &mut end);
        block(&end, &mut out);
        out
    }

    fn extra_record(kind: u64, body: &[u8]) -> Vec<u8> {
        let mut inner = Vec::new();
        number(kind, &mut inner);
        inner.extend_from_slice(body);
        let mut record = Vec::new();
        number(inner.len() as u64, &mut record);
        record.extend_from_slice(&inner);
        record
    }

    #[test]
    fn a_zip_comes_out_with_its_folders() {
        let dir = folder("zip");
        let archive = dir.join("game.zip");
        zip_of(
            &archive,
            &[("readme.txt", b"hello"), ("bin/game.exe", b"not a game")],
        );
        let out = open(&archive).unwrap();
        assert_eq!(fs::read(out.join("readme.txt")).unwrap(), b"hello");
        assert_eq!(
            fs::read(out.join("bin").join("game.exe")).unwrap(),
            b"not a game"
        );
    }

    #[test]
    fn a_compressed_zip_comes_out_whole() {
        let dir = folder("deflated");
        let archive = dir.join("game.zip");
        let mut zip = zip::ZipWriter::new(File::create(&archive).unwrap());
        zip.start_file(
            "a.txt",
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
        zip.write_all(&[7; 100_000]).unwrap();
        zip.finish().unwrap();
        let out = open(&archive).unwrap();
        assert_eq!(fs::read(out.join("a.txt")).unwrap(), vec![7; 100_000]);
    }

    #[test]
    fn one_folder_around_everything_isnt_kept() {
        let dir = folder("top");
        let archive = dir.join("game.zip");
        zip_of(
            &archive,
            &[("Game v1/a.txt", b"a"), ("Game v1/data/b.txt", b"b")],
        );
        let out = open(&archive).unwrap();
        assert!(out.join("a.txt").is_file());
        assert!(out.join("data").join("b.txt").is_file());
        assert!(!out.join("Game v1").exists());
    }

    #[test]
    fn a_file_beside_a_folder_keeps_them_both_where_they_are() {
        let dir = folder("beside");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("readme.txt", b"a"), ("Game/b.txt", b"b")]);
        let out = open(&archive).unwrap();
        assert!(out.join("readme.txt").is_file());
        assert!(out.join("Game").join("b.txt").is_file());
    }

    #[test]
    fn a_path_that_leaves_the_folder_refuses_the_whole_archive() {
        for name in [
            "../outside.txt",
            "..\\outside.txt",
            "a/../../outside.txt",
            "/outside.txt",
            "\\outside.txt",
            "C:\\outside.txt",
            "C:outside.txt",
            "\\\\server\\share\\outside.txt",
            "a.txt:hidden",
            "a/.. /outside.txt",
            "a/.../outside.txt",
        ] {
            let dir = folder("leaves");
            let archive = dir.join("game.zip");
            zip_of(&archive, &[("fine.txt", b"fine"), (name, b"out")]);
            assert_eq!(plan(&archive).unwrap_err(), Failure::Unsafe, "{name}");
        }
    }

    #[test]
    fn writing_checks_a_path_again_by_itself() {
        let dir = folder("again");
        let (stop, done) = (AtomicBool::new(false), AtomicU64::new(0));
        let writer = Writer {
            into: &dir,
            strip_top: false,
            mark: String::new(),
            progress: &Progress {
                stop: &stop,
                done: &done,
            },
        };
        assert_eq!(
            writer.file("../outside.txt", 1).err(),
            Some(Failure::Unsafe)
        );
        assert_eq!(writer.directory("../outside").err(), Some(Failure::Unsafe));
        assert!(!dir.parent().unwrap().join("outside.txt").exists());
    }

    #[test]
    fn names_windows_would_treat_as_something_else_are_made_safe() {
        let dir = folder("names");
        let archive = dir.join("game.zip");
        zip_of(
            &archive,
            &[
                ("CON.txt", b"a"),
                ("trailing. ", b"b"),
                ("sp?ce.txt", b"c"),
                (".config/.hidden", b"d"),
            ],
        );
        let out = open(&archive).unwrap();
        assert!(out.join("_CON.txt").is_file());
        assert!(out.join("trailing").is_file());
        assert!(out.join("spce.txt").is_file());
        assert!(out.join(".config").join(".hidden").is_file());
    }

    #[test]
    fn a_link_in_a_zip_refuses_it() {
        let dir = folder("ziplink");
        let archive = dir.join("game.zip");
        let mut zip = zip::ZipWriter::new(File::create(&archive).unwrap());
        zip.add_symlink("elsewhere", "../..", SimpleFileOptions::default())
            .unwrap();
        zip.finish().unwrap();
        assert_eq!(plan(&archive).unwrap_err(), Failure::Unsafe);
    }

    #[test]
    fn a_zip_with_a_password_isnt_opened() {
        let dir = folder("zipcrypt");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("a.txt", b"hello")]);
        let mut bytes = fs::read(&archive).unwrap();
        // Bit 0 of the flags, in the file's own header and in the list at the end.
        bytes[6] |= 1;
        let central = bytes
            .windows(4)
            .position(|each| each == b"PK\x01\x02")
            .unwrap();
        bytes[central + 8] |= 1;
        fs::write(&archive, bytes).unwrap();
        assert_eq!(plan(&archive).unwrap_err(), Failure::Password);
    }

    #[test]
    fn a_zip_that_doesnt_match_its_checksum_is_damaged() {
        let dir = folder("zipcrc");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("a.txt", b"hello hello hello")]);
        let mut bytes = fs::read(&archive).unwrap();
        let at = bytes.windows(5).position(|each| each == b"hello").unwrap();
        bytes[at] = b'j';
        fs::write(&archive, bytes).unwrap();
        assert_eq!(open(&archive).unwrap_err(), Failure::Damaged);
    }

    #[test]
    fn a_file_named_like_an_archive_that_isnt_one_is_left_alone() {
        let dir = folder("fake");
        let fake = dir.join("game.zip");
        fs::write(&fake, b"<html>a web page</html>").unwrap();
        let data = dir.join("data.pak");
        zip_of(&data, &[("a", b"a")]);
        assert!(archives_in(&[fake, data]).is_empty());
    }

    #[test]
    fn archives_in_parts_count_once_by_the_first() {
        let dir = folder("parts");
        let mut files = Vec::new();
        for name in ["game.part1.rar", "game.part2.rar", "game.part10.rar"] {
            let path = dir.join(name);
            fs::write(&path, rar_bytes(&[rar_file("a", b"a")], None, 0)).unwrap();
            files.push(path);
        }
        for name in ["other.7z.001", "other.7z.002"] {
            let path = dir.join(name);
            fs::write(&path, seven_zip_bytes(&[("a", b"a")])).unwrap();
            files.push(path);
        }
        let setup = dir.join("setup.exe");
        fs::write(&setup, b"MZ").unwrap();
        files.push(setup);
        assert_eq!(
            archives_in(&files),
            vec![dir.join("game.part1.rar"), dir.join("other.7z.001")]
        );
    }

    #[test]
    fn a_folder_is_named_for_the_archive_and_not_its_part() {
        assert_eq!(stem_of(Path::new("a/Game v1.2.zip")), "Game v1.2");
        assert_eq!(stem_of(Path::new("a/Game.part01.rar")), "Game");
        assert_eq!(stem_of(Path::new("a/Game.part.one.rar")), "Game.part.one");
        assert_eq!(stem_of(Path::new("a/Game.7z.001")), "Game");
        assert_eq!(stem_of(Path::new("a/.zip")), "extracted");
    }

    #[test]
    fn what_could_be_started_keeps_the_archives_mark_and_the_rest_doesnt() {
        let dir = folder("mark");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("game.exe", b"a"), ("game.dll", b"b")]);
        fs::write(
            format!("{}:Zone.Identifier", archive.display()),
            "[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://example.invalid/\r\n",
        )
        .unwrap();
        let out = open(&archive).unwrap();
        let read = |name: &str| {
            fs::read_to_string(format!("{}:Zone.Identifier", out.join(name).display()))
        };
        assert!(
            read("game.exe")
                .unwrap()
                .contains("HostUrl=https://example.invalid/")
        );
        assert!(read("game.dll").is_err());
    }

    #[test]
    fn with_no_mark_on_the_archive_it_still_came_from_the_internet() {
        let dir = folder("nomark");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("game.exe", b"a")]);
        let out = open(&archive).unwrap();
        let mark = fs::read_to_string(format!(
            "{}:Zone.Identifier",
            out.join("game.exe").display()
        ));
        assert!(mark.unwrap().contains("ZoneId=3"));
    }

    #[test]
    fn stopping_stops_where_it_is() {
        let dir = folder("stop");
        let archive = dir.join("game.zip");
        zip_of(&archive, &[("a.txt", b"hello")]);
        let plan = plan(&archive).unwrap();
        let (stop, done) = (AtomicBool::new(true), AtomicU64::new(0));
        let got = unpack(
            &plan,
            &dir,
            &Progress {
                stop: &stop,
                done: &done,
            },
        );
        assert_eq!(got, Err(Failure::Stopped));
        assert_eq!(done.load(Ordering::Relaxed), 0);
    }

    #[test]
    fn a_seven_zip_comes_out_with_its_folders() {
        let dir = folder("7z");
        let archive = dir.join("game.7z");
        fs::write(
            &archive,
            seven_zip_bytes(&[
                ("readme.txt", b"hello"),
                ("bin/game.exe", b"not a game"),
                ("empty.txt", b""),
            ]),
        )
        .unwrap();
        let out = open(&archive).unwrap();
        assert_eq!(fs::read(out.join("readme.txt")).unwrap(), b"hello");
        assert_eq!(
            fs::read(out.join("bin").join("game.exe")).unwrap(),
            b"not a game"
        );
        assert_eq!(fs::read(out.join("empty.txt")).unwrap(), b"");
    }

    #[test]
    fn a_seven_zip_in_parts_comes_out_whole() {
        let dir = folder("7zparts");
        let bytes = seven_zip_bytes(&[("a.txt", &[9; 50_000]), ("b.txt", b"second")]);
        let (first, second) = bytes.split_at(bytes.len() / 2);
        fs::write(dir.join("game.7z.001"), first).unwrap();
        fs::write(dir.join("game.7z.002"), second).unwrap();
        let out = open(&dir.join("game.7z.001")).unwrap();
        assert_eq!(fs::read(out.join("a.txt")).unwrap(), vec![9; 50_000]);
        assert_eq!(fs::read(out.join("b.txt")).unwrap(), b"second");
    }

    #[test]
    fn a_seven_zip_missing_its_last_part_is_damaged() {
        let dir = folder("7zshort");
        let bytes = seven_zip_bytes(&[("a.txt", &[9; 50_000])]);
        fs::write(dir.join("game.7z.001"), &bytes[..bytes.len() / 2]).unwrap();
        assert_eq!(
            plan(&dir.join("game.7z.001")).unwrap_err(),
            Failure::Damaged
        );
    }

    #[test]
    fn a_path_that_leaves_the_folder_refuses_a_seven_zip_too() {
        let dir = folder("7zleaves");
        let archive = dir.join("game.7z");
        fs::write(
            &archive,
            seven_zip_bytes(&[("fine.txt", b"a"), ("../outside.txt", b"b")]),
        )
        .unwrap();
        assert_eq!(plan(&archive).unwrap_err(), Failure::Unsafe);
    }

    #[test]
    fn a_seven_zip_with_a_password_isnt_opened() {
        use sevenz_rust2::encoder_options::AesEncoderOptions;
        use sevenz_rust2::{EncoderConfiguration, EncoderMethod};

        let dir = folder("7zcrypt");
        let archive = dir.join("game.7z");
        let mut writer = ArchiveWriter::new(Cursor::new(Vec::new())).unwrap();
        writer.set_content_methods(vec![
            AesEncoderOptions::new(Password::from("made-up")).into(),
            EncoderConfiguration::new(EncoderMethod::LZMA2),
        ]);
        writer
            .push_archive_entry(ArchiveEntry::new_file("a.txt"), Some(&b"hello"[..]))
            .unwrap();
        fs::write(&archive, writer.finish().unwrap().into_inner()).unwrap();
        assert_eq!(open(&archive).unwrap_err(), Failure::Password);
    }

    #[test]
    fn a_rar_comes_out_with_its_folders_and_nothing_else_writes() {
        let dir = folder("rar");
        let archive = dir.join("game.rar");
        fs::write(
            &archive,
            rar_bytes(
                &[
                    rar_file("readme.txt", b"hello"),
                    rar_file("bin/game.exe", b"not a game"),
                    rar_file("empty.txt", b""),
                    RarFile {
                        flags: 1,
                        ..rar_file("saves", b"")
                    },
                ],
                None,
                0,
            ),
        )
        .unwrap();
        let out = open(&archive).unwrap();
        assert_eq!(fs::read(out.join("readme.txt")).unwrap(), b"hello");
        assert_eq!(
            fs::read(out.join("bin").join("game.exe")).unwrap(),
            b"not a game"
        );
        assert_eq!(fs::read(out.join("empty.txt")).unwrap(), b"");
        assert!(out.join("saves").is_dir());
        let beside: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|each| each.unwrap().file_name())
            .collect();
        assert_eq!(beside.len(), 2, "{beside:?}");
    }

    #[test]
    fn a_rar_keeps_the_mark_on_what_could_be_started() {
        let dir = folder("rarmark");
        let archive = dir.join("game.rar");
        fs::write(&archive, rar_bytes(&[rar_file("game.exe", b"a")], None, 0)).unwrap();
        let out = open(&archive).unwrap();
        let mark = fs::read_to_string(format!(
            "{}:Zone.Identifier",
            out.join("game.exe").display()
        ));
        assert!(mark.unwrap().contains("ZoneId=3"));
    }

    #[test]
    fn a_path_that_leaves_the_folder_refuses_a_rar_too() {
        for name in ["../outside.txt", "a/../../outside.txt", "/outside.txt"] {
            let dir = folder("rarleaves");
            let archive = dir.join("game.rar");
            fs::write(
                &archive,
                rar_bytes(&[rar_file("fine.txt", b"a"), rar_file(name, b"b")], None, 0),
            )
            .unwrap();
            assert_eq!(plan(&archive).map(|_| ()), Err(Failure::Unsafe), "{name}");
        }
    }

    /// The format has no use for these characters, and the decoder changes them before Shelf hears of it.
    #[test]
    fn what_the_decoder_changes_in_a_rars_name_stays_in_the_folder() {
        for name in ["..\\outside.txt", "C:\\outside.txt", "a.txt:hidden"] {
            let dir = folder("rarnames");
            let archive = dir.join("game.rar");
            fs::write(
                &archive,
                rar_bytes(&[rar_file("fine.txt", b"a"), rar_file(name, b"b")], None, 0),
            )
            .unwrap();
            let out = open(&archive).unwrap();
            assert_eq!(fs::read_dir(&out).unwrap().count(), 2, "{name}");
            // The archive, and `out`.
            assert_eq!(fs::read_dir(&dir).unwrap().count(), 2, "{name}");
        }
    }

    #[test]
    fn a_link_in_a_rar_refuses_it() {
        let dir = folder("rarlink");
        let archive = dir.join("game.rar");
        // A record of kind 5: a Windows symbolic link, no flags, and where it points.
        let mut body = Vec::new();
        number(2, &mut body);
        number(0, &mut body);
        number(5, &mut body);
        body.extend_from_slice(b"..\\..");
        let extra = extra_record(5, &body);
        fs::write(
            &archive,
            rar_bytes(
                &[RarFile {
                    extra,
                    ..rar_file("elsewhere", b"")
                }],
                None,
                0,
            ),
        )
        .unwrap();
        assert_eq!(plan(&archive).unwrap_err(), Failure::Unsafe);
    }

    #[test]
    fn a_rar_with_a_password_isnt_opened() {
        let dir = folder("rarcrypt");
        let archive = dir.join("game.rar");
        // A record of kind 1: its version, no flags, a strength of 15, a salt and a starting block.
        let mut body = Vec::new();
        number(0, &mut body);
        number(0, &mut body);
        body.push(15);
        body.extend_from_slice(&[1; 32]);
        let extra = extra_record(1, &body);
        fs::write(
            &archive,
            rar_bytes(
                &[RarFile {
                    extra,
                    ..rar_file("a.txt", &[2; 16])
                }],
                None,
                0,
            ),
        )
        .unwrap();
        assert_eq!(open(&archive).unwrap_err(), Failure::Password);
    }

    #[test]
    fn a_rar_in_parts_comes_out_whole() {
        let dir = folder("rarparts");
        let whole = b"first part, second part";
        let (first, second) = whole.split_at(12);
        fs::write(
            dir.join("game.part1.rar"),
            rar_bytes(
                &[RarFile {
                    size: whole.len() as u64,
                    split: 16,
                    ..rar_file("a.txt", first)
                }],
                Some((0, true)),
                crc(first),
            ),
        )
        .unwrap();
        fs::write(
            dir.join("game.part2.rar"),
            rar_bytes(
                &[RarFile {
                    size: whole.len() as u64,
                    split: 8,
                    ..rar_file("a.txt", second)
                }],
                Some((1, false)),
                crc(whole),
            ),
        )
        .unwrap();
        let out = open(&dir.join("game.part1.rar")).unwrap();
        assert_eq!(fs::read(out.join("a.txt")).unwrap(), whole);
    }

    #[test]
    fn a_rar_missing_a_part_says_so() {
        let dir = folder("rarmissing");
        let whole = b"first part, second part";
        let (first, _) = whole.split_at(12);
        fs::write(
            dir.join("game.part1.rar"),
            rar_bytes(
                &[RarFile {
                    size: whole.len() as u64,
                    split: 16,
                    ..rar_file("a.txt", first)
                }],
                Some((0, true)),
                crc(first),
            ),
        )
        .unwrap();
        assert_eq!(
            plan(&dir.join("game.part1.rar")).unwrap_err(),
            Failure::Volume
        );
    }

    #[test]
    fn a_rar_that_doesnt_match_its_checksum_is_damaged() {
        let dir = folder("rarcrc");
        let archive = dir.join("game.rar");
        fs::write(
            &archive,
            rar_bytes(&[rar_file("a.txt", b"hello")], None, 0xDEAD_BEEF),
        )
        .unwrap();
        assert_eq!(open(&archive).unwrap_err(), Failure::Damaged);
    }

    #[test]
    fn a_rar_stops_when_asked() {
        let dir = folder("rarstop");
        let archive = dir.join("game.rar");
        fs::write(&archive, rar_bytes(&[rar_file("a.txt", b"hello")], None, 0)).unwrap();
        let plan = plan(&archive).unwrap();
        let (stop, done) = (AtomicBool::new(true), AtomicU64::new(0));
        let got = unpack(
            &plan,
            &dir,
            &Progress {
                stop: &stop,
                done: &done,
            },
        );
        assert_eq!(got, Err(Failure::Stopped));
    }
}
