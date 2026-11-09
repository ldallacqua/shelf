//! Where a game's saves are on this computer (ADR 008, section 3): the manifest's placeholders turned
//! into this PC's folders, its globs looked for, and every folder too wide to be one game's saves
//! refused. A path in a snapshot is written the other way, from a placeholder, so it means the same
//! folder on another PC.

use std::fs;
use std::path::{Component, Path, PathBuf};

/// The most paths one location may match, and how deep a folder is followed: a pattern gone wrong
/// stops here rather than walking a disk.
const MOST_MATCHES: usize = 10_000;
const DEEPEST: usize = 32;

/// This computer's folders, as Windows names them. Every one may be missing: what needs a missing
/// folder finds nothing.
#[derive(Clone, Debug, Default)]
pub struct Folders {
    pub home: Option<PathBuf>,
    pub app_data: Option<PathBuf>,
    pub local_app_data: Option<PathBuf>,
    pub local_low: Option<PathBuf>,
    pub documents: Option<PathBuf>,
    pub public: Option<PathBuf>,
    pub program_data: Option<PathBuf>,
    pub saved_games: Option<PathBuf>,
    pub desktop: Option<PathBuf>,
    pub downloads: Option<PathBuf>,
    pub windows: Option<PathBuf>,
    pub program_files: Vec<PathBuf>,
    /// This PC's user, for `<osUserName>`: looked with, never written into a snapshot.
    pub user_name: Option<String>,
    /// The app's own folder, and Steam's, which are never a game's saves.
    pub app: Option<PathBuf>,
    pub steam: Option<PathBuf>,
}

/// Which game, on this computer: its folder (`<base>`) and the names the manifest gives it.
#[derive(Clone, Debug, Default)]
pub struct GameAt {
    pub base: Option<PathBuf>,
    /// `<game>`: the folder's name, or else the first of the manifest's `installDir`s.
    pub name: Option<String>,
    /// For `<storeGameId>`: the game's Steam app, when one is known.
    pub steam: Option<String>,
}

/// The folders a snapshot's path may start from. Each is written `<name>` in a path.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Token {
    Base,
    Root,
    Home,
    AppData,
    LocalAppData,
    LocalLow,
    Documents,
    Public,
    ProgramData,
}

const TOKENS: [(Token, &str); 9] = [
    (Token::Base, "base"),
    (Token::Root, "root"),
    (Token::Home, "home"),
    (Token::AppData, "winAppData"),
    (Token::LocalAppData, "winLocalAppData"),
    (Token::LocalLow, "winLocalAppDataLow"),
    (Token::Documents, "winDocuments"),
    (Token::Public, "winPublic"),
    (Token::ProgramData, "winProgramData"),
];

impl Token {
    pub fn name(self) -> &'static str {
        TOKENS
            .iter()
            .find(|(token, _)| *token == self)
            .map_or("", |(_, name)| name)
    }

    fn named(name: &str) -> Option<Token> {
        TOKENS
            .iter()
            .find(|(_, each)| *each == name)
            .map(|(token, _)| *token)
    }

    /// This token's folder on this computer.
    pub fn folder(self, folders: &Folders, game: &GameAt) -> Option<PathBuf> {
        match self {
            Token::Base => game.base.clone(),
            Token::Root => game.base.as_deref()?.parent().map(Path::to_path_buf),
            Token::Home => folders.home.clone(),
            Token::AppData => folders.app_data.clone(),
            Token::LocalAppData => folders.local_app_data.clone(),
            Token::LocalLow => folders.local_low.clone(),
            Token::Documents => folders.documents.clone(),
            Token::Public => folders.public.clone(),
            Token::ProgramData => folders.program_data.clone(),
        }
    }
}

/// A pattern after `<game>`, `<storeUserId>`, `<storeGameId>` and `<osUserName>` are filled in: the
/// folder it starts from, and what follows, a part per folder, some of them globs.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Pattern {
    pub token: Token,
    pub parts: Vec<String>,
    /// A folder the person picked: its name is its name, and `[` or `*` in it are not globs.
    pub literal: bool,
}

