//! Whether a game is running, and which processes are it (ADR 005, section 11).
//! This decides from what Windows and Steam say; it asks them nothing, so every
//! rule can be tested without a process.
//!
//! A process is a game's only on evidence that names it: its file is the one
//! chosen, it is inside the folder Steam installed the app in, or it descends
//! from what Shelf started and stands in the game's folder. A process's name
//! alone is never evidence. What cannot be told is said to be so, and has no
//! Stop: a wrong "not running" costs a second press of Play, and a wrong Stop
//! closes something of the person's.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;

use crate::processes::{Identity, Process};

/// How long after Play a game not seen yet is still starting.
pub const START_WINDOW_MS: u64 = 60_000;
/// How long a game asked to close has before Force stop is offered.
pub const STOP_WAIT_MS: u64 = 20_000;

/// A file's name that says it starts other things rather than being a game, and a store's own.
const LAUNCHERS: [&str; 9] = [
    "launcher",
    "battle.net",
    "upc",
    "ubisoftconnect",
    "galaxyclient",
    "eadesktop",
    "origin",
    "riotclientservices",
    "steam",
];

/// A path as Windows compares them: whatever its case and slashes.
pub fn key(path: &Path) -> String {
    let text = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let text = text.strip_prefix("\\\\?\\").unwrap_or(&text);
    text.trim_end_matches('\\').to_string()
}

pub fn inside(file: &str, folder: &str) -> bool {
    file.strip_prefix(folder)
        .is_some_and(|rest| rest.starts_with('\\'))
}

fn folder_of(file: &str) -> Option<&str> {
    file.rfind('\\').map(|at| &file[..at])
}

/// Whether a file's name says it only starts things, whatever folder it is in.
fn starts_others(file: &str) -> bool {
    let name = file.rsplit('\\').next().unwrap_or(file);
    let stem = name.strip_suffix(".exe").unwrap_or(name);
    stem.contains("launcher") || LAUNCHERS.contains(&stem)
}

/// What is never a game, whatever else is said of it.
#[derive(Clone, Debug, Default)]
pub struct Rules {
    /// Windows' folder: a script's `cmd.exe`, a crash's reporter.
    pub windows: Option<String>,
    /// Steam's own folder. Its `steamapps` holds games; the rest is Steam.
    pub steam: Option<String>,
    /// Folders many programs share, so being in one says nothing of which.
    pub shared: Vec<String>,
}

impl Rules {
    /// As this computer has them.
    pub fn here(steam: Option<&Path>) -> Self {
        let from = |name: &str| std::env::var_os(name).map(|value| key(Path::new(&value)));
        let home = from("USERPROFILE");
        let mut shared: Vec<String> = [
            "WINDIR",
            "ProgramFiles",
            "ProgramFiles(x86)",
            "ProgramData",
            "APPDATA",
            "LOCALAPPDATA",
        ]
        .iter()
        .filter_map(|name| from(name))
        .collect();
        if let Some(home) = home {
            for folder in ["desktop", "documents", "downloads"] {
                shared.push(format!("{home}\\{folder}"));
            }
            shared.push(home);
        }
        Rules {
            windows: from("WINDIR"),
            steam: steam.map(key),
            shared,
        }
    }

    fn is_program(&self, file: &str) -> bool {
        let in_windows = self
            .windows
            .as_deref()
            .is_some_and(|folder| inside(file, folder));
        let in_steam = self.steam.as_deref().is_some_and(|folder| {
            inside(file, folder) && !inside(file, &format!("{folder}\\steamapps"))
        });
        !in_windows && !in_steam
    }

    /// A process's file could be a game's: not Windows', not Steam's, not one that starts others.
    pub fn could_be_game(&self, file: &str) -> bool {
        self.is_program(file) && !starts_others(file)
    }

