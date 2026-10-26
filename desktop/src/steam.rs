//! Which Steam apps are installed on this computer (ADR 005, section 5), read
//! from Steam's own files: its folder from the registry, its libraries from
//! `steamapps/libraryfolders.vdf`, and each app's `appmanifest_{id}.acf` in
//! the library holding it. Read only; Steam is never asked anything.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Valve's KeyValues text, as Steam writes these files: quoted keys, each
/// followed by a quoted value or a block in braces.
#[derive(Debug, PartialEq)]
enum Value {
    Text(String),
    Block(BTreeMap<String, Value>),
}

fn tokens(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' | '}' => found.push(c.to_string()),
            '"' => {
                let mut word = String::new();
                while let Some(c) = chars.next() {
                    match c {
                        '"' => break,
                        // Steam escapes the backslashes in a path.
                        '\\' => {
                            if let Some(next) = chars.next() {
                                word.push(next)
                            }
                        }
                        _ => word.push(c),
                    }
                }
                // A quoted word is never a brace: mark it so a key named "{" stays a word.
                found.push(format!("\"{word}"));
            }
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    found
}

fn block(tokens: &mut std::vec::IntoIter<String>) -> BTreeMap<String, Value> {
    let mut entries = BTreeMap::new();
    while let Some(token) = tokens.next() {
        if token == "}" {
            break;
        }
        let Some(key) = token.strip_prefix('"') else {
            continue;
        };
        match tokens.next() {
            Some(next) if next == "{" => {
                entries.insert(key.to_lowercase(), Value::Block(block(tokens)));
            }
            Some(next) => {
                if let Some(text) = next.strip_prefix('"') {
                    entries.insert(key.to_lowercase(), Value::Text(text.to_string()));
                }
            }
            None => break,
        }
    }
    entries
}

fn parse(text: &str) -> BTreeMap<String, Value> {
    block(&mut tokens(text).into_iter())
}

/// The libraries Steam keeps games in, its own folder's first.
pub fn libraries(steam: &Path) -> Vec<PathBuf> {
    let mut found = vec![steam.to_path_buf()];
    let Ok(text) = fs::read_to_string(steam.join("steamapps").join("libraryfolders.vdf")) else {
        return found;
    };
    if let Some(Value::Block(folders)) = parse(&text).get("libraryfolders") {
        for folder in folders.values() {
            if let Value::Block(fields) = folder
                && let Some(Value::Text(path)) = fields.get("path")
            {
                let path = PathBuf::from(path);
                if !found.contains(&path) {
                    found.push(path);
                }
            }
        }
    }
    found
}

/// Whether an app's manifest says it is fully installed: Steam's state flag 4.
fn installed_in(library: &Path, app: &str) -> bool {
    let manifest = library
        .join("steamapps")
        .join(format!("appmanifest_{app}.acf"));
    let Ok(text) = fs::read_to_string(manifest) else {
        return false;
    };
    let Some(Value::Block(state)) = parse(&text).remove("appstate") else {
        return false;
    };
    matches!(
        state.get("stateflags"),
        Some(Value::Text(flags)) if flags.parse::<u32>().is_ok_and(|flags| flags & 4 != 0)
    )
}

/// Of `apps`, the ones installed in any of Steam's libraries, in their order.
pub fn installed(steam: &Path, apps: &[String]) -> Vec<String> {
    let libraries = libraries(steam);
    apps.iter()
        .filter(|app| crate::ids::steam_app(app))
        .filter(|app| libraries.iter().any(|library| installed_in(library, app)))
        .cloned()
        .collect()
}

/// Every app installed in any of Steam's libraries, each once: what Ready to
/// play reads (spec 7.7). An app is named by its manifest's file,
/// `appmanifest_{id}.acf`, and counted once Steam's state flag says it is
/// fully installed.
pub fn all_installed(steam: &Path) -> Vec<String> {
    let mut found = BTreeSet::new();
    for library in libraries(steam) {
        let Ok(files) = fs::read_dir(library.join("steamapps")) else {
            continue;
        };
        for file in files.flatten() {
            let name = file.file_name();
            let Some(app) = name
                .to_str()
                .and_then(|name| name.strip_prefix("appmanifest_"))
                .and_then(|name| name.strip_suffix(".acf"))
            else {
                continue;
            };
            if crate::ids::steam_app(app) && installed_in(&library, app) {
                found.insert(app.to_string());
            }
        }
    }
    found.into_iter().collect()
}