/// Reads a manifest path, or one Shelf wrote, as a pattern for this computer and game. None for a
/// path that starts anywhere else (Linux's, Mac's, Windows' own folder), that has a `..`, or that needs
/// something this game doesn't have.
pub fn pattern(text: &str, game: &GameAt, folders: &Folders, literal: bool) -> Option<Pattern> {
    let text = text.replace('\\', "/");
    let rest = text.strip_prefix('<')?;
    let (name, rest) = rest.split_once('>')?;
    let token = Token::named(name)?;
    let mut parts = Vec::new();
    for part in rest.split('/').filter(|part| !part.is_empty()) {
        let part = if literal {
            part.to_string()
        } else {
            fill(part, game, folders)?
        };
        if part == "." || part == ".." || part.contains(':') || part.contains('<') {
            return None;
        }
        parts.push(part);
    }
    Some(Pattern {
        token,
        parts,
        literal,
    })
}

/// The placeholders that may stand inside a part of a path.
fn fill(part: &str, game: &GameAt, folders: &Folders) -> Option<String> {
    let mut part = part.to_string();
    if part.contains("<game>") {
        part = part.replace("<game>", game.name.as_deref()?);
    }
    // Any one folder: which one is the store's or the game's own affair.
    part = part.replace("<storeUserId>", "*");
    part = part.replace("<storeGameId>", game.steam.as_deref().unwrap_or("*"));
    if part.contains("<osUserName>") {
        part = part.replace("<osUserName>", folders.user_name.as_deref()?);
    }
    Some(part)
}

impl Pattern {
    /// The pattern as Shelf writes it: `<winAppData>/A Game/*.sav`.
    pub fn text(&self) -> String {
        let mut text = format!("<{}>", self.token.name());
        for part in &self.parts {
            text.push('/');
            text.push_str(part);
        }
        text
    }

    /// Where it is on this computer, globs and all, to show.
    pub fn shown(&self, folders: &Folders, game: &GameAt) -> Option<PathBuf> {
        let mut path = self.token.folder(folders, game)?;
        for part in &self.parts {
            path.push(part);
        }
        Some(path)
    }

    fn is_glob(&self, part: &str) -> bool {
        !self.literal && part.contains(['*', '?', '['])
    }

    /// Every file and folder it matches on this computer, at most `MOST_MATCHES`.
    pub fn matches(&self, folders: &Folders, game: &GameAt) -> Vec<PathBuf> {
        let Some(start) = self.token.folder(folders, game) else {
            return Vec::new();
        };
        let mut found = Vec::new();
        self.descend(&start, 0, &mut found);
        found
    }

    fn descend(&self, at: &Path, part: usize, found: &mut Vec<PathBuf>) {
        if found.len() >= MOST_MATCHES || part > DEEPEST + self.parts.len() {
            return;
        }
        let Some(name) = self.parts.get(part) else {
            if !reparse_point(at) && at.exists() {
                found.push(at.to_path_buf());
            }
            return;
        };
        if name == "**" {
            // None or any number of folders.
            self.descend(at, part + 1, found);
            for child in children(at).into_iter().filter(|child| child.is_dir()) {
                if part < DEEPEST {
                    self.descend(&child, part, found);
                }
            }
            return;
        }
        if !self.is_glob(name) {
            let next = at.join(name);
            if next.exists() {
                self.descend(&next, part + 1, found);
            }
            return;
        }
        for child in children(at) {
            let matched = child
                .file_name()
                .is_some_and(|each| glob(name, &each.to_string_lossy()));
            if matched {
                self.descend(&child, part + 1, found);
            }
        }
    }