    /// A folder that is one program's, so being in it says something: not a disk's top, not
    /// a folder many share, not Steam's list of games.
    fn specific<'a>(&self, folder: &'a str) -> Option<&'a str> {
        let top = !folder.contains('\\');
        let shared = self.shared.iter().any(|each| each == folder);
        let steam = folder.ends_with("\\steamapps") || folder.ends_with("\\steamapps\\common");
        (!top && !shared && !steam).then_some(folder)
    }
}

/// A Steam app that may be the game.
#[derive(Clone, Debug, Default)]
pub struct SteamGame {
    /// Where Steam installed it, as `key` writes paths.
    pub folder: Option<String>,
    /// Whether Steam says it is running. Steam can be wrong for a while after it crashes.
    pub running: bool,
}

/// What a game is on this computer: its file, and its apps on Steam.
#[derive(Clone, Debug, Default)]
pub struct Target {
    /// The program itself: the file chosen, or what its shortcut points at.
    pub file: Option<String>,
    pub steam: Vec<SteamGame>,
}

/// What Play started, followed until it has all ended.
#[derive(Clone, Debug)]
pub struct Launch {
    /// What Windows said it started. Nothing for what Windows gave no process for.
    pub root: Option<Identity>,
    /// When, as `Identity::started` counts.
    pub started: u64,
    /// When, in milliseconds since 1970.
    pub at: u64,
    /// The folder of the file chosen, or of what its shortcut points at.
    pub folder: Option<String>,
    /// The folder above that: a launcher in `Game\Launcher` starts `Game\Bin\game.exe`.
    pub above: Option<String>,
    /// Everything seen descending from it, or taking over from it, ended ones too: a child
    /// still names its parent after the parent has gone.
    pub family: Vec<Identity>,
    /// The game has been seen: gone again, it has closed, and is not still starting.
    pub arrived: bool,
}

impl Launch {
    /// `file` is where the game's file is, as `key` writes paths.
    pub fn new(root: Option<Identity>, started: u64, at: u64, file: &str, rules: &Rules) -> Self {
        let folder = folder_of(file).and_then(|folder| rules.specific(folder));
        let above = folder
            .and_then(folder_of)
            .and_then(|folder| rules.specific(folder));
        Launch {
            root,
            started,
            at,
            folder: folder.map(String::from),
            above: above.map(String::from),
            family: root.into_iter().collect(),
            arrived: false,
        }
    }

    fn starting(&self, now: u64) -> bool {
        now.saturating_sub(self.at) < START_WINDOW_MS
    }

    /// Adds what has appeared: a child of the family, or, while the game is still starting, a
    /// new process in the game's own folder, for a launcher that starts it and has left.
    fn follow(&mut self, processes: &[Process], rules: &Rules, now: u64) {
        let mut oldest_first: Vec<&Process> = processes.iter().collect();
        oldest_first.sort_by_key(|process| process.id.started);
        for process in oldest_first {
            // Unread, so nothing can be said of when it started.
            if process.id.started == 0 || self.family.contains(&process.id) {
                continue;
            }
            let child = self
                .family
                .iter()
                .any(|parent| parent.pid == process.parent && parent.started <= process.id.started);
            let took_over = self.starting(now)
                && process.id.started >= self.started
                && self.folder.as_deref().is_some_and(|folder| {
                    process.image.as_deref().is_some_and(|image| {
                        let image = key(image);
                        inside(&image, folder) && rules.could_be_game(&image)
                    })
                });
            if child || took_over {
                self.family.push(process.id);
            }
        }
    }

    fn alive(&self, processes: &[Process]) -> bool {
        processes
            .iter()
            .any(|process| self.family.contains(&process.id))
    }

    /// Whether this process is the game by what started it: of the family, and in its folders.
    fn claims(&self, id: Identity, image: &str) -> bool {
        self.family.contains(&id)
            && [&self.folder, &self.above]
                .into_iter()
                .flatten()
                .any(|folder| inside(image, folder))
    }
}

