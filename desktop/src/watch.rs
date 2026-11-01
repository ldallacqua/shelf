//! Looks at what is in front, every few seconds, for as long as the app runs (ADR 005, section 12),
//! and tells `tracker.rs`. Only the program in front is ever looked at: nothing is listed, and
//! no controller listened to, while no game is in front. Nothing touches a game's process.

use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};

use crate::launchers::Launchers;
use crate::processes::{self, Identity};
use crate::running::{self, Games, Rules};
use crate::shortcut::{self, Pointed};
use crate::steam;
use crate::tracker::{Game, Look, Tracker};

const LOOK_EVERY: Duration = Duration::from_secs(5);
/// Steam's files are read again at most this often, and only for a program in Steam's folders.
const READ_STEAM_EVERY: Duration = Duration::from_secs(60);

/// What this computer knows to be games, as `running::key` writes paths.
#[derive(Default)]
pub struct Known {
    /// Each file chosen, or what its shortcut points at, and its entry.
    pub files: HashMap<String, String>,
    /// Each folder Steam installed an app in, and the app.
    pub steam: Vec<(String, String)>,
}

/// The game a program in front is, if it is one, by the evidence `running.rs` asks for: the file
/// chosen for a game, what Play started, or the folder Steam installed an app in. A chosen file
/// wins over Steam, as it does for Play.
pub fn game_of(
    known: &Known,
    games: &Games,
    rules: &Rules,
    identity: Identity,
    image: &str,
) -> Option<Game> {
    if !rules.could_be_game(image) {
        return None;
    }
    if let Some(entry) = known.files.get(image) {
        return Some(Game::Entry(entry.clone()));
    }
    if let Some(entry) = games.entry_of(identity, image) {
        return Some(Game::Entry(entry));
    }
    if image.contains("\\_commonredist\\") {
        return None;
    }
    known
        .steam
        .iter()
        .find(|(folder, _)| running::inside(image, folder))
        .map(|(_, app)| Game::Steam(app.clone()))
}

fn files_of(chosen: &[(String, PathBuf)]) -> HashMap<String, String> {
    chosen
        .iter()
        .filter_map(|(entry, path)| match shortcut::pointed_at(path) {
            Pointed::Program(program) => Some((running::key(&program), entry.clone())),
            // A shortcut to Steam is counted as the app it opens.
            _ => None,
        })
        .collect()
}

fn steam_folders() -> Vec<(String, String)> {
    let Some(folder) = steam::folder() else {
        return Vec::new();
    };
    steam::all_installed(&folder)
        .into_iter()
        .filter_map(|app| {
            steam::install_folder(&folder, &app).map(|path| (running::key(&path), app))
        })
        .collect()
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as u64)
}

/// Starts looking. It ends with the app.
pub fn start(app: AppHandle) {
    crate::pads::start();
    std::thread::spawn(move || {
        let started = Instant::now();
        let rules = Rules::here(steam::folder().as_deref());
        let mut known = Known::default();
        let mut chosen = Vec::new();
        let mut steam_read: Option<Instant> = None;
        let mut listening = false;
        loop {
            let latest = app.state::<Launchers>().all();
            if latest != chosen {
                known.files = files_of(&latest);
                chosen = latest;
            }
            let front = processes::front().and_then(|(identity, image)| {
                let image = running::key(&image);
                // Read only for a program in Steam's folders: nothing else ever costs a look.
                if image.contains("\\steamapps\\common\\")
                    && steam_read.is_none_or(|read| read.elapsed() >= READ_STEAM_EVERY)
                {
                    known.steam = steam_folders();
                    steam_read = Some(Instant::now());
                }
                let games = app.state::<Games>();
                game_of(&known, &games, &rules, identity, &image).map(|game| (game, identity))
            });
            if front.is_some() != listening {
                listening = front.is_some();
                crate::pads::listen(listening);
            }
            if listening {
                crate::pads::look_at_xinput();
            }
            app.state::<Tracker>().look(
                &Look {
                    at: now(),
                    clock: started.elapsed().as_millis() as u64,
                    front,
                    input_age: crate::pads::input_age(),
                },
                || uuid::Uuid::new_v4().to_string(),
                processes::alive,
            );
            std::thread::sleep(LOOK_EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> Rules {
        Rules {
            windows: Some("c:\\windows".into()),
            steam: Some("c:\\steam".into()),
            shared: vec!["c:\\program files".into()],
        }
    }

    fn known() -> Known {
        Known {
            files: HashMap::from([("d:\\games\\foo\\foo.exe".to_string(), "entry-1".to_string())]),
            steam: vec![(
                "c:\\steam\\steamapps\\common\\a game".to_string(),
                "620".to_string(),
            )],
        }
    }

    const ID: Identity = Identity {
        pid: 10,
        started: 5,
    };

    fn game(image: &str) -> Option<Game> {
        game_of(&known(), &Games::default(), &rules(), ID, image)
    }

    #[test]
    fn a_file_chosen_is_its_entry() {
        assert_eq!(
            game("d:\\games\\foo\\foo.exe"),
            Some(Game::Entry("entry-1".into()))
        );
    }

    #[test]
    fn what_runs_from_steam_s_folder_for_an_app_is_that_app() {
        assert_eq!(
            game("c:\\steam\\steamapps\\common\\a game\\bin\\a.exe"),
            Some(Game::Steam("620".into()))
        );
    }

    #[test]
    fn nothing_else_is_a_game() {
        for image in [
            "c:\\program files\\browser\\browser.exe",
            "c:\\steam\\steam.exe",
            "c:\\steam\\bin\\steamwebhelper.exe",
            "c:\\windows\\explorer.exe",
            "c:\\steam\\steamapps\\common\\a game 2\\a.exe",
        ] {
            assert_eq!(game(image), None, "{image}");
        }
    }

    #[test]
    fn a_launcher_and_steam_s_installers_are_not_the_game() {
        assert_eq!(
            game("c:\\steam\\steamapps\\common\\a game\\launcher.exe"),
            None
        );
        assert_eq!(
            game("c:\\steam\\steamapps\\common\\a game\\_commonredist\\vc.exe"),
            None
        );
    }

    #[test]
    fn a_chosen_file_wins_over_steam() {
        let mut known = known();
        known.files.insert(
            "c:\\steam\\steamapps\\common\\a game\\a.exe".into(),
            "entry-2".into(),
        );
        assert_eq!(
            game_of(
                &known,
                &Games::default(),
                &rules(),
                ID,
                "c:\\steam\\steamapps\\common\\a game\\a.exe"
            ),
            Some(Game::Entry("entry-2".into()))
        );
    }
}