    /// Whether a path written from a placeholder (`<winAppData>/A Game/slot1.sav`) is this pattern's:
    /// what it matches, or inside a folder it matches.
    pub fn holds(&self, path: &str) -> bool {
        let Some(rest) = path
            .strip_prefix('<')
            .and_then(|rest| rest.strip_prefix(self.token.name()))
            .and_then(|rest| rest.strip_prefix('>'))
        else {
            return false;
        };
        let parts: Vec<&str> = rest.split('/').filter(|part| !part.is_empty()).collect();
        self.holds_from(&parts, 0)
    }

    fn holds_from(&self, parts: &[&str], from: usize) -> bool {
        let Some(name) = self.parts.get(from) else {
            // The pattern is used up: what is left is inside what it matched.
            return true;
        };
        if name == "**" {
            return (0..=parts.len()).any(|skip| self.holds_from(&parts[skip..], from + 1));
        }
        let Some((first, rest)) = parts.split_first() else {
            return false;
        };
        let same = if self.is_glob(name) {
            glob(name, first)
        } else {
            name.eq_ignore_ascii_case(first) || name.to_lowercase() == first.to_lowercase()
        };
        same && self.holds_from(rest, from + 1)
    }
}

fn children(folder: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(folder) else {
        return Vec::new();
    };
    entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| !reparse_point(path))
        .collect()
}

/// A link or a junction: never followed, as it may lead anywhere, the game's own folder included.
pub fn reparse_point(path: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(path) else {
        return false;
    };
    if meta.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
        meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

/// A glob over one name, as Windows compares names: without case. `*` is any run, `?` any one
/// character, and `[…]` one of those listed, with ranges.
pub fn glob(pattern: &str, name: &str) -> bool {
    let pattern: Vec<char> = pattern.to_lowercase().chars().collect();
    let name: Vec<char> = name.to_lowercase().chars().collect();
    glob_from(&pattern, &name)
}

fn glob_from(pattern: &[char], name: &[char]) -> bool {
    let Some((&first, rest)) = pattern.split_first() else {
        return name.is_empty();
    };
    match first {
        '*' => (0..=name.len()).any(|skip| glob_from(rest, &name[skip..])),
        '?' => !name.is_empty() && glob_from(rest, &name[1..]),
        '[' => {
            let Some(close) = rest.iter().position(|&c| c == ']') else {
                return name.first() == Some(&'[') && glob_from(rest, &name[1..]);
            };
            let (class, after) = (&rest[..close], &rest[close + 1..]);
            let Some(&c) = name.first() else {
                return false;
            };
            in_class(class, c) && glob_from(after, &name[1..])
        }
        literal => name.first() == Some(&literal) && glob_from(rest, &name[1..]),
    }
}

fn in_class(class: &[char], c: char) -> bool {
    let mut at = 0;
    while at < class.len() {
        if at + 2 < class.len() && class[at + 1] == '-' {
            if class[at] <= c && c <= class[at + 2] {
                return true;
            }
            at += 3;
        } else {
            if class[at] == c {
                return true;
            }
            at += 1;
        }
    }
    false
}

/// A path as compared here: in lower case, with Windows' separators, and no ending one.
pub fn key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let text = text.strip_prefix("\\\\?\\").unwrap_or(&text);
    text.trim_end_matches('\\').to_string()
}

pub fn inside_or_same(path: &str, folder: &str) -> bool {
    path == folder
        || path
            .strip_prefix(folder)
            .is_some_and(|rest| rest.starts_with('\\'))
}

fn top_of_a_disk(path: &Path) -> bool {
    path.components()
        .filter(|part| !matches!(part, Component::Prefix(_) | Component::RootDir))
        .count()
        == 0
}