/// What Windows and Steam show of a game now.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Seen {
    /// The processes that are the game, and the only ones Stop may touch.
    pub confirmed: Vec<Identity>,
    /// A process called as the game's file is, which Windows won't say more of.
    pub unreadable: bool,
    /// What Shelf started is still open, and nothing shows it is the game.
    pub open: bool,
}

pub fn identify(
    target: &Target,
    processes: &[Process],
    launch: Option<&Launch>,
    rules: &Rules,
) -> Seen {
    let file = target.file.as_deref();
    let file_name = file.and_then(|file| file.rsplit('\\').next());
    let mut seen = Seen::default();
    for process in processes {
        let Some(image) = process.image.as_deref() else {
            if file_name.is_some_and(|name| process.name.to_lowercase() == name) {
                seen.unreadable = true;
            }
            continue;
        };
        let image = key(image);
        if !rules.could_be_game(&image) {
            continue;
        }
        let is_file = file == Some(image.as_str());
        let on_steam = target.steam.iter().any(|game| {
            game.folder.as_deref().is_some_and(|folder| {
                // Steam's installers for what a game needs, run from the game's folder.
                inside(&image, folder) && !image.contains("\\_commonredist\\")
            })
        });
        let started = launch.is_some_and(|launch| launch.claims(process.id, &image));
        if is_file || on_steam || started {
            seen.confirmed.push(process.id);
        }
    }
    seen.open = seen.confirmed.is_empty()
        && launch.is_some_and(|launch| {
            launch
                .root
                .is_some_and(|root| processes.iter().any(|process| process.id == root))
        });
    seen
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Stopped,
    Starting,
    Running,
    Stopping,
    /// Something may be running, and Shelf can't tell or can't touch it: no Stop.
    Unverified,
}

/// Why a game is `Unverified`, in a word a page has a sentence for.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Why {
    /// Steam says it is running, and no process shows it.
    Steam,
    /// Windows would not say what is running.
    Denied,
    /// What Shelf started is still open, and nothing shows it is the game: a launcher, a script.
    Open,
}

/// A game's state, as a page shows it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
pub struct GameView {
    pub state: State,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<Why>,
    /// Asked to close, and still there: Force stop is offered.
    pub unresponsive: bool,
}

impl GameView {
    const fn only(state: State) -> Self {
        GameView {
            state,
            why: None,
            unresponsive: false,
        }
    }

    const fn unverified(why: Why) -> Self {
        GameView {
            state: State::Unverified,
            why: Some(why),
            unresponsive: false,
        }
    }
}

/// A Stop asked for.
#[derive(Clone, Copy, Debug)]
struct Stop {
    at: u64,
    /// It has no window to ask, so waiting would say nothing.
    no_window: bool,
}

/// What the app remembers while it runs: what Play started, and what Stop was asked of.
#[derive(Default)]
pub struct Games {
    launches: Mutex<HashMap<String, Launch>>,
    stops: Mutex<HashMap<String, Stop>>,
}

impl Games {
    pub fn launched(&self, entry: &str, launch: Launch) {
        self.stops.lock().unwrap().remove(entry);
        self.launches
            .lock()
            .unwrap()
            .insert(entry.to_string(), launch);
    }

    /// Its file changed or was forgotten: what was followed is no longer this game's.
    pub fn forget(&self, entry: &str) {
        self.launches.lock().unwrap().remove(entry);
        self.stops.lock().unwrap().remove(entry);
    }

    pub fn is_starting(&self, entry: &str, now: u64) -> bool {
        self.launches
            .lock()
            .unwrap()
            .get(entry)
            .is_some_and(|launch| launch.starting(now) && !launch.arrived)
    }

    /// Follows everything Play started, and lets go of what has all ended. Whether anything
    /// is still followed, and whether any of it is still starting.
    pub fn follow(&self, processes: &[Process], rules: &Rules, now: u64) -> (bool, bool) {
        let mut launches = self.launches.lock().unwrap();
        for launch in launches.values_mut() {
            launch.follow(processes, rules, now);
        }
        launches.retain(|_, launch| launch.starting(now) || launch.alive(processes));
        (
            !launches.is_empty(),
            launches.values().any(|launch| launch.starting(now)),
        )
    }

