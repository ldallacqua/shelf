//! The commands Shelf's pages may ask of this computer (ADR 005, section 3).
//! Each takes an entry's id or Steam app ids, checked before anything is
//! done, or nothing, and never a path: a path comes only from the file
//! picker, which the person sees and answers.

use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::ids;
use crate::launch::{self, Failure};
use crate::launchers::{Launcher, Launchers};
use crate::steam;

/// Why a command did nothing, in a word a page has a sentence for.
#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Refusal {
    /// What was named is not an entry's id.
    Invalid,
    /// No file is chosen for the game on this computer.
    Unset,
    /// The file chosen is not there any more.
    Missing,
    /// Windows refused to start it, or the person said no to its prompt.
    Refused,
    /// This computer could not keep the choice.
    Failed,
}

/// A game's file as a page shows it: its name, where it is, and whether it is still there.
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct LauncherView {
    name: String,
    path: String,
    exists: bool,
}

fn view(launcher: &Launcher) -> LauncherView {
    LauncherView {
        name: launcher
            .path
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default(),
        path: launcher.path.display().to_string(),
        exists: launcher.path.is_file(),
    }
}

fn entry_id(entry: &str) -> Result<(), Refusal> {
    if ids::entry(entry) {
        Ok(())
    } else {
        Err(Refusal::Invalid)
    }
}

/// A page's words, kept to a length a dialog can show.
fn short(text: &str) -> String {
    text.chars().take(200).collect()
}

/// The milliseconds since 1970, to say when a file was chosen.
fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as u64)
}

/// The file chosen for a game on this computer, if any.
#[tauri::command]
pub fn launcher(
    entry: String,
    launchers: State<'_, Launchers>,
) -> Result<Option<LauncherView>, Refusal> {
    entry_id(&entry)?;
    Ok(launchers.get(&entry).as_ref().map(view))
}

/// Windows' own file picker, titled by the page, for a game's `.exe`, a
/// shortcut or a `.bat`; the file chosen is kept for the game. Nothing, when
/// the picker is closed.
#[tauri::command]
pub async fn choose_launcher(
    window: WebviewWindow,
    entry: String,
    title: String,
    files: String,
    launchers: State<'_, Launchers>,
) -> Result<Option<LauncherView>, Refusal> {
    entry_id(&entry)?;
    let picked = pick(&window, short(&title), short(&files)).await?;
    let Some(path) = picked else {
        return Ok(None);
    };
    let launcher = launchers
        .set(&entry, path, now())
        .map_err(|_| Refusal::Failed)?;
    Ok(Some(view(&launcher)))
}

async fn pick(
    window: &WebviewWindow,
    title: String,
    files: String,
) -> Result<Option<PathBuf>, Refusal> {
    // A development build can be handed the file instead, so `pnpm desktop:check`
    // goes through choosing without a picker no script can answer.
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("SHELF_PICK") {
        return Ok(Some(PathBuf::from(path)));
    }
    let dialog = window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .add_filter(files, &["exe", "bat", "lnk", "url"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|_| Refusal::Failed)?;
    Ok(picked.and_then(|file| file.into_path().ok()))
}

/// Forgets a game's file on this computer.
#[tauri::command]
pub fn forget_launcher(entry: String, launchers: State<'_, Launchers>) -> Result<(), Refusal> {
    entry_id(&entry)?;
    launchers.forget(&entry).map_err(|_| Refusal::Failed)
}

/// Opens the folder of a game's file in Explorer, the file selected.
#[tauri::command]
pub fn show_launcher(
    app: AppHandle,
    entry: String,
    launchers: State<'_, Launchers>,
) -> Result<(), Refusal> {
    entry_id(&entry)?;
    let launcher = launchers.get(&entry).ok_or(Refusal::Unset)?;
    if !launcher.path.is_file() {
        return Err(Refusal::Missing);
    }
    app.opener()
        .reveal_item_in_dir(&launcher.path)
        .map_err(|_| Refusal::Refused)
}

/// Starts a game from the file chosen for it. A game played through Steam is
/// not started here: its page links to Steam, which the window hands over.
#[tauri::command]
pub fn play(entry: String, launchers: State<'_, Launchers>) -> Result<(), Refusal> {
    entry_id(&entry)?;
    let launcher = launchers.get(&entry).ok_or(Refusal::Unset)?;
    launch::start(&launcher.path).map_err(|failure| match failure {
        Failure::Missing => Refusal::Missing,
        Failure::Refused => Refusal::Refused,
    })
}

/// Of the Steam apps a page names (fifty at most), the ones Steam has
/// installed on this computer. None when Steam is not installed.
#[tauri::command]
pub async fn steam_installed(apps: Vec<String>) -> Vec<String> {
    let apps: Vec<String> = apps.into_iter().take(50).collect();
    tauri::async_runtime::spawn_blocking(move || {
        steam::folder().map_or_else(Vec::new, |folder| steam::installed(&folder, &apps))
    })
    .await
    .unwrap_or_default()
}

/// What is ready to play on this computer (spec 7.7, Ready to play).
#[derive(Debug, Serialize)]
pub struct Playable {
    /// The entries whose chosen file is still there.
    entries: Vec<String>,
    /// Every Steam app installed here.
    steam: Vec<String>,
}

/// What Ready to play leaves: the entries whose chosen file is still there,
/// and every app installed in Steam's libraries (none when Steam is not
/// installed). It takes nothing.
#[tauri::command]
pub async fn playable(launchers: State<'_, Launchers>) -> Result<Playable, Refusal> {
    let kept = launchers.all();
    tauri::async_runtime::spawn_blocking(move || Playable {
        entries: kept
            .into_iter()
            .filter(|(_, path)| path.is_file())
            .map(|(entry, _)| entry)
            .collect(),
        steam: steam::folder().map_or_else(Vec::new, |folder| steam::all_installed(&folder)),
    })
    .await
    .map_err(|_| Refusal::Failed)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_launcher_is_shown_by_its_file_s_name() {
        let shown = view(&Launcher {
            path: PathBuf::from("D:\\Games\\Grim Dawn\\x64\\Grim Dawn.exe"),
            chosen_at: 1,
        });
        assert_eq!(shown.name, "Grim Dawn.exe");
        assert_eq!(shown.path, "D:\\Games\\Grim Dawn\\x64\\Grim Dawn.exe");
        assert!(!shown.exists);
    }

    #[test]
    fn a_page_s_words_are_cut_to_a_dialog_s_length() {
        assert_eq!(short(&"a".repeat(500)).len(), 200);
        assert_eq!(short("Choose Hades’s file"), "Choose Hades’s file");
    }

    #[test]
    fn refusals_are_words() {
        assert_eq!(
            serde_json::to_string(&Refusal::Missing).unwrap(),
            "\"missing\""
        );
        assert_eq!(entry_id("../launchers"), Err(Refusal::Invalid));
    }
}