/// Whether a folder holds more than one game's saves, so a restore that makes it what a snapshot
/// holds could take anything else away (ADR 008, section 3): a disk's top, one of Windows' own
/// folders or one above them, the game's own folder or one above it, a store's library, the app's.
pub fn too_wide(folder: &Path, folders: &Folders, game: &GameAt) -> bool {
    if top_of_a_disk(folder) {
        return true;
    }
    let path = key(folder);
    let mut wide: Vec<PathBuf> = [
        &folders.home,
        &folders.app_data,
        &folders.local_app_data,
        &folders.local_low,
        &folders.documents,
        &folders.public,
        &folders.program_data,
        &folders.saved_games,
        &folders.desktop,
        &folders.downloads,
        &folders.windows,
        &folders.app,
    ]
    .into_iter()
    .flatten()
    .cloned()
    .collect();
    wide.extend(folders.program_files.iter().cloned());
    if let Some(steam) = &folders.steam {
        wide.push(steam.join("steamapps").join("common"));
    }
    if let Some(base) = &game.base {
        wide.push(base.clone());
    }
    // Above any of those: it would hold them.
    if wide.iter().any(|each| inside_or_same(&key(each), &path)) {
        return true;
    }
    // Inside Windows, Program Files or the app's own folder: never a game's saves to write.
    [&folders.windows, &folders.app]
        .into_iter()
        .flatten()
        .chain(folders.program_files.iter())
        .any(|each| inside_or_same(&path, &key(each)))
        && !game
            .base
            .as_ref()
            .is_some_and(|base| inside_or_same(&path, &key(base)))
}

/// Whether a folder is the game's own, or one above it: its saves are somewhere inside, never all of it.
pub fn holds_the_game(folder: &Path, game: &GameAt) -> bool {
    game.base
        .as_ref()
        .is_some_and(|base| inside_or_same(&key(base), &key(folder)))
}

