//! How long a game was played (ADR 005, section 12). This decides from what it is told, so every
//! rule can be tested with no game and no clock; `watch.rs` tells it what Windows says, and it
//! keeps what was counted in `play-sessions.json` until Shelf's server has it.
//!
//! A stretch counts while a game is in front and input keeps arriving. What came since the last
//! input is only counted once more input arrives; if none does within `AWAY_AFTER_MS`, it is
//! dropped whole, so walking away for an hour costs nothing but the walk.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::processes::Identity;

/// How long with no input before it is time away. The page says this number in words
/// (`AWAY_AFTER_MINUTES`): a minute would throw away cutscenes, reading and thinking.
pub const AWAY_AFTER_MS: u64 = 5 * 60_000;
/// A longer gap between two looks is the computer asleep, or this app stuck, and not play.
const LONGEST_LOOK_MS: u64 = 15_000;
/// A crash or a power cut loses this much at most.
const SAVE_EVERY_MS: u64 = 30_000;
/// What is on no shelf by then is not going to be.
const KEPT_FOR_MS: u64 = 90 * 24 * 60 * 60_000;
/// The most Shelf's server takes for one session.
const LONGEST_SESSION_S: u64 = 7 * 24 * 60 * 60;
/// The most Shelf's server takes at once.
const MOST_AT_ONCE: usize = 200;

const FILE: &str = "play-sessions.json";

/// What was played: the entry whose file it is, or the Steam app, which the server finds a game for.
#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Game {
    Entry(String),
    Steam(String),
}

/// A sitting with a game, as Shelf's server takes it.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub game: Game,
    /// In milliseconds since 1970.
    pub started_at: u64,
    pub ended_at: u64,
    /// Played, not merely open.
    pub seconds: u64,
}

/// What one look saw.
pub struct Look {
    /// Milliseconds since 1970, to say when things happened.
    pub at: u64,
    /// A clock that only goes forward, in milliseconds, to measure what passed.
    pub clock: u64,
    /// The game in front and its process, if it is one.
    pub front: Option<(Game, Identity)>,
    /// How long since a key, the mouse or a controller was last touched, in milliseconds.
    pub input_age: u64,
}

struct Open {
    id: String,
    started_at: u64,
    ended_at: u64,
    counted_ms: u64,
    /// Since the last input: counted only once another comes.
    waiting_ms: u64,
    /// Its processes seen in front: the session lasts until they have all ended.
    seen: Vec<Identity>,
}

impl Open {
    fn session(&self, game: &Game) -> Session {
        Session {
            id: self.id.clone(),
            game: game.clone(),
            started_at: self.started_at,
            ended_at: self.ended_at,
            seconds: (self.counted_ms / 1000).min(LONGEST_SESSION_S),
        }
    }
}

/// What is being counted, and what has been and has not reached Shelf yet.
#[derive(Default)]
pub struct Counter {
    open: HashMap<Game, Open>,
    finished: Vec<Session>,
    last_clock: Option<u64>,
}