    /// The game a process is by what Play started, if any (`watch.rs`).
    pub fn entry_of(&self, id: Identity, image: &str) -> Option<String> {
        self.launches
            .lock()
            .unwrap()
            .iter()
            .find(|(_, launch)| launch.claims(id, image))
            .map(|(entry, _)| entry.clone())
    }

    /// What is seen of a game now.
    pub fn seen(&self, entry: &str, target: &Target, processes: &[Process], rules: &Rules) -> Seen {
        let launches = self.launches.lock().unwrap();
        identify(target, processes, launches.get(entry), rules)
    }

    pub fn stop_asked(&self, entry: &str, now: u64, no_window: bool) {
        self.stops
            .lock()
            .unwrap()
            .insert(entry.to_string(), Stop { at: now, no_window });
    }

    pub fn stop_failed(&self, entry: &str) {
        self.stops.lock().unwrap().remove(entry);
    }

    /// A game's state now, from what is running, or nothing when Windows would not list it.
    pub fn view(
        &self,
        entry: &str,
        target: &Target,
        processes: Option<&[Process]>,
        rules: &Rules,
        now: u64,
    ) -> GameView {
        let Some(processes) = processes else {
            return GameView::unverified(Why::Denied);
        };
        self.follow(processes, rules, now);
        let seen = self.seen(entry, target, processes, rules);
        let mut stops = self.stops.lock().unwrap();
        if !seen.confirmed.is_empty()
            && let Some(launch) = self.launches.lock().unwrap().get_mut(entry)
        {
            launch.arrived = true;
        }
        if seen.confirmed.is_empty() {
            // Stopped only now that nothing of it is left, which is what was asked; and
            // nothing that appears from here on takes over from what was closed.
            if stops.remove(entry).is_some() {
                self.launches.lock().unwrap().remove(entry);
            }
            if self.is_starting(entry, now) {
                return GameView::only(State::Starting);
            }
            if seen.unreadable {
                return GameView::unverified(Why::Denied);
            }
            if target.steam.iter().any(|game| game.running) {
                return GameView::unverified(Why::Steam);
            }
            if seen.open {
                return GameView::unverified(Why::Open);
            }
            return GameView::only(State::Stopped);
        }
        match stops.get(entry) {
            Some(stop) => GameView {
                state: State::Stopping,
                why: None,
                unresponsive: stop.no_window || now.saturating_sub(stop.at) >= STOP_WAIT_MS,
            },
            None => GameView::only(State::Running),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    const NOW: u64 = 1_800_000_000_000;
    /// A launch's start, as Windows counts: later processes count above it.
    const STARTED: u64 = 1_000;
    const GAME: &str = "d:\\games\\grim dawn\\x64\\grim dawn.exe";
    const STEAM_GAME: &str = "c:\\steam\\steamapps\\common\\a game";

    fn rules() -> Rules {
        Rules {
            windows: Some("c:\\windows".into()),
            steam: Some("c:\\steam".into()),
            shared: vec!["c:\\program files".into(), "c:\\users\\me".into()],
        }
    }

    fn process(pid: u32, parent: u32, started: u64, image: &str) -> Process {
        Process {
            id: Identity { pid, started },
            parent,
            name: image.rsplit('\\').next().unwrap().into(),
            image: Some(PathBuf::from(image)),
        }
    }

    fn unreadable(pid: u32, name: &str) -> Process {
        Process {
            id: Identity { pid, started: 0 },
            parent: 1,
            name: name.into(),
            image: None,
        }
    }

    fn file_target() -> Target {
        Target {
            file: Some(GAME.into()),
            steam: vec![],
        }
    }

    fn steam_target(running: bool) -> Target {
        Target {
            file: None,
            steam: vec![SteamGame {
                folder: Some(STEAM_GAME.into()),
                running,
            }],
        }
    }

    fn confirmed(seen: &Seen) -> Vec<u32> {
        seen.confirmed.iter().map(|id| id.pid).collect()
    }

    fn launch_of(file: &str, root: Option<Identity>) -> Launch {
        Launch::new(root, STARTED, NOW, file, &rules())
    }

    #[test]
    fn a_game_is_its_file_however_it_was_started_and_whatever_its_case() {
        let running = [process(
            10,
            1,
            5,
            "D:\\Games\\Grim Dawn\\x64\\Grim Dawn.exe",
        )];
        let seen = identify(&file_target(), &running, None, &rules());
        assert_eq!(confirmed(&seen), [10]);
    }

    #[test]
    fn a_name_alone_is_never_the_game() {
        let running = [process(10, 1, 5, "c:\\elsewhere\\grim dawn.exe")];
        assert_eq!(
            identify(&file_target(), &running, None, &rules()),
            Seen::default()
        );
    }

    #[test]
    fn every_instance_of_a_game_is_the_game() {
        let running = [process(10, 1, 5, GAME), process(11, 1, 6, GAME)];
        assert_eq!(
            confirmed(&identify(&file_target(), &running, None, &rules())),
            [10, 11]
        );
    }

    #[test]
    fn a_steam_game_is_what_runs_from_where_steam_installed_it() {
        let running = [
            process(10, 1, 5, "C:\\Steam\\steamapps\\common\\A Game\\bin\\a.exe"),
            process(11, 10, 6, "C:\\Steam\\steamapps\\common\\A Game\\crash.exe"),
            process(12, 1, 7, "C:\\Steam\\steamapps\\common\\Another\\a.exe"),
            process(13, 1, 8, "C:\\Steam\\steam.exe"),
            process(14, 13, 9, "C:\\Steam\\bin\\steamwebhelper.exe"),
        ];
        assert_eq!(
            confirmed(&identify(&steam_target(true), &running, None, &rules())),
            [10, 11]
        );
    }

    #[test]
    fn a_folder_that_begins_the_same_is_another_game() {
        let running = [process(
            10,
            1,
            5,
            "C:\\Steam\\steamapps\\common\\A Game 2\\a.exe",
        )];
        assert!(
            identify(&steam_target(false), &running, None, &rules())
                .confirmed
                .is_empty()
        );
    }

    #[test]
    fn steam_s_installers_for_a_game_are_not_the_game() {
        let running = [process(
            10,
            1,
            5,
            "C:\\Steam\\steamapps\\common\\A Game\\_CommonRedist\\vcredist.exe",
        )];
        assert!(
            identify(&steam_target(true), &running, None, &rules())
                .confirmed
                .is_empty()
        );
    }

    #[test]
    fn steam_and_windows_are_never_the_game_even_when_chosen() {
        for chosen in ["c:\\steam\\steam.exe", "c:\\windows\\system32\\cmd.exe"] {
            let target = Target {
                file: Some(chosen.into()),
                steam: vec![],
            };
            let running = [process(10, 1, 5, chosen)];
            assert!(
                identify(&target, &running, None, &rules())
                    .confirmed
                    .is_empty()
            );
        }
    }

    #[test]
    fn a_launcher_open_alone_is_not_the_game() {
        for chosen in [
            "d:\\games\\foo\\launcher.exe",
            "d:\\games\\foo\\foolauncher.exe",
            "c:\\games\\battle.net\\battle.net.exe",
        ] {
            let target = Target {
                file: Some(chosen.into()),
                steam: vec![],
            };
            let running = [process(10, 1, 5, chosen)];
            assert!(
                identify(&target, &running, None, &rules())
                    .confirmed
                    .is_empty()
            );
        }
    }

    #[test]
    fn what_a_launcher_starts_in_the_game_s_folders_is_the_game_and_the_launcher_is_not() {
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        let mut launch = launch_of("d:\\games\\foo\\launcher\\launcher.exe", Some(root));
        let running = [
            process(10, 1, 2_000, "d:\\games\\foo\\launcher\\launcher.exe"),
            process(11, 10, 3_000, "d:\\games\\foo\\bin\\foo.exe"),
        ];
        launch.follow(&running, &rules(), NOW);
        let target = Target {
            file: Some("d:\\games\\foo\\launcher\\launcher.exe".into()),
            steam: vec![],
        };
        let seen = identify(&target, &running, Some(&launch), &rules());
        assert_eq!(confirmed(&seen), [11]);
        assert!(!seen.open);
    }

    #[test]
    fn a_launcher_that_leaves_hands_over_to_what_appears_in_its_folder() {
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        let mut launch = launch_of("d:\\games\\foo\\launcher.exe", Some(root));
        // Started by something else: a service the launcher asked.
        let running = [process(20, 900, 3_000, "d:\\games\\foo\\bin\\foo.exe")];
        launch.follow(&running, &rules(), NOW + 1_000);
        let target = Target {
            file: Some("d:\\games\\foo\\launcher.exe".into()),
            steam: vec![],
        };
        assert_eq!(
            confirmed(&identify(&target, &running, Some(&launch), &rules())),
            [20]
        );
    }

    #[test]
    fn a_child_of_a_launcher_that_has_ended_is_still_followed() {
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        let mut launch = launch_of("d:\\games\\foo\\launcher\\launcher.exe", Some(root));
        launch.follow(
            &[process(
                11,
                10,
                3_000,
                "d:\\games\\foo\\launcher\\update.exe",
            )],
            &rules(),
            NOW,
        );
        let running = [process(12, 11, 4_000, "d:\\games\\foo\\bin\\foo.exe")];
        launch.follow(&running, &rules(), NOW + 120_000);
        assert_eq!(
            confirmed(&identify(
                &Target::default(),
                &running,
                Some(&launch),
                &rules()
            )),
            [12]
        );
    }

    #[test]
    fn something_else_a_launcher_opens_is_not_the_game() {
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        let mut launch = launch_of("d:\\games\\foo\\launcher.exe", Some(root));
        let running = [process(
            11,
            10,
            3_000,
            "c:\\program files\\browser\\browser.exe",
        )];
        launch.follow(&running, &rules(), NOW);
        assert!(
            identify(&Target::default(), &running, Some(&launch), &rules())
                .confirmed
                .is_empty()
        );
    }

    #[test]
    fn a_process_with_a_reused_id_is_no_child_of_the_one_that_had_it() {
        let root = Identity {
            pid: 10,
            started: 5_000,
        };
        let mut launch = launch_of("d:\\games\\foo\\launcher.exe", Some(root));
        // Older than the launch: its parent was an earlier holder of that id.
        let running = [process(11, 10, 500, "d:\\games\\foo\\bin\\foo.exe")];
        launch.follow(&running, &rules(), NOW);
        assert!(!launch.family.iter().any(|id| id.pid == 11));
    }

    #[test]
    fn a_game_chosen_in_a_folder_many_share_takes_over_nothing_there() {
        // Beside other games: another game starting meanwhile is not this one.
        for file in [
            "d:\\grim dawn.exe",
            "c:\\program files\\grim dawn.exe",
            "c:\\users\\me\\grim dawn.exe",
            "c:\\steam\\steamapps\\common\\grim dawn.exe",
        ] {
            let mut launch = launch_of(file, None);
            let folder = folder_of(file).unwrap();
            let other = format!("{folder}\\other\\other.exe");
            let running = [process(20, 900, 3_000, &other)];
            launch.follow(&running, &rules(), NOW);
            assert!(launch.family.is_empty(), "{file}");
        }
    }

    #[test]
    fn nothing_takes_over_once_a_game_has_had_its_time_to_start() {
        let mut launch = launch_of(GAME, None);
        let running = [process(
            20,
            900,
            3_000,
            "d:\\games\\grim dawn\\x64\\tool.exe",
        )];
        launch.follow(&running, &rules(), NOW + START_WINDOW_MS);
        assert!(launch.family.is_empty());
    }

    #[test]
    fn what_was_running_before_play_is_not_taken_over() {
        let mut launch = launch_of(GAME, None);
        let running = [process(
            20,
            900,
            STARTED - 1,
            "d:\\games\\grim dawn\\x64\\tool.exe",
        )];
        launch.follow(&running, &rules(), NOW);
        assert!(launch.family.is_empty());
    }

    #[test]
    fn says_not_running_when_nothing_is_seen() {
        let games = Games::default();
        let view = games.view("entry-1", &file_target(), Some(&[]), &rules(), NOW);
        assert_eq!(view, GameView::only(State::Stopped));
    }

    #[test]
    fn a_game_started_is_starting_until_seen_and_never_longer_than_its_time() {
        let games = Games::default();
        games.launched("entry-1", launch_of(GAME, None));
        let starting = games.view("entry-1", &file_target(), Some(&[]), &rules(), NOW + 1_000);
        assert_eq!(starting.state, State::Starting);

        let running = [process(10, 900, 3_000, GAME)];
        let view = games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + 2_000,
        );
        assert_eq!(view.state, State::Running);

        let gone = games.view(
            "entry-1",
            &file_target(),
            Some(&[]),
            &rules(),
            NOW + START_WINDOW_MS,
        );
        assert_eq!(gone.state, State::Stopped);
        assert!(!games.is_starting("entry-1", NOW + START_WINDOW_MS));
    }

    #[test]
    fn a_game_that_closes_soon_after_starting_has_closed_and_can_be_played_again() {
        let games = Games::default();
        games.launched("entry-1", launch_of(GAME, None));
        let running = [process(10, 900, 3_000, GAME)];
        games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + 1_000,
        );
        let closed = games.view("entry-1", &file_target(), Some(&[]), &rules(), NOW + 2_000);
        assert_eq!(closed.state, State::Stopped);
        assert!(!games.is_starting("entry-1", NOW + 2_000));
    }

