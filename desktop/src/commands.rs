//! The commands Shelf's pages may ask of this computer (ADR 005, section 3).
//! Each takes an entry's id or Steam app ids, checked before anything is
//! done, or nothing, and never a path: a path comes only from the file
//! picker, which the person sees and answers.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use crate::downloads::{self, Downloads, Through};
use crate::ids;
use crate::launch::{self, Failure};
use crate::launchers::{Launcher, Launchers};
use crate::processes::{self, Closing};
use crate::real_debrid::{self, RealDebrid};
use crate::running::{self, GameView, Games, Launch, Rules, SteamGame, Target};
use crate::shortcut::{self, Pointed};
use crate::sources::{self, Reading, Source, Sources};
use crate::steam;
use crate::tracker::{Session, Tracker};

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
pub(crate) fn now() -> u64 {
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
    games: State<'_, Games>,
) -> Result<Option<LauncherView>, Refusal> {
    entry_id(&entry)?;
    let picked = pick(&window, short(&title), short(&files)).await?;
    let Some(path) = picked else {
        return Ok(None);
    };
    let launcher = launchers
        .set(&entry, path, now())
        .map_err(|_| Refusal::Failed)?;
    games.forget(&entry);
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
pub fn forget_launcher(
    entry: String,
    launchers: State<'_, Launchers>,
    games: State<'_, Games>,
) -> Result<(), Refusal> {
    entry_id(&entry)?;
    games.forget(&entry);
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

/// Starts a game from the file chosen for it, unless it is starting or running
/// already. A game played through Steam is not started here: its page links to
/// Steam, which the window hands over.
#[tauri::command]
pub fn play(
    app: AppHandle,
    entry: String,
    launchers: State<'_, Launchers>,
    games: State<'_, Games>,
    following: State<'_, Following>,
) -> Result<(), Refusal> {
    entry_id(&entry)?;
    let launcher = launchers.get(&entry).ok_or(Refusal::Unset)?;
    let at = now();
    if games.is_starting(&entry, at) {
        return Ok(());
    }
    let rules = rules_here();
    let target = target_of(Some(&launcher.path), &[]);
    if let Some(running) = processes::snapshot()
        && !games
            .seen(&entry, &target, &running, &rules)
            .confirmed
            .is_empty()
    {
        return Ok(());
    }
    let root = launch::start(&launcher.path).map_err(|failure| match failure {
        Failure::Missing => Refusal::Missing,
        Failure::Refused => Refusal::Refused,
    })?;
    // Where the game is expected: where the shortcut points, or beside the file itself.
    let file = match shortcut::pointed_at(&launcher.path) {
        Pointed::Program(program) => program,
        _ => launcher.path.clone(),
    };
    games.launched(
        &entry,
        Launch::new(
            root,
            processes::now_as_windows_counts(at),
            at,
            &running::key(&file),
            &rules,
        ),
    );
    follow(app, &following);
    Ok(())
}

/// Whether the thread following what Play started is running: one, however many games.
#[derive(Default)]
pub struct Following(AtomicBool);

/// A launcher can start the game and be gone between two looks, so what Play started is looked
/// at each second while it starts, and then, for a game that hands over to another later,
/// every few seconds for as long as any of it runs. The thread ends with the last of it.
fn follow(app: AppHandle, following: &Following) {
    if following.0.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(move || {
        let rules = rules_here();
        loop {
            let (any, starting) = match processes::snapshot() {
                Some(running) => app.state::<Games>().follow(&running, &rules, now()),
                None => (true, true),
            };
            if !any {
                app.state::<Following>().0.store(false, Ordering::SeqCst);
                return;
            }
            std::thread::sleep(Duration::from_secs(if starting { 1 } else { 5 }));
        }
    });
}

fn rules_here() -> Rules {
    Rules::here(steam::folder().as_deref())
}

/// What a game is on this computer, from its file and the Steam apps a page names. Whatever the
/// page says, it can name only an app with a manifest here, whose folder Steam's files give.
fn target_of(file: Option<&Path>, apps: &[String]) -> Target {
    let mut target = Target::default();
    let mut apps: Vec<String> = apps
        .iter()
        .filter(|app| ids::steam_app(app))
        .take(50)
        .cloned()
        .collect();
    match file.map(shortcut::pointed_at) {
        Some(Pointed::Program(program)) => target.file = Some(running::key(&program)),
        Some(Pointed::Steam(app)) if !apps.contains(&app) => apps.push(app),
        _ => {}
    }
    if apps.is_empty() {
        return target;
    }
    let Some(folder) = steam::folder() else {
        return target;
    };
    target.steam = apps
        .iter()
        .filter_map(|app| {
            let installed = steam::install_folder(&folder, app)?;
            Some(SteamGame {
                folder: Some(running::key(&installed)),
                running: steam::says_running(app),
            })
        })
        .collect();
    target
}

/// A game's state on this computer. A page names the game: an entry, and its Steam apps
/// installed here. Which processes are the game is worked out here, and never told.
#[tauri::command]
pub async fn game_state(
    app: AppHandle,
    entry: String,
    apps: Vec<String>,
) -> Result<GameView, Refusal> {
    entry_id(&entry)?;
    tauri::async_runtime::spawn_blocking(move || {
        let file = app.state::<Launchers>().get(&entry).map(|kept| kept.path);
        let rules = rules_here();
        let target = target_of(file.as_deref(), &apps);
        let running = processes::snapshot();
        app.state::<Games>()
            .view(&entry, &target, running.as_deref(), &rules, now())
    })
    .await
    .map_err(|_| Refusal::Failed)
}

/// The processes that are this game right now, whatever was seen before.
fn confirmed(app: &AppHandle, entry: &str, apps: &[String]) -> Vec<processes::Identity> {
    let file = app.state::<Launchers>().get(entry).map(|kept| kept.path);
    let rules = rules_here();
    let target = target_of(file.as_deref(), apps);
    processes::snapshot().map_or_else(Vec::new, |running| {
        app.state::<Games>()
            .seen(entry, &target, &running, &rules)
            .confirmed
    })
}

/// Asks a game to close, as its own window's close button does. It has stopped once it is gone:
/// a page reads that from `game_state`. Refused when Windows won't let it be asked.
#[tauri::command]
pub async fn stop_game(app: AppHandle, entry: String, apps: Vec<String>) -> Result<(), Refusal> {
    entry_id(&entry)?;
    tauri::async_runtime::spawn_blocking(move || {
        let ids = confirmed(&app, &entry, &apps);
        if ids.is_empty() {
            return Ok(());
        }
        let games = app.state::<Games>();
        match processes::close(&ids) {
            Closing::Asked => games.stop_asked(&entry, now(), false),
            Closing::NoWindow => games.stop_asked(&entry, now(), true),
            Closing::Denied => {
                games.stop_failed(&entry);
                return Err(Refusal::Refused);
            }
        }
        Ok(())
    })
    .await
    .map_err(|_| Refusal::Failed)?
}

/// Ends a game at once, what it has not saved lost: the page has asked the person first. Each
/// process is identified again here, and checked once more on the handle that ends it.
#[tauri::command]
pub async fn force_stop_game(
    app: AppHandle,
    entry: String,
    apps: Vec<String>,
) -> Result<(), Refusal> {
    entry_id(&entry)?;
    tauri::async_runtime::spawn_blocking(move || {
        processes::terminate(&confirmed(&app, &entry, &apps)).map_err(|_| Refusal::Refused)
    })
    .await
    .map_err(|_| Refusal::Failed)?
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

/// What has been counted and has ended, for the page to send to Shelf (ADR 005, section 12).
#[tauri::command]
pub fn play_sessions(tracker: State<'_, Tracker>) -> Vec<Session> {
    tracker.finished()
}

/// What Shelf has said it keeps, let go of here.
#[tauri::command]
pub fn play_sessions_kept(ids: Vec<String>, tracker: State<'_, Tracker>) -> Result<(), Refusal> {
    if ids.len() > 200 {
        return Err(Refusal::Invalid);
    }
    tracker.kept(&ids).map_err(|_| Refusal::Failed)
}

/// The download sources on this computer (ADR 007): what they are, never their links.
#[tauri::command]
pub fn download_sources(kept: State<'_, Sources>) -> Vec<Source> {
    kept.all()
}

/// Reads the source at an address the person pasted, and keeps it. Nothing is downloaded.
#[tauri::command]
pub async fn add_source(
    app: AppHandle,
    url: String,
    kept: State<'_, Sources>,
) -> Result<Source, sources::Refusal> {
    let url = sources::address(&url)?;
    if kept.has_address(url.as_str()) {
        return Err(sources::Refusal::Duplicate);
    }
    let version = app.package_info().version.to_string();
    let Reading::Read { bytes, etag } = sources::read(&url, None, &version).await? else {
        // Asked with no `ETag`, nothing can answer that it has not changed.
        return Err(sources::Refusal::Unreachable);
    };
    let feed = sources::parse(&bytes)?;
    kept.add(
        uuid::Uuid::new_v4().to_string(),
        url.to_string(),
        feed,
        etag,
        now(),
    )
}

/// Reads a source again by its id. If that fails, the list it has stays.
#[tauri::command]
pub async fn read_source_again(
    app: AppHandle,
    id: String,
    kept: State<'_, Sources>,
) -> Result<Source, sources::Refusal> {
    if !ids::entry(&id) {
        return Err(sources::Refusal::Invalid);
    }
    let (address, etag) = kept.address(&id).ok_or(sources::Refusal::Missing)?;
    let url = sources::address(&address)?;
    let version = app.package_info().version.to_string();
    match sources::read(&url, etag.as_deref(), &version).await? {
        Reading::Unchanged => kept.touch(&id, now()),
        Reading::Read { bytes, etag } => kept.replace(&id, sources::parse(&bytes)?, etag, now()),
    }
}

/// Forgets a source and its list. What was downloaded from it stays.
#[tauri::command]
pub fn remove_source(id: String, kept: State<'_, Sources>) -> Result<(), sources::Refusal> {
    if !ids::entry(&id) {
        return Err(sources::Refusal::Invalid);
    }
    kept.remove(&id)
}

/// Every download on this computer whose title has all these words. Never a link.
#[tauri::command]
pub async fn search_sources(
    words: String,
    kept: State<'_, Sources>,
) -> Result<Vec<sources::Found>, sources::Refusal> {
    let (folder, all) = kept.searchable();
    let words: String = words.chars().take(200).collect();
    tauri::async_runtime::spawn_blocking(move || sources::search(&folder, &all, &words))
        .await
        .map_err(|_| sources::Refusal::Failed)
}

/// Asks Windows for a folder, then puts a download in line. Nothing, when the picker is closed.
/// The links are the app's own copy of the source's: a page names a place in a list, and what it
/// showed there, and if the list has changed since, nothing starts.
#[tauri::command]
pub async fn start_download(
    window: WebviewWindow,
    source: String,
    place: usize,
    title: String,
    ask: String,
    through: Through,
    kept: State<'_, Sources>,
    list: State<'_, Arc<Downloads>>,
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<bool, downloads::Refusal> {
    if !ids::entry(&source) {
        return Err(downloads::Refusal::Invalid);
    }
    let (source_name, item) = kept
        .item(&source, place, &title)
        .ok_or(downloads::Refusal::Missing)?;
    let web = |uri: &String| sources::link(uri) == Some(sources::Link::Web);
    let (links, parts): (Vec<String>, Vec<Vec<String>>) = match through {
        Through::Direct => (item.uris.into_iter().filter(web).collect(), Vec::new()),
        // What a host has is ready at once, and a magnet may have to be fetched: the first goes first.
        Through::RealDebrid => {
            if !debrid.signed_in() {
                return Err(downloads::Refusal::SignedOut);
            }
            let (mut links, magnets): (Vec<String>, Vec<String>) =
                item.uris.into_iter().partition(web);
            links.extend(magnets);
            (links, item.uri_groups)
        }
    };
    if links.is_empty() && parts.is_empty() {
        return Err(downloads::Refusal::Unlinked);
    }
    let every: Vec<String> = links
        .iter()
        .chain(parts.iter().flatten())
        .cloned()
        .collect();
    if list.has_link(&every) {
        return Err(downloads::Refusal::Duplicate);
    }
    let Some(folder) = pick_folder(&window, short(&ask)).await? else {
        return Ok(false);
    };
    list.add(
        uuid::Uuid::new_v4().to_string(),
        item.title,
        source_name,
        through,
        links,
        parts,
        folder,
        now(),
    )?;
    Ok(true)
}

async fn pick_folder(
    window: &WebviewWindow,
    title: String,
) -> Result<Option<PathBuf>, downloads::Refusal> {
    // As `pick`: no script can answer Windows' picker.
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("SHELF_PICK_FOLDER") {
        return Ok(Some(PathBuf::from(path)));
    }
    let dialog = window.dialog().file().set_parent(window).set_title(title);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|_| downloads::Refusal::Failed)?;
    Ok(picked.and_then(|folder| folder.into_path().ok()))
}

/// What is being downloaded, waiting or finished, and how far along.
#[tauri::command]
pub fn downloads_now(list: State<'_, Arc<Downloads>>) -> Vec<downloads::View> {
    list.all()
}

fn download_id(id: &str) -> Result<(), downloads::Refusal> {
    if ids::entry(id) {
        Ok(())
    } else {
        Err(downloads::Refusal::Invalid)
    }
}

#[tauri::command]
pub fn pause_download(
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    list.pause(&id)
}

#[tauri::command]
pub fn resume_download(
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    list.resume(&id)
}

/// Takes a download off the list: unfinished, what it had goes too; finished, the file stays.
#[tauri::command]
pub async fn remove_download(
    id: String,
    list: State<'_, Arc<Downloads>>,
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    // A torrent this download put on the account goes with it, to free the place it takes there.
    if let Some(torrent) = list.remove(&id)? {
        debrid.delete_torrent(&torrent).await;
    }
    Ok(())
}

/// Opens the folder of a finished download in Explorer, the file selected. Showing, and never opening:
/// nothing downloaded is started from here (ADR 007, decision 10).
#[tauri::command]
pub fn show_download(
    app: AppHandle,
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    let file = list.finished_file(&id)?;
    if !file.is_file() {
        return Err(downloads::Refusal::Missing);
    }
    app.opener()
        .reveal_item_in_dir(&file)
        .map_err(|_| downloads::Refusal::Refused)
}

/// Whether Real-Debrid is signed in, as much as a page may know. Never a token.
#[tauri::command]
pub async fn real_debrid_account(
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<real_debrid::Account, downloads::Refusal> {
    Ok(debrid.account().await)
}

/// Asks Real-Debrid for a code for the person to enter on its own page.
#[tauri::command]
pub async fn real_debrid_sign_in(
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<real_debrid::Account, downloads::Refusal> {
    debrid
        .inner()
        .clone()
        .begin_sign_in()
        .await
        .map_err(|_| downloads::Refusal::Failed)
}

#[tauri::command]
pub fn real_debrid_cancel_sign_in(debrid: State<'_, Arc<RealDebrid>>) {
    debrid.cancel_sign_in();
}

/// Ends the sign-in here and at Real-Debrid. What was downloaded stays.
#[tauri::command]
pub async fn real_debrid_sign_out(
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<(), downloads::Refusal> {
    debrid.sign_out().await;
    Ok(())
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