/// A folder the person picked, written from the most fitting placeholder: the game's own folder,
/// then the closest of this PC's folders. None for one outside all of them, which would mean nothing
/// on another PC.
pub fn written(folder: &Path, folders: &Folders, game: &GameAt) -> Option<Pattern> {
    let path = key(folder);
    let mut best: Option<(Token, PathBuf)> = None;
    for (token, _) in TOKENS {
        if token == Token::Root {
            continue;
        }
        let Some(at) = token.folder(folders, game) else {
            continue;
        };
        let at_key = key(&at);
        if !inside_or_same(&path, &at_key) {
            continue;
        }
        let closer = best
            .as_ref()
            .is_none_or(|(_, before)| at_key.len() > key(before).len());
        if closer {
            best = Some((token, at));
        }
    }
    let (token, at) = best?;
    // The same folder may be written in another case: the parts past its length are what is inside.
    let rest: PathBuf = folder.components().skip(at.components().count()).collect();
    let parts = rest
        .components()
        .filter_map(|part| match part {
            Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    Some(Pattern {
        token,
        parts,
        literal: true,
    })
}

/// A file found on this computer, written from its pattern's placeholder: `<winAppData>/A Game/slot1.sav`.
pub fn written_file(
    file: &Path,
    pattern: &Pattern,
    folders: &Folders,
    game: &GameAt,
) -> Option<String> {
    let start = pattern.token.folder(folders, game)?;
    let rest = file.strip_prefix(&start).ok()?;
    let mut text = format!("<{}>", pattern.token.name());
    for part in rest.components() {
        match part {
            Component::Normal(name) => {
                text.push('/');
                text.push_str(&name.to_string_lossy());
            }
            _ => return None,
        }
    }
    Some(text)
}

/// Where a path written from a placeholder is on this computer, if it is a plain one: a known
/// placeholder, then names, never `..`, a drive, a `:` (another stream of a file) or a separator of
/// Windows' own.
pub fn here(path: &str, folders: &Folders, game: &GameAt) -> Option<PathBuf> {
    let rest = path.strip_prefix('<')?;
    let (name, rest) = rest.split_once('>')?;
    let mut at = Token::named(name)?.folder(folders, game)?;
    let mut any = false;
    for part in rest.split('/') {
        if part.is_empty() {
            continue;
        }
        let bad = part == "."
            || part == ".."
            || part.contains([':', '\\', '<', '>', '"', '|', '?', '*'])
            || part.chars().any(char::is_control)
            || part.ends_with(['.', ' ']);
        if bad {
            return None;
        }
        at.push(part);
        any = true;
    }
    any.then_some(at)
}

/// This computer's folders, as Windows names them: a Documents folder moved into OneDrive is found
/// where it is.
#[cfg(windows)]
pub fn this_computer(app: Option<PathBuf>, steam: Option<PathBuf>) -> Folders {
    use windows_sys::Win32::UI::Shell::{
        FOLDERID_Desktop, FOLDERID_Documents, FOLDERID_Downloads, FOLDERID_LocalAppData,
        FOLDERID_LocalAppDataLow, FOLDERID_Profile, FOLDERID_ProgramData, FOLDERID_ProgramFiles,
        FOLDERID_ProgramFilesX86, FOLDERID_Public, FOLDERID_RoamingAppData, FOLDERID_SavedGames,
        FOLDERID_Windows,
    };
    let mut program_files = Vec::new();
    program_files.extend(known(&FOLDERID_ProgramFiles));
    program_files.extend(known(&FOLDERID_ProgramFilesX86));
    let home = known(&FOLDERID_Profile);
    Folders {
        user_name: std::env::var("USERNAME")
            .ok()
            .filter(|name| !name.is_empty()),
        app_data: known(&FOLDERID_RoamingAppData),
        local_app_data: known(&FOLDERID_LocalAppData),
        local_low: known(&FOLDERID_LocalAppDataLow),
        documents: known(&FOLDERID_Documents),
        public: known(&FOLDERID_Public),
        program_data: known(&FOLDERID_ProgramData),
        saved_games: known(&FOLDERID_SavedGames),
        desktop: known(&FOLDERID_Desktop),
        downloads: known(&FOLDERID_Downloads),
        windows: known(&FOLDERID_Windows),
        program_files,
        home,
        app,
        steam,
    }
}

#[cfg(windows)]
fn known(id: &windows_sys::core::GUID) -> Option<PathBuf> {
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::System::Com::CoTaskMemFree;
    use windows_sys::Win32::UI::Shell::{KF_FLAG_DONT_VERIFY, SHGetKnownFolderPath};

    let mut text: windows_sys::core::PWSTR = std::ptr::null_mut();
    // SAFETY: Windows writes a string it allocated into `text`, which is freed below whatever it said.
    let result = unsafe {
        SHGetKnownFolderPath(
            id,
            KF_FLAG_DONT_VERIFY as u32,
            std::ptr::null_mut(),
            &mut text,
        )
    };
    let path = if result >= 0 && !text.is_null() {
        // SAFETY: on success `text` is a string Windows ended with a zero.
        let len = (0..)
            .take_while(|&at| unsafe { *text.add(at) } != 0)
            .count();
        let wide = unsafe { std::slice::from_raw_parts(text, len) };
        Some(PathBuf::from(std::ffi::OsString::from_wide(wide)))
    } else {
        None
    };
    // SAFETY: freed once, as Windows asks, even when it failed.
    unsafe { CoTaskMemFree(text as *const _) };
    path.filter(|path| !path.as_os_str().is_empty())
}

#[cfg(not(windows))]
pub fn this_computer(app: Option<PathBuf>, steam: Option<PathBuf>) -> Folders {
    Folders {
        home: std::env::var_os("HOME").map(PathBuf::from),
        app,
        steam,
        ..Folders::default()
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-saves-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    /// A made-up computer inside `root`, with a made-up game installed in `Games\A Game`.
    pub fn computer(root: &Path) -> (Folders, GameAt) {
        let home = root.join("Users").join("Someone");
        let folders = Folders {
            app_data: Some(home.join("AppData").join("Roaming")),
            local_app_data: Some(home.join("AppData").join("Local")),
            local_low: Some(home.join("AppData").join("LocalLow")),
            documents: Some(home.join("Documents")),
            saved_games: Some(home.join("Saved Games")),
            public: Some(root.join("Users").join("Public")),
            program_data: Some(root.join("ProgramData")),
            windows: Some(root.join("Windows")),
            program_files: vec![root.join("Program Files")],
            app: Some(home.join("AppData").join("Roaming").join("shelf")),
            steam: Some(root.join("Steam")),
            user_name: Some("Someone".into()),
            home: Some(home),
            ..Folders::default()
        };
        let game = GameAt {
            base: Some(root.join("Games").join("A Game")),
            name: Some("A Game".into()),
            steam: None,
        };
        (folders, game)
    }

    pub fn put(path: &Path, text: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    #[test]
    fn globs_compare_names_as_windows_does() {
        assert!(glob("*.sav", "Slot1.SAV"));
        assert!(glob("slot?.sav", "slot2.sav"));
        assert!(!glob("slot?.sav", "slot10.sav"));
        assert!(glob("profile[0,1,3].ojs", "profile3.ojs"));
        assert!(!glob("profile[0,1,3].ojs", "profile2.ojs"));
        assert!(glob("save[0-9]", "save7"));
        assert!(glob("*", ""));
        assert!(!glob("a*b", "ac"));
    }

    #[test]
    fn a_manifest_path_is_read_for_this_game() {
        let (folders, mut game) = computer(Path::new("C:\\x"));
        game.steam = Some("620".into());
        let read = pattern(
            "<winAppData>/<game>/<storeUserId>/<storeGameId>/*.sav",
            &game,
            &folders,
            false,
        )
        .unwrap();
        assert_eq!(read.token, Token::AppData);
        assert_eq!(read.parts, ["A Game", "*", "620", "*.sav"]);
        assert_eq!(read.text(), "<winAppData>/A Game/*/620/*.sav");
    }

    #[test]
    fn paths_for_other_systems_or_that_climb_out_are_not_read() {
        let (folders, game) = computer(Path::new("C:\\x"));
        for text in [
            "<xdgConfig>/a game",
            "<winDir>/a.ini",
            "<home>/../elsewhere",
            "/etc/passwd",
            "C:/Windows/a.ini",
            "<base>/a:stream",
        ] {
            assert_eq!(pattern(text, &game, &folders, false), None, "{text}");
        }
    }

    #[test]
    fn a_pattern_finds_files_and_folders_and_never_follows_a_link() {
        let root = folder("matches");
        let (folders, game) = computer(&root);
        let saves = folders.app_data.as_ref().unwrap().join("A Game");
        put(&saves.join("slot1.sav"), "one");
        put(&saves.join("slot2.SAV"), "two");
        put(&saves.join("settings.ini"), "config");
        put(&saves.join("deep").join("x").join("auto.sav"), "auto");
        let read = pattern("<winAppData>/A Game/*.sav", &game, &folders, false).unwrap();
        let mut found = read.matches(&folders, &game);
        found.sort();
        assert_eq!(found, [saves.join("slot1.sav"), saves.join("slot2.SAV")]);
        let deep = pattern("<winAppData>/A Game/**/*.sav", &game, &folders, false).unwrap();
        assert_eq!(deep.matches(&folders, &game).len(), 3);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_pattern_holds_what_it_matches_and_what_is_inside() {
        let (folders, game) = computer(Path::new("C:\\x"));
        let files = pattern("<winAppData>/A Game/*.sav", &game, &folders, false).unwrap();
        assert!(files.holds("<winAppData>/a game/Slot1.sav"));
        assert!(!files.holds("<winAppData>/A Game/settings.ini"));
        assert!(!files.holds("<winLocalAppData>/A Game/slot1.sav"));
        let folder = pattern("<winDocuments>/My Games/A Game", &game, &folders, false).unwrap();
        assert!(folder.holds("<winDocuments>/My Games/A Game/Saves/1/slot.sav"));
        assert!(!folder.holds("<winDocuments>/My Games/Another Game/slot.sav"));
        let deep = pattern("<base>/**/*.sav", &game, &folders, false).unwrap();
        assert!(deep.holds("<base>/a/b/c.sav"));
        assert!(deep.holds("<base>/c.sav"));
        let literal = Pattern {
            token: Token::Base,
            parts: vec!["Save [1]".into()],
            literal: true,
        };
        assert!(literal.holds("<base>/Save [1]/a"));
        assert!(!literal.holds("<base>/Save 1/a"));
    }

    #[test]
    fn folders_that_hold_more_than_a_game_are_too_wide() {
        let root = Path::new("C:\\x");
        let (folders, game) = computer(root);
        let home = folders.home.clone().unwrap();
        for wide in [
            PathBuf::from("C:\\"),
            PathBuf::from("D:\\"),
            home.clone(),
            home.join("AppData"),
            home.join("AppData").join("Roaming"),
            home.join("Documents"),
            root.join("Users"),
            root.join("Games").join("A Game"),
            root.join("Games"),
            root.join("Windows").join("System32"),
            root.join("Program Files").join("Something"),
            root.join("Steam").join("steamapps").join("common"),
            home.join("AppData")
                .join("Roaming")
                .join("shelf")
                .join("saves"),
        ] {
            assert!(too_wide(&wide, &folders, &game), "{}", wide.display());
        }
        for narrow in [
            home.join("AppData").join("Roaming").join("A Game"),
            home.join("Documents").join("My Games").join("A Game"),
            root.join("Games").join("A Game").join("saves"),
            home.join("Saved Games").join("A Game"),
        ] {
            assert!(!too_wide(&narrow, &folders, &game), "{}", narrow.display());
        }
    }

    #[test]
    fn a_game_installed_in_program_files_may_keep_its_saves_there() {
        let root = Path::new("C:\\x");
        let (folders, mut game) = computer(root);
        game.base = Some(root.join("Program Files").join("A Game"));
        assert!(!too_wide(
            &root.join("Program Files").join("A Game").join("saves"),
            &folders,
            &game
        ));
        assert!(too_wide(
            &root.join("Program Files").join("Other"),
            &folders,
            &game
        ));
    }

    #[test]
    fn a_folder_picked_is_written_from_the_closest_placeholder() {
        let root = Path::new("C:\\x");
        let (folders, game) = computer(root);
        let home = folders.home.clone().unwrap();
        let low = home
            .join("AppData")
            .join("LocalLow")
            .join("Maker")
            .join("A Game");
        let picked = written(&low, &folders, &game).unwrap();
        assert_eq!(picked.text(), "<winLocalAppDataLow>/Maker/A Game");
        let in_game = written(
            &root.join("Games").join("A Game").join("Save [1]"),
            &folders,
            &game,
        )
        .unwrap();
        assert_eq!(in_game.text(), "<base>/Save [1]");
        assert!(in_game.literal);
        let saved = written(&home.join("Saved Games").join("A Game"), &folders, &game).unwrap();
        assert_eq!(saved.text(), "<home>/Saved Games/A Game");
        assert_eq!(written(Path::new("E:\\Elsewhere"), &folders, &game), None);
    }

    #[test]
    fn a_path_from_a_snapshot_is_put_back_only_if_it_is_plain() {
        let root = Path::new("C:\\x");
        let (folders, game) = computer(root);
        assert_eq!(
            here("<winAppData>/A Game/slot1.sav", &folders, &game),
            Some(
                folders
                    .app_data
                    .clone()
                    .unwrap()
                    .join("A Game")
                    .join("slot1.sav")
            )
        );
        for bad in [
            "<winAppData>/../../Windows/x.dll",
            "<winAppData>/A Game/slot1.sav:hidden",
            "<winAppData>/C:/x",
            "<winAppData>",
            "<winDir>/x.ini",
            "C:/x/y",
            "<winAppData>/A Game/con.",
            "<winAppData>/A\\..\\..\\x",
        ] {
            assert_eq!(here(bad, &folders, &game), None, "{bad}");
        }
    }
}