    #[test]
    fn nothing_takes_over_from_a_game_that_was_stopped() {
        let games = Games::default();
        games.launched("entry-1", launch_of(GAME, None));
        let running = [process(10, 900, 3_000, GAME)];
        games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + 1_000,
        );
        games.stop_asked("entry-1", NOW + 2_000, false);
        games.view("entry-1", &file_target(), Some(&[]), &rules(), NOW + 3_000);
        let later = [process(
            11,
            900,
            4_000,
            "d:\\games\\grim dawn\\x64\\tool.exe",
        )];
        let view = games.view(
            "entry-1",
            &file_target(),
            Some(&later),
            &rules(),
            NOW + 4_000,
        );
        assert_eq!(view.state, State::Stopped);
    }

    #[test]
    fn a_launcher_left_open_says_so_with_no_stop() {
        let games = Games::default();
        let chosen = "d:\\games\\foo\\launcher.exe";
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        games.launched("entry-1", launch_of(chosen, Some(root)));
        let target = Target {
            file: Some(chosen.into()),
            steam: vec![],
        };
        let running = [process(10, 1, 2_000, chosen)];
        let view = games.view(
            "entry-1",
            &target,
            Some(&running),
            &rules(),
            NOW + START_WINDOW_MS,
        );
        assert_eq!(view, GameView::unverified(Why::Open));
        let closed = games.view(
            "entry-1",
            &target,
            Some(&[]),
            &rules(),
            NOW + START_WINDOW_MS,
        );
        assert_eq!(closed.state, State::Stopped);
    }

    #[test]
    fn steam_saying_running_with_no_process_seen_has_no_stop() {
        let games = Games::default();
        let view = games.view("entry-1", &steam_target(true), Some(&[]), &rules(), NOW);
        assert_eq!(view, GameView::unverified(Why::Steam));
    }

    #[test]
    fn a_steam_game_run_without_steam_is_still_seen_running() {
        let games = Games::default();
        let running = [process(
            10,
            1,
            5,
            "c:\\steam\\steamapps\\common\\a game\\a.exe",
        )];
        let view = games.view(
            "entry-1",
            &steam_target(false),
            Some(&running),
            &rules(),
            NOW,
        );
        assert_eq!(view.state, State::Running);
    }

    #[test]
    fn what_windows_will_not_say_is_never_called_running_nor_stopped() {
        let games = Games::default();
        let running = [unreadable(10, "Grim Dawn.exe")];
        let view = games.view("entry-1", &file_target(), Some(&running), &rules(), NOW);
        assert_eq!(view, GameView::unverified(Why::Denied));
        let no_list = games.view("entry-1", &file_target(), None, &rules(), NOW);
        assert_eq!(no_list, GameView::unverified(Why::Denied));
    }

    #[test]
    fn stopping_lasts_until_it_has_gone_and_offers_force_after_a_while() {
        let games = Games::default();
        let running = [process(10, 1, 5, GAME)];
        games.stop_asked("entry-1", NOW, false);
        let asked = games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + 1_000,
        );
        assert_eq!(asked.state, State::Stopping);
        assert!(!asked.unresponsive);

        let late = games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + STOP_WAIT_MS,
        );
        assert_eq!(late.state, State::Stopping);
        assert!(late.unresponsive);

        let gone = games.view(
            "entry-1",
            &file_target(),
            Some(&[]),
            &rules(),
            NOW + STOP_WAIT_MS,
        );
        assert_eq!(gone.state, State::Stopped);
        // Asked once: started again later, it is simply running.
        let again = games.view(
            "entry-1",
            &file_target(),
            Some(&running),
            &rules(),
            NOW + 90_000,
        );
        assert_eq!(again.state, State::Running);
    }

    #[test]
    fn a_game_with_no_window_to_ask_offers_force_at_once() {
        let games = Games::default();
        let running = [process(10, 1, 5, GAME)];
        games.stop_asked("entry-1", NOW, true);
        let view = games.view("entry-1", &file_target(), Some(&running), &rules(), NOW);
        assert!(view.unresponsive);
    }

    #[test]
    fn a_stop_refused_leaves_it_running() {
        let games = Games::default();
        let running = [process(10, 1, 5, GAME)];
        games.stop_asked("entry-1", NOW, false);
        games.stop_failed("entry-1");
        let view = games.view("entry-1", &file_target(), Some(&running), &rules(), NOW);
        assert_eq!(view.state, State::Running);
    }

    #[test]
    fn a_file_changed_forgets_what_the_last_one_started() {
        let games = Games::default();
        games.launched("entry-1", launch_of(GAME, None));
        games.forget("entry-1");
        assert!(!games.is_starting("entry-1", NOW));
    }

    #[test]
    fn a_launch_is_let_go_once_it_has_all_ended() {
        let games = Games::default();
        let root = Identity {
            pid: 10,
            started: 2_000,
        };
        games.launched("entry-1", launch_of(GAME, Some(root)));
        let running = [process(10, 1, 2_000, GAME)];
        assert_eq!(
            games.follow(&running, &rules(), NOW + START_WINDOW_MS),
            (true, false)
        );
        assert_eq!(
            games.follow(&[], &rules(), NOW + START_WINDOW_MS),
            (false, false)
        );
    }

    #[test]
    fn paths_are_compared_as_windows_compares_them() {
        assert_eq!(
            key(Path::new("c:/Steam/steamapps/")),
            "c:\\steam\\steamapps"
        );
        assert_eq!(
            key(Path::new("\\\\?\\C:\\Games\\X.EXE")),
            "c:\\games\\x.exe"
        );
    }
}