impl Counter {
    /// Takes in what one look saw. `new_id` names a session that starts now; `alive` says
    /// whether a process seen before is still running. Whether anything worth saving changed.
    pub fn look(
        &mut self,
        look: &Look,
        new_id: impl FnOnce() -> String,
        alive: impl Fn(&Identity) -> bool,
    ) -> bool {
        let passed = self
            .last_clock
            .map_or(0, |last| look.clock.saturating_sub(last));
        self.last_clock = Some(look.clock);
        let passed = if passed > LONGEST_LOOK_MS { 0 } else { passed };

        let front = look.front.as_ref().map(|(game, _)| game);
        for (game, open) in &mut self.open {
            // Left for something else: what came since the last input stands, as it ended here.
            if Some(game) != front {
                open.counted_ms += open.waiting_ms;
                open.waiting_ms = 0;
            }
        }

        let mut changed = false;
        if let Some((game, identity)) = &look.front {
            let open = self.open.entry(game.clone()).or_insert_with(|| Open {
                id: new_id(),
                started_at: look.at,
                ended_at: look.at,
                counted_ms: 0,
                waiting_ms: 0,
                seen: Vec::new(),
            });
            if !open.seen.contains(identity) {
                open.seen.push(*identity);
            }
            open.ended_at = look.at;
            open.waiting_ms += passed;
            if look.input_age >= AWAY_AFTER_MS {
                open.waiting_ms = 0;
            } else {
                let counted = open.waiting_ms.saturating_sub(look.input_age);
                open.counted_ms += counted;
                open.waiting_ms -= counted;
                changed = counted > 0;
            }
        }

        let ended: Vec<Game> = self
            .open
            .iter()
            .filter(|(game, open)| Some(*game) != front && !open.seen.iter().any(&alive))
            .map(|(game, _)| game.clone())
            .collect();
        for game in ended {
            let Some(mut open) = self.open.remove(&game) else {
                continue;
            };
            open.counted_ms += open.waiting_ms;
            let session = open.session(&game);
            if session.seconds > 0 {
                self.finished.push(session);
                changed = true;
            }
        }
        changed
    }

    /// Everything counted so far, finished or not: what a crash must not lose. On the next start
    /// a session left open has ended, and a game still running starts another.
    fn all(&self) -> Vec<Session> {
        let mut all = self.finished.clone();
        all.extend(
            self.open
                .iter()
                .map(|(game, open)| open.session(game))
                .filter(|session| session.seconds > 0),
        );
        all
    }

    /// What has ended, for Shelf's server. What is still going waits until it ends.
    pub fn finished(&self) -> Vec<Session> {
        self.finished.iter().take(MOST_AT_ONCE).cloned().collect()
    }

    pub fn kept(&mut self, ids: &[String]) -> bool {
        let before = self.finished.len();
        self.finished.retain(|session| !ids.contains(&session.id));
        before != self.finished.len()
    }
}

/// What `play-sessions.json` holds. `version` is for whatever reads it next.
#[derive(Default, Serialize, Deserialize)]
struct Kept {
    version: u32,
    sessions: Vec<Session>,
}

/// The counter, kept on this computer.
pub struct Tracker {
    file: PathBuf,
    counter: Mutex<Counter>,
    last_saved: Mutex<u64>,
}

impl Tracker {
    /// What was kept in `folder`. A file that cannot be read is put aside, not lost.
    pub fn open(folder: &Path, now: u64) -> Self {
        let file = folder.join(FILE);
        let kept: Kept = match fs::read_to_string(&file) {
            Ok(text) => serde_json::from_str(&text).unwrap_or_else(|_| {
                let _ = fs::rename(&file, folder.join("play-sessions.unreadable.json"));
                Kept::default()
            }),
            Err(_) => Kept::default(),
        };
        let finished = kept
            .sessions
            .into_iter()
            .filter(|session| now.saturating_sub(session.ended_at) < KEPT_FOR_MS)
            .collect();
        Tracker {
            file,
            counter: Mutex::new(Counter {
                finished,
                ..Counter::default()
            }),
            last_saved: Mutex::new(now),
        }
    }

    pub fn look(
        &self,
        look: &Look,
        new_id: impl FnOnce() -> String,
        alive: impl Fn(&Identity) -> bool,
    ) {
        let mut counter = self.counter.lock().unwrap();
        let before = counter.finished.len();
        let changed = counter.look(look, new_id, alive);
        let ended = counter.finished.len() != before;
        let mut last_saved = self.last_saved.lock().unwrap();
        if ended || (changed && look.at.saturating_sub(*last_saved) >= SAVE_EVERY_MS) {
            *last_saved = look.at;
            if let Err(error) = self.save(&counter) {
                eprintln!("could not keep the hours counted: {error}");
            }
        }
    }