/// Steam's folder, as Steam records it for this Windows account.
#[cfg(windows)]
pub fn folder() -> Option<PathBuf> {
    let key = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .ok()?;
    let path: String = key.get_value("SteamPath").ok()?;
    let path = PathBuf::from(path);
    path.is_dir().then_some(path)
}

#[cfg(not(windows))]
pub fn folder() -> Option<PathBuf> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Steam's files under a folder of their own, as Steam lays them out.
    struct Steam {
        root: PathBuf,
    }

    impl Steam {
        fn new(name: &str) -> Self {
            let root =
                std::env::temp_dir().join(format!("shelf-steam-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join("steam").join("steamapps")).unwrap();
            fs::create_dir_all(root.join("games").join("steamapps")).unwrap();
            Steam { root }
        }

        fn steam(&self) -> PathBuf {
            self.root.join("steam")
        }

        /// `libraryfolders.vdf` from the fixture, its paths pointed at this folder.
        fn folders(&self) {
            let fixture = include_str!("../tests/fixtures/steam/libraryfolders.vdf");
            let escaped = |path: PathBuf| path.display().to_string().replace('\\', "\\\\");
            let text = fixture
                .replace("{steam}", &escaped(self.steam()))
                .replace("{games}", &escaped(self.root.join("games")));
            fs::write(
                self.steam().join("steamapps").join("libraryfolders.vdf"),
                text,
            )
            .unwrap();
        }

        fn manifest(&self, library: &str, app: &str, fixture: &str) {
            fs::write(
                self.root
                    .join(library)
                    .join("steamapps")
                    .join(format!("appmanifest_{app}.acf")),
                fixture,
            )
            .unwrap();
        }
    }

    impl Drop for Steam {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    const INSTALLED: &str = include_str!("../tests/fixtures/steam/appmanifest_installed.acf");
    const DOWNLOADING: &str = include_str!("../tests/fixtures/steam/appmanifest_downloading.acf");

    #[test]
    fn reads_every_library_steam_lists() {
        let steam = Steam::new("libraries");
        steam.folders();
        assert_eq!(
            libraries(&steam.steam()),
            vec![steam.steam(), steam.root.join("games")]
        );
    }

    #[test]
    fn finds_an_app_in_any_library_once_it_is_fully_installed() {
        let steam = Steam::new("installed");
        steam.folders();
        steam.manifest("steam", "219990", INSTALLED);
        steam.manifest("games", "292030", INSTALLED);
        steam.manifest("games", "1145350", DOWNLOADING);
        let asked = ["1145350", "292030", "219990", "72850"].map(String::from);
        assert_eq!(installed(&steam.steam(), &asked), vec!["292030", "219990"]);
    }

    #[test]
    fn lists_every_app_installed_in_every_library_once() {
        let steam = Steam::new("all");
        steam.folders();
        steam.manifest("steam", "219990", INSTALLED);
        steam.manifest("games", "292030", INSTALLED);
        steam.manifest("games", "1145350", DOWNLOADING);
        // Not an app's manifest, whatever its name says.
        steam.manifest("games", "x1", INSTALLED);
        assert_eq!(all_installed(&steam.steam()), vec!["219990", "292030"]);
    }

    #[test]
    fn without_steam_s_list_of_libraries_looks_in_its_own_folder() {
        let steam = Steam::new("alone");
        steam.manifest("steam", "219990", INSTALLED);
        assert_eq!(
            installed(&steam.steam(), &["219990".into()]),
            vec!["219990"]
        );
    }

    #[test]
    fn never_reads_a_file_for_what_is_not_an_app_id() {
        let steam = Steam::new("ids");
        steam.manifest("steam", "219990", INSTALLED);
        assert!(installed(&steam.steam(), &["../219990".into(), "219990.acf".into()]).is_empty());
    }

    #[test]
    fn reads_keys_whatever_their_case_and_paths_with_backslashes() {
        let parsed =
            parse("\"AppState\" { \"StateFlags\" \"4\" \"path\" \"C:\\\\Games\\\\Steam\" }");
        let Some(Value::Block(state)) = parsed.get("appstate") else {
            panic!()
        };
        assert_eq!(state.get("stateflags"), Some(&Value::Text("4".into())));
        assert_eq!(
            state.get("path"),
            Some(&Value::Text("C:\\Games\\Steam".into()))
        );
    }
}
