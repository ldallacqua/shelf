//! Updates found while the app runs (ADR 005, section 9). The splash looks at every start, but
//! closed to the tray the app may run for days: so it also looks now and then, downloads what it
//! finds, and keeps it until the owner says when, from Shelf's page. Installing ends the app, and
//! the installer opens the new version.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::tracker::Tracker;

/// How long after the app starts it first looks: the splash has just done so.
const FIRST_LOOK: Duration = Duration::from_secs(30 * 60);
/// How often it looks after that.
const LOOK_EVERY: Duration = Duration::from_secs(60 * 60);
/// How long GitHub has to say whether there is one.
const CHECK_AT_MOST: Duration = Duration::from_secs(30);
/// How long the update may take to arrive: nobody waits on it.
const DOWNLOAD_AT_MOST: Duration = Duration::from_secs(15 * 60);

/// An update, downloaded and checked against its signature as it arrived.
struct Ready {
    update: Update,
    bytes: Vec<u8>,
}

/// What is waiting to be installed, if anything.
#[derive(Default)]
pub struct Updates(Mutex<Option<Ready>>);

/// What the page is told of it.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct ReadyView {
    pub version: String,
}

impl Updates {
    pub fn ready(&self) -> Option<ReadyView> {
        #[cfg(debug_assertions)]
        if let Some(version) = stand_in() {
            return Some(ReadyView { version });
        }
        self.0.lock().unwrap().as_ref().map(|ready| ReadyView {
            version: ready.update.version.clone(),
        })
    }

    /// Installs what is waiting. On Windows the app ends here; returning means it could not.
    pub fn install(&self) -> Result<(), String> {
        #[cfg(debug_assertions)]
        if stand_in().is_some() {
            return Err("the stand-in installs nothing".into());
        }
        let ready = self.0.lock().unwrap();
        let Some(ready) = ready.as_ref() else {
            return Err("no update is waiting".into());
        };
        ready
            .update
            .install(&ready.bytes)
            .map_err(|error| error.to_string())
    }
}

/// A development build has no releases to compare itself with: `SHELF_UPDATE_STAND_IN` names a
/// version that waits, for a person to see the page offer it. Installing it fails, as one can.
#[cfg(debug_assertions)]
fn stand_in() -> Option<String> {
    std::env::var("SHELF_UPDATE_STAND_IN")
        .ok()
        .filter(|version| !version.is_empty())
}

/// Starts looking, in a release build: a development build has no releases to compare itself with.
pub fn watch(app: &AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(FIRST_LOOK).await;
        loop {
            look(&app).await;
            tokio::time::sleep(LOOK_EVERY).await;
        }
    });
}

/// One look: a newer version is downloaded and kept. One already kept is not looked past; the
/// next start takes whatever is newest.
async fn look(app: &AppHandle) {
    let updates = app.state::<Updates>();
    if updates.0.lock().unwrap().is_some() {
        return;
    }
    let ending = app.clone();
    let Ok(updater) = app
        .updater_builder()
        .timeout(DOWNLOAD_AT_MOST)
        // The installer ends the app without its usual way out: the hours counted are kept first.
        .on_before_exit(move || {
            if let Err(error) = ending.state::<Tracker>().flush() {
                eprintln!("could not keep the hours counted: {error}");
            }
        })
        .build()
    else {
        return;
    };
    let update = match tokio::time::timeout(CHECK_AT_MOST, updater.check()).await {
        Ok(Ok(Some(update))) => update,
        Ok(Ok(None)) | Err(_) => return,
        Ok(Err(error)) => {
            eprintln!("could not look for an update: {error}");
            return;
        }
    };
    match update.download(|_, _| {}, || {}).await {
        Ok(bytes) => *updates.0.lock().unwrap() = Some(Ready { update, bytes }),
        Err(error) => eprintln!("could not download the update: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_waits_until_one_is_downloaded() {
        let updates = Updates::default();
        assert_eq!(updates.ready(), None);
        assert!(updates.install().is_err());
    }

    #[test]
    fn the_page_is_told_the_version() {
        let view = ReadyView {
            version: "0.16.0".into(),
        };
        assert_eq!(
            serde_json::to_value(view).unwrap(),
            serde_json::json!({ "version": "0.16.0" })
        );
    }
}