    pub fn finished(&self) -> Vec<Session> {
        self.counter.lock().unwrap().finished()
    }

    /// Lets go of what Shelf's server has said it has.
    pub fn kept(&self, ids: &[String]) -> io::Result<()> {
        let mut counter = self.counter.lock().unwrap();
        if counter.kept(ids) {
            self.save(&counter)?;
        }
        Ok(())
    }

    /// As it stands, before the app ends.
    pub fn flush(&self) -> io::Result<()> {
        self.save(&self.counter.lock().unwrap())
    }

    /// Written whole to a new file, then put in place: a write cut short leaves the last good
    /// file, never half of one.
    fn save(&self, counter: &Counter) -> io::Result<()> {
        let text = serde_json::to_string(&Kept {
            version: 1,
            sessions: counter.all(),
        })
        .map_err(io::Error::other)?;
        if let Some(folder) = self.file.parent() {
            fs::create_dir_all(folder)?;
        }
        let writing = self.file.with_extension("json.new");
        fs::write(&writing, text)?;
        fs::rename(&writing, &self.file)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AT: u64 = 1_800_000_000_000;
    const LOOK: u64 = 5_000;
    const MINUTE: u64 = 60_000;

    fn game() -> Game {
        Game::Steam("620".into())
    }

    fn process(pid: u32) -> Identity {
        Identity { pid, started: 7 }
    }

    /// A counter, and how far along its clock is.
    struct Play {
        counter: Counter,
        clock: u64,
        ids: u32,
        alive: Vec<Identity>,
    }

    impl Play {
        fn new() -> Self {
            Play {
                counter: Counter::default(),
                clock: 0,
                ids: 0,
                alive: vec![process(1)],
            }
        }

        fn look(&mut self, front: Option<Game>, input_age: u64) {
            let look = Look {
                at: AT + self.clock,
                clock: self.clock,
                front: front.map(|game| (game, process(1))),
                input_age,
            };
            self.ids += 1;
            let id = format!("session-{}", self.ids);
            let alive = self.alive.clone();
            self.counter
                .look(&look, || id, |identity| alive.contains(identity));
        }

        /// A while passing, looked at as the app looks, with the last input `since` before its
        /// start or, when `touching`, at every look.
        fn run(&mut self, front: Option<Game>, length: u64, since: u64, touching: bool) {
            let mut passed = 0;
            while passed < length {
                self.clock += LOOK;
                passed += LOOK;
                let age = if touching { 0 } else { since + passed };
                self.look(front.clone(), age);
            }
        }

        fn seconds(&mut self) -> u64 {
            self.alive.clear();
            self.clock += LOOK;
            self.look(None, 0);
            self.counter.finished().iter().map(|s| s.seconds).sum()
        }
    }

    #[test]
    fn a_game_in_front_and_in_use_counts() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), 10 * MINUTE, 0, true);
        assert_eq!(play.seconds(), 600);
    }

    #[test]
    fn a_game_behind_something_else_does_not_count() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.run(None, 10 * MINUTE, 0, true);
        assert_eq!(play.seconds(), 60);
    }

    #[test]
    fn a_wait_shorter_than_time_away_counts_once_input_comes_back() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), 4 * MINUTE, 0, false);
        play.run(Some(game()), MINUTE, 0, true);
        assert_eq!(play.seconds(), 300);
    }

    #[test]
    fn time_away_is_dropped_whole_not_only_what_came_after_the_limit() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.run(Some(game()), 60 * MINUTE, 0, false);
        play.run(Some(game()), MINUTE, 0, true);
        assert_eq!(play.seconds(), 120);
    }

    #[test]
    fn a_game_closed_with_no_input_since_keeps_a_wait_that_never_reached_time_away() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.run(Some(game()), MINUTE, 0, false);
        assert_eq!(play.seconds(), 120);
    }

    #[test]
    fn the_computer_asleep_is_never_played() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.clock += 8 * 60 * MINUTE;
        play.look(Some(game()), 0);
        assert_eq!(play.seconds(), 60);
    }

    #[test]
    fn nothing_played_leaves_no_session() {
        let mut play = Play::new();
        play.look(Some(game()), AWAY_AFTER_MS);
        play.run(Some(game()), 10 * MINUTE, AWAY_AFTER_MS, false);
        assert_eq!(play.seconds(), 0);
        assert!(play.counter.finished().is_empty());
    }

    #[test]
    fn a_session_lasts_while_its_game_runs_behind_something_else() {
        let mut play = Play::new();
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.run(None, MINUTE, 0, true);
        assert!(play.counter.finished().is_empty());
        play.run(Some(game()), MINUTE, 0, true);
        assert_eq!(play.seconds(), 120);
        assert_eq!(play.counter.finished().len(), 1);
    }

    #[test]
    fn two_games_in_turn_are_two_sessions() {
        let mut play = Play::new();
        let other = Game::Entry("entry-1".into());
        play.look(Some(game()), 0);
        play.run(Some(game()), MINUTE, 0, true);
        play.run(Some(other), MINUTE, 0, true);
        assert_eq!(play.seconds(), 120);
        assert_eq!(play.counter.finished().len(), 2);
    }

    #[test]
    fn a_session_is_sent_as_the_server_reads_it() {
        let session = Session {
            id: "a".into(),
            game: Game::Steam("620".into()),
            started_at: 1,
            ended_at: 2,
            seconds: 3,
        };
        assert_eq!(
            serde_json::to_string(&session).unwrap(),
            r#"{"id":"a","game":{"steam":"620"},"startedAt":1,"endedAt":2,"seconds":3}"#
        );
    }

    fn folder(name: &str) -> PathBuf {
        let folder =
            std::env::temp_dir().join(format!("shelf-tracker-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&folder);
        fs::create_dir_all(&folder).unwrap();
        folder
    }

    fn played(tracker: &Tracker, clock: u64, front: bool) {
        tracker.look(
            &Look {
                at: AT + clock,
                clock,
                front: front.then(|| (game(), process(1))),
                input_age: 0,
            },
            || "a".into(),
            |_| false,
        );
    }

    #[test]
    fn what_was_counted_survives_a_crash_and_goes_once_the_server_has_it() {
        let folder = folder("crash");
        let tracker = Tracker::open(&folder, AT);
        played(&tracker, 0, true);
        for look in 1..=7 {
            played(&tracker, look * LOOK, true);
        }
        // Crashed here: never told the game had ended.
        let again = Tracker::open(&folder, AT + MINUTE);
        let sessions = again.finished();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].seconds, 30);

        again.kept(&["a".to_string()]).unwrap();
        assert!(Tracker::open(&folder, AT + MINUTE).finished().is_empty());
        fs::remove_dir_all(&folder).unwrap();
    }

    #[test]
    fn what_no_shelf_ever_took_is_let_go_after_a_while() {
        let folder = folder("old");
        let tracker = Tracker::open(&folder, AT);
        played(&tracker, 0, true);
        played(&tracker, LOOK, true);
        played(&tracker, 2 * LOOK, false);
        assert_eq!(tracker.finished().len(), 1);
        assert_eq!(Tracker::open(&folder, AT + MINUTE).finished().len(), 1);
        assert!(
            Tracker::open(&folder, AT + KEPT_FOR_MS + MINUTE)
                .finished()
                .is_empty()
        );
        fs::remove_dir_all(&folder).unwrap();
    }

    #[test]
    fn a_file_that_cannot_be_read_is_put_aside() {
        let folder = folder("unreadable");
        fs::write(folder.join(FILE), "not json").unwrap();
        assert!(Tracker::open(&folder, AT).finished().is_empty());
        assert!(folder.join("play-sessions.unreadable.json").exists());
        fs::remove_dir_all(&folder).unwrap();
    }
}
