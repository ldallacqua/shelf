//! How far a game's backup or restore has got, for the page to draw while it waits: it asks, as it asks
//! about downloads, and nothing is pushed to it. Each step says what is being done, and how much of it,
//! when that can be told.

use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Step {
    /// The saves read, to see what changed.
    Reading,
    /// The snapshot's archive written, its files' bytes counted.
    Packing,
    /// The snapshot sent to the place: a service's bytes counted, a folder's not.
    Sending,
    /// A snapshot read from a service, to be put back.
    Fetching,
    /// The saves put back.
    Restoring,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Progress {
    pub step: Step,
    pub done: u64,
    /// None when how much there is can't be told.
    pub total: Option<u64>,
}

/// A game's saves being worked on, for Play to wait on (ADR 008, section 7): how far, once a step has said.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Syncing {
    #[serde(flatten)]
    pub progress: Option<Progress>,
}

/// Each game's, by its entry, while something is being done to its saves.
#[derive(Default)]
pub struct Board(Mutex<HashMap<String, Progress>>);

impl Board {
    pub fn set(&self, entry: &str, step: Step, done: u64, total: Option<u64>) {
        self.0
            .lock()
            .unwrap()
            .insert(entry.to_string(), Progress { step, done, total });
    }

    pub fn of(&self, entry: &str) -> Option<Progress> {
        self.0.lock().unwrap().get(entry).cloned()
    }

    pub fn clear(&self, entry: &str) {
        self.0.lock().unwrap().remove(entry);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn syncing_says_how_far_once_a_step_has_said() {
        assert_eq!(
            serde_json::to_value(Syncing { progress: None }).unwrap(),
            serde_json::json!({})
        );
        let progress = Some(Progress {
            step: Step::Sending,
            done: 5,
            total: Some(10),
        });
        assert_eq!(
            serde_json::to_value(Syncing { progress }).unwrap(),
            serde_json::json!({ "step": "sending", "done": 5, "total": 10 })
        );
    }

    #[test]
    fn a_game_s_progress_is_its_own_until_cleared() {
        let board = Board::default();
        assert_eq!(board.of("entry-1"), None);
        board.set("entry-1", Step::Packing, 10, Some(40));
        board.set("entry-2", Step::Reading, 0, None);
        assert_eq!(
            serde_json::to_value(board.of("entry-1")).unwrap(),
            serde_json::json!({ "step": "packing", "done": 10, "total": 40 })
        );
        board.clear("entry-1");
        assert_eq!(board.of("entry-1"), None);
        assert_eq!(board.of("entry-2").unwrap().step, Step::Reading);
    }
}
