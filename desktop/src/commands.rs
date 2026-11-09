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
use crate::saves::{self, Caps, Checked, Refusal as SaveRefusal, Saves};
use crate::shortcut::{self, Pointed};
use crate::source_window::{self, ReadingAll, SourceWindow};
use crate::sources::{self, Reading, Source, Sources};
use crate::steam;
use crate::tracker::{Session, Tracker};
use crate::updates::{ReadyView, Updates};

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
    /// Its saves are being backed up or put back: Play waits for that (ADR 008, section 6).
    Busy,
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
    list: State<'_, Arc<Downloads>>,
) -> Result<Option<LauncherView>, Refusal> {
    entry_id(&entry)?;
    // What was downloaded for this game, if anything was: the file is most likely there.
    let start = list
        .folder_for_game(&entry)
        .filter(|folder| folder.is_dir());
    let picked = pick(&window, short(&title), short(&files), start).await?;
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
    start: Option<PathBuf>,
) -> Result<Option<PathBuf>, Refusal> {
    // A development build can be handed the file instead, so `pnpm desktop:check`
    // goes through choosing without a picker no script can answer.
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("SHELF_PICK") {
        return Ok(Some(PathBuf::from(path)));
    }
    let mut dialog = window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .add_filter(files, &["exe", "bat", "lnk", "url"]);
    if let Some(start) = start {
        dialog = dialog.set_directory(start);
    }
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
/// Steam, which the window hands over. A game whose saves are kept has them looked at
/// first, unless the page says to skip that (`check` false): the person chose to play
/// with what is here.
#[tauri::command]
pub async fn play(app: AppHandle, entry: String, check: Option<bool>) -> Result<Played, Refusal> {
    entry_id(&entry)?;
    let launcher = app.state::<Launchers>().get(&entry).ok_or(Refusal::Unset)?;
    // Off a page's thread: the look at its saves reads disks, and may put a snapshot back.
    tauri::async_runtime::spawn_blocking(move || {
        start_game(&app, &entry, &launcher, check != Some(false))
    })
    .await
    .map_err(|_| Refusal::Failed)?
}

/// What Play did (ADR 008, section 7).
#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct Played {
    /// The game was started, or already was. Not while its saves wait for a choice.
    started: bool,
    /// What the look at its saves found: none when they aren't kept, or the person said to skip it.
    saves: Option<Checked>,
}

/// A backup or a restore of the game's saves is waited for this long before Play gives up.
const SAVES_WAITED: Duration = Duration::from_secs(20);

fn start_game(
    app: &AppHandle,
    entry: &str,
    launcher: &Launcher,
    check: bool,
) -> Result<Played, Refusal> {
    let games = app.state::<Games>();
    let already = Played {
        started: true,
        saves: None,
    };
    if games.is_starting(entry, now()) {
        return Ok(already);
    }
    let rules = rules_here();
    let target = target_of(Some(&launcher.path), &[]);
    if let Some(running) = processes::snapshot()
        && !games
            .seen(entry, &target, &running, &rules)
            .confirmed
            .is_empty()
    {
        return Ok(already);
    }
    let saves = if check {
        look_before_play(app, entry)?
    } else {
        None
    };
    // Another Play may have waited for the same look, and started the game meanwhile.
    if games.is_starting(entry, now()) {
        return Ok(already);
    }
    if saves == Some(Checked::Choose) {
        return Ok(Played {
            started: false,
            saves,
        });
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
    let at = now();
    games.launched(
        entry,
        Launch::new(
            root,
            processes::now_as_windows_counts(at),
            at,
            &running::key(&file),
            &rules,
        ),
    );
    follow(app.clone(), &app.state::<Following>());
    Ok(Played {
        started: true,
        saves,
    })
}

/// The look at a kept game's saves before it starts (ADR 008, section 7): none for a game whose saves
/// aren't kept. A backup or restore of it going on is waited for, and a restore cut short that couldn't
/// be undone keeps Play waiting, as it is never played over.
fn look_before_play(app: &AppHandle, entry: &str) -> Result<Option<Checked>, Refusal> {
    let saves = app.state::<Saves>();
    let kept = saves.game(entry);
    if !kept.on {
        return Ok(None);
    }
    let waited = std::time::Instant::now();
    let _busy = loop {
        match saves.begin(entry) {
            Ok(busy) => break busy,
            Err(_) if waited.elapsed() < SAVES_WAITED => {
                std::thread::sleep(Duration::from_millis(250));
            }
            Err(_) => return Err(Refusal::Busy),
        }
    };
    let setup = set_up(app, &saves, entry, &kept.title, &kept.apps);
    Ok(Some(saves.before_play(entry, &setup, now())))
}

/// A game's sitting ended (`watch.rs`): its saves, when kept, are backed up unless they are what this PC
/// knows, and a notification says what needs the person (ADR 008, section 7). On a thread of its own, as
/// it reads disks. Nothing when the game runs on, or its saves are already being worked on.
pub fn after_session(app: &AppHandle, entry: String) {
    let app = app.clone();
    std::thread::spawn(move || {
        let saves = app.state::<Saves>();
        let kept = saves.game(&entry);
        if !kept.on || running_now(&app, &entry, &kept.apps) {
            return;
        }
        let Ok(_busy) = saves.begin(&entry) else {
            return;
        };
        let setup = set_up(&app, &saves, &entry, &kept.title, &kept.apps);
        if let Some(needs) = saves.after_session(&entry, &setup, now()) {
            saves::notice::show(&app, &kept.title, needs);
        }
    });
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
/// Whether Shelf starts with Windows, in the tray (ADR 005, section 12), and whether this build
/// may change it: a development build never writes to the registry.
#[derive(Serialize)]
pub struct Starting {
    available: bool,
    on: bool,
}

fn starting() -> Starting {
    Starting {
        available: crate::autostart::available(),
        on: crate::autostart::enabled(),
    }
}

/// Starting with Windows, as Settings shows it beside the tray's own check.
#[tauri::command]
pub fn start_with_windows() -> Starting {
    starting()
}

/// Turns starting with Windows on or off from Settings; the tray's check follows.
#[tauri::command]
pub fn set_start_with_windows(app: AppHandle, on: bool) -> Result<Starting, Refusal> {
    crate::autostart::set(on).map_err(|_| Refusal::Failed)?;
    crate::tray::starting_changed(&app);
    Ok(starting())
}

#[tauri::command]
pub fn download_sources(kept: State<'_, Sources>) -> Vec<Source> {
    kept.all()
}

/// What the person just asked to read, by itself, and through a window they can see if the address
/// only answers a browser.
async fn read_as_asked(
    app: &AppHandle,
    url: &url::Url,
    etag: Option<&str>,
    ask: &str,
) -> Result<Reading, sources::Refusal> {
    let version = app.package_info().version.to_string();
    match sources::read(url, etag, &version).await {
        Err(sources::Refusal::Browser) => {
            let reader = app.state::<SourceWindow>();
            let bytes = reader.read(app, url, ask).await?;
            Ok(Reading::Read { bytes, etag: None })
        }
        read => read,
    }
}

/// Reads the source at an address the person pasted, and keeps it. Nothing is downloaded.
#[tauri::command]
pub async fn add_source(
    app: AppHandle,
    url: String,
    ask: Option<String>,
    kept: State<'_, Sources>,
) -> Result<Source, sources::Refusal> {
    let url = sources::address(&url)?;
    if kept.has_address(url.as_str()) {
        return Err(sources::Refusal::Duplicate);
    }
    let ask = short(ask.as_deref().unwrap_or("Shelf"));
    let Reading::Read { bytes, etag } = read_as_asked(&app, &url, None, &ask).await? else {
        // Asked with no `ETag`, nothing can answer that it has not changed.
        return Err(sources::Refusal::Unreachable);
    };
    let feed = sources::parse(&bytes)?;
    kept.add(
        uuid::Uuid::new_v4().to_string(),
        url.to_string(),
        None,
        feed,
        etag,
        now(),
    )
}

/// Asks Windows for a source a person saved, for an address that won't answer the app, and keeps it, or
/// gives the source named a new list from it. Nothing, when the picker is closed. Nothing is downloaded.
#[tauri::command]
pub async fn add_source_file(
    window: WebviewWindow,
    ask: String,
    files: String,
    replacing: Option<String>,
    kept: State<'_, Sources>,
) -> Result<Option<Source>, sources::Refusal> {
    if replacing.as_deref().is_some_and(|id| !ids::entry(id)) {
        return Err(sources::Refusal::Invalid);
    }
    let Some(path) = pick_source(&window, short(&ask), short(&files)).await? else {
        return Ok(None);
    };
    let name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    // A list can be large.
    let feed = tauri::async_runtime::spawn_blocking(move || sources::read_file(&path))
        .await
        .map_err(|_| sources::Refusal::Failed)??;
    let source = match replacing {
        Some(id) => kept.replace(&id, Some(name), feed, None, now())?,
        None => kept.add(
            uuid::Uuid::new_v4().to_string(),
            format!("file:{name}"),
            Some(name),
            feed,
            None,
            now(),
        )?,
    };
    Ok(Some(source))
}

async fn pick_source(
    window: &WebviewWindow,
    title: String,
    files: String,
) -> Result<Option<PathBuf>, sources::Refusal> {
    // As `pick`: no script can answer Windows' picker.
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("SHELF_PICK_SOURCE") {
        return Ok(Some(PathBuf::from(path)));
    }
    let dialog = window
        .dialog()
        .file()
        .set_parent(window)
        .set_title(title)
        .add_filter(files, &["json", "txt"]);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_file())
        .await
        .map_err(|_| sources::Refusal::Failed)?;
    Ok(picked.and_then(|file| file.into_path().ok()))
}

/// Reads a source again by its id. If that fails, the list it has stays.
#[tauri::command]
pub async fn read_source_again(
    app: AppHandle,
    id: String,
    ask: Option<String>,
    kept: State<'_, Sources>,
) -> Result<Source, sources::Refusal> {
    if !ids::entry(&id) {
        return Err(sources::Refusal::Invalid);
    }
    let (address, etag) = kept.address(&id).ok_or(sources::Refusal::Missing)?;
    let url = sources::address(&address)?;
    let ask = short(ask.as_deref().unwrap_or("Shelf"));
    match read_as_asked(&app, &url, etag.as_deref(), &ask).await? {
        Reading::Unchanged => kept.touch(&id, now()),
        Reading::Read { bytes, etag } => {
            kept.replace(&id, None, sources::parse(&bytes)?, etag, now())
        }
    }
}

/// How a Read all ended.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllRead {
    read: usize,
    failed: usize,
    /// The person closed a window, so the rest weren't read.
    stopped: bool,
}

/// Reads every source with an address, one at a time, opening a window for those that only answer a
/// browser, one at a time. Closing a window stops it: that is someone saying enough, and the next would
/// only open another. Sources saved in a file have nothing to read from.
#[tauri::command]
pub async fn read_all_sources(
    app: AppHandle,
    ask: String,
    kept: State<'_, Sources>,
    reader: State<'_, SourceWindow>,
) -> Result<AllRead, sources::Refusal> {
    let list: Vec<Source> = kept
        .all()
        .into_iter()
        .filter(|each| each.file.is_none())
        .collect();
    {
        let mut reading = reader.reading_all.lock().unwrap();
        if reading.is_some() {
            return Err(sources::Refusal::Failed);
        }
        *reading = Some(ReadingAll {
            done: 0,
            total: list.len(),
        });
    }
    let ask = short(&ask);
    let mut outcome = AllRead {
        read: 0,
        failed: 0,
        stopped: false,
    };
    for (at, source) in list.iter().enumerate() {
        *reader.reading_all.lock().unwrap() = Some(ReadingAll {
            done: at,
            total: list.len(),
        });
        let read = async {
            let (address, etag) = kept.address(&source.id).ok_or(sources::Refusal::Missing)?;
            let url = sources::address(&address)?;
            match read_as_asked(&app, &url, etag.as_deref(), &ask).await? {
                Reading::Unchanged => kept.touch(&source.id, now()),
                Reading::Read { bytes, etag } => {
                    kept.replace(&source.id, None, sources::parse(&bytes)?, etag, now())
                }
            }
        };
        match read.await {
            Ok(_) => outcome.read += 1,
            Err(sources::Refusal::Closed) => {
                outcome.stopped = true;
                break;
            }
            Err(why) => {
                kept.failed_reading(&source.id, why, now());
                outcome.failed += 1;
            }
        }
    }
    *reader.reading_all.lock().unwrap() = None;
    Ok(outcome)
}

/// How far along a Read all is, for a page opened meanwhile too.
#[tauri::command]
pub fn reading_all_sources(reader: State<'_, SourceWindow>) -> Option<ReadingAll> {
    *reader.reading_all.lock().unwrap()
}

/// A page in the window that reads a source hands over what the address showed. Asked of that window
/// alone, it is read as any source is: only ever as a list.
#[tauri::command]
pub fn deliver_source(window: WebviewWindow, text: String, reader: State<'_, SourceWindow>) {
    let from_there = window
        .url()
        .is_ok_and(|url| window.label() == source_window::LABEL && sources::allowed(&url));
    if from_there {
        reader.deliver(text);
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
    entry: Option<String>,
    kept: State<'_, Sources>,
    list: State<'_, Arc<Downloads>>,
    debrid: State<'_, Arc<RealDebrid>>,
) -> Result<bool, downloads::Refusal> {
    if !ids::entry(&source) || entry.as_deref().is_some_and(|entry| !ids::entry(entry)) {
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
        entry,
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

/// Opens a finished download's archives, into a folder beside them. Nothing that comes out is started
/// (ADR 007, decision 10).
#[tauri::command]
pub fn extract_download(
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    list.extract(&id)
}

/// Stops opening them, and what had come out goes. The archives stay.
#[tauri::command]
pub fn cancel_extraction(
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    list.cancel_extraction(&id)
}

/// Opens the folder of a finished download in Explorer, with what it came to selected. Showing, and never
/// opening: nothing downloaded is started from here (ADR 007, decision 10).
#[tauri::command]
pub fn show_download(
    app: AppHandle,
    id: String,
    list: State<'_, Arc<Downloads>>,
) -> Result<(), downloads::Refusal> {
    download_id(&id)?;
    let file = list.finished_file(&id)?;
    // A set of files, or what came out of an archive, is a folder.
    if !file.exists() {
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

// --- A game's saves (ADR 008) ---------------------------------------------------------------------
//
// A page names a game by its entry, its title and its Steam apps, and a snapshot by its id. Folders
// come from Windows' picker alone, and no command reads a save's bytes or deletes a snapshot.

/// The Steam apps a page names, digits only, fifty at most.
fn apps_of(apps: Vec<String>) -> Vec<String> {
    apps.into_iter()
        .filter(|app| ids::steam_app(app))
        .take(50)
        .collect()
}

/// Whether the game is starting or running now: its saves are never read or written then.
fn running_now(app: &AppHandle, entry: &str, apps: &[String]) -> bool {
    app.state::<Games>().is_starting(entry, now()) || !confirmed(app, entry, apps).is_empty()
}

/// The file a game is started from, or what its shortcut points at: where `<base>` is worked out from.
fn game_file(app: &AppHandle, entry: &str) -> Option<PathBuf> {
    let kept = app.state::<Launchers>().get(entry)?;
    Some(match shortcut::pointed_at(&kept.path) {
        Pointed::Program(program) => program,
        _ => kept.path,
    })
}

/// The game set up on this computer, with what is here of the manifest.
fn set_up(
    app: &AppHandle,
    saves: &Saves,
    entry: &str,
    title: &str,
    apps: &[String],
) -> saves::Setup {
    let lookup = saves.manifest.held();
    let file = game_file(app, entry);
    saves.setup(entry, file.as_deref(), lookup.as_deref(), title, apps)
}

/// What every save command starts with: the game's file on this computer, the manifest read (or
/// what is here of it), and the game set up. `work` runs on a thread of its own, as it reads disks.
async fn with_saves<T: Send + 'static>(
    app: &AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    work: impl FnOnce(
        &AppHandle,
        &Saves,
        &str,
        &str,
        &[String],
        saves::Setup,
        bool,
    ) -> Result<T, SaveRefusal>
    + Send
    + 'static,
) -> Result<T, SaveRefusal> {
    if !ids::entry(&entry) {
        return Err(SaveRefusal::Invalid);
    }
    let apps = apps_of(apps);
    let title = short(&title);
    if app.state::<Launchers>().get(&entry).is_none() {
        return Err(SaveRefusal::Unset);
    }
    let version = app.package_info().version.to_string();
    let read = app
        .state::<Saves>()
        .manifest
        .lookup(&version, now())
        .await
        .is_ok();
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let saves = app.state::<Saves>();
        let setup = set_up(&app, &saves, &entry, &title, &apps);
        let done = work(&app, &saves, &entry, &title, &apps, setup, read);
        // What the game is called and its Steam apps, for when no page asks: after a session, before Play.
        saves.remember(&entry, &title, &apps);
        done
    })
    .await
    .map_err(|_| SaveRefusal::Failed)?
}

/// A game's saves on this computer: where they were found, where they go, and their history.
#[tauri::command]
pub async fn saves(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
) -> Result<saves::View, SaveRefusal> {
    with_saves(
        &app,
        entry,
        title,
        apps,
        |_, saves, entry, _, _, setup, read| Ok(saves.view(entry, &setup, read)),
    )
    .await
}

/// Turns a game's saves on or off. On, a first snapshot is made at once, unless the game is running.
#[tauri::command]
pub async fn turn_saves(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    on: bool,
) -> Result<saves::View, SaveRefusal> {
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            saves.set_on(entry, on, title)?;
            if on
                && !running_now(app, entry, apps)
                && let Ok(_busy) = saves.begin(entry)
            {
                // Nothing found yet is said on the page, not refused: the person may add a folder next.
                let _ = saves.back_up(entry, title, &setup, now(), None);
            }
            Ok(saves.view(entry, &setup, read))
        },
    )
    .await
}

/// A snapshot of the game's saves now, unless it is what the latest holds.
#[tauri::command]
pub async fn back_up_saves(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
) -> Result<saves::View, SaveRefusal> {
    with_saves(
        &app,
        entry,
        title,
        apps,
        |app, saves, entry, title, apps, setup, read| {
            if running_now(app, entry, apps) {
                return Err(SaveRefusal::Running);
            }
            let _busy = saves.begin(entry)?;
            saves.back_up(entry, title, &setup, now(), None)?;
            Ok(saves.view(entry, &setup, read))
        },
    )
    .await
}

/// How far a game's backup or restore has got, while one is going: the page asks as it waits.
#[tauri::command]
pub fn save_progress(entry: String, saves: State<'_, Saves>) -> Option<saves::progress::Progress> {
    saves.board.of(&entry)
}

/// Puts a snapshot back, what is here backed up first. Never while the game runs.
#[tauri::command]
pub async fn restore_saves(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    snapshot: String,
) -> Result<saves::View, SaveRefusal> {
    if !ids::entry(&snapshot) {
        return Err(SaveRefusal::Invalid);
    }
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, _, apps, setup, read| {
            if running_now(app, entry, apps) {
                return Err(SaveRefusal::Running);
            }
            let _busy = saves.begin(entry)?;
            saves.restore(entry, &snapshot, &setup, now())?;
            Ok(saves.view(entry, &setup, read))
        },
    )
    .await
}

async fn pick_save_folder(
    window: &WebviewWindow,
    title: String,
    start: Option<PathBuf>,
) -> Result<Option<PathBuf>, SaveRefusal> {
    // As `pick`: no script can answer Windows' picker.
    #[cfg(debug_assertions)]
    if let Ok(path) = std::env::var("SHELF_PICK_SAVES") {
        return Ok(Some(PathBuf::from(path)));
    }
    let mut dialog = window.dialog().file().set_parent(window).set_title(title);
    if let Some(start) = start.filter(|start| start.is_dir()) {
        dialog = dialog.set_directory(start);
    }
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|_| SaveRefusal::Failed)?;
    Ok(picked.and_then(|folder| folder.into_path().ok()))
}

/// Asks Windows for a folder that holds the game's saves, and adds it. Nothing, when the picker is
/// closed. Refused when it holds the game itself or more than a game's saves, or is outside every
/// folder a placeholder names, the folder named.
#[tauri::command]
pub async fn add_save_folder(
    window: WebviewWindow,
    entry: String,
    title: String,
    apps: Vec<String>,
    ask: String,
) -> Result<Option<saves::View>, FolderRefusal> {
    if !ids::entry(&entry) {
        return Err(SaveRefusal::Invalid.into());
    }
    let start = window
        .app_handle()
        .state::<Saves>()
        .folders
        .documents
        .clone();
    let Some(folder) = pick_save_folder(&window, short(&ask), start).await? else {
        return Ok(None);
    };
    let shown = folder.display().to_string();
    let app = window.app_handle().clone();
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            saves.add(entry, &folder, &setup)?;
            let again = set_up(app, saves, entry, title, apps);
            Ok(Some(saves.view(entry, &again, read)))
        },
    )
    .await
    .map_err(|why| FolderRefusal::of(why, shown))
}

/// A folder Windows' picker handed over and the app refused, named for the page to say which: the
/// picker hides some folders, AppData among them, and what it hands over is not always what was meant.
/// Any other refusal is its word alone, as every saves command's is.
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum FolderRefusal {
    Word(SaveRefusal),
    Named { why: SaveRefusal, folder: String },
}

impl FolderRefusal {
    fn of(why: SaveRefusal, folder: String) -> Self {
        match why {
            SaveRefusal::Wide | SaveRefusal::GameFolder | SaveRefusal::Outside => {
                FolderRefusal::Named { why, folder }
            }
            other => FolderRefusal::Word(other),
        }
    }
}

impl From<SaveRefusal> for FolderRefusal {
    fn from(why: SaveRefusal) -> Self {
        FolderRefusal::Word(why)
    }
}

/// Takes a location away: a folder added is forgotten, one the list names is left out from now on.
#[tauri::command]
pub async fn remove_save_location(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    location: String,
) -> Result<saves::View, SaveRefusal> {
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            if !setup.locations.iter().any(|each| each.text == location) {
                return Err(SaveRefusal::Invalid);
            }
            saves.remove(entry, &location)?;
            let again = set_up(app, saves, entry, title, apps);
            Ok(saves.view(entry, &again, read))
        },
    )
    .await
}

/// Which of the list's games this is, when several answer to its name; none goes back to the one
/// found first.
#[tauri::command]
pub async fn choose_save_game(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    chosen: Option<String>,
) -> Result<saves::View, SaveRefusal> {
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            if let Some(chosen) = &chosen {
                let offered = setup
                    .entry
                    .as_ref()
                    .is_some_and(|each| &each.title == chosen)
                    || setup.others.contains(chosen);
                if !offered {
                    return Err(SaveRefusal::Invalid);
                }
            }
            saves.choose_manifest(entry, chosen)?;
            let again = set_up(app, saves, entry, title, apps);
            Ok(saves.view(entry, &again, read))
        },
    )
    .await
}

/// Asks Windows for the game's own folder, `<base>`, when the one worked out from its file is wrong.
#[tauri::command]
pub async fn choose_game_folder(
    window: WebviewWindow,
    entry: String,
    title: String,
    apps: Vec<String>,
    ask: String,
) -> Result<Option<saves::View>, FolderRefusal> {
    if !ids::entry(&entry) {
        return Err(SaveRefusal::Invalid.into());
    }
    let start = game_file(window.app_handle(), &entry)
        .and_then(|file| file.parent().map(Path::to_path_buf));
    let Some(folder) = pick_save_folder(&window, short(&ask), start).await? else {
        return Ok(None);
    };
    let shown = folder.display().to_string();
    let app = window.app_handle().clone();
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            // The game's folder is never a disk's top, one of Windows' own, or one above them.
            let elsewhere = saves::paths::GameAt {
                base: None,
                ..setup.game.clone()
            };
            if saves::paths::too_wide(&folder, &saves.folders, &elsewhere) {
                return Err(SaveRefusal::Wide);
            }
            saves.set_base(entry, Some(folder))?;
            let again = set_up(app, saves, entry, title, apps);
            Ok(Some(saves.view(entry, &again, read)))
        },
    )
    .await
    .map_err(|why| FolderRefusal::of(why, shown))
}

/// Opens the folder of a snapshot in Explorer, its archive selected, for a save to be taken out by hand. A
/// service's is read onto this computer first.
#[tauri::command]
pub async fn show_save_snapshot(
    app: AppHandle,
    entry: String,
    snapshot: String,
) -> Result<(), SaveRefusal> {
    if !ids::entry(&entry) || !ids::entry(&snapshot) {
        return Err(SaveRefusal::Invalid);
    }
    let finding = app.clone();
    let archive = tauri::async_runtime::spawn_blocking(move || {
        finding.state::<Saves>().archive(&entry, &snapshot)
    })
    .await
    .map_err(|_| SaveRefusal::Failed)?
    .ok_or(SaveRefusal::Missing)?;
    app.opener()
        .reveal_item_in_dir(&archive)
        .map_err(|_| SaveRefusal::Failed)
}

/// This PC's place (ADR 008, section 8): the folder Shelf keeps in the one chosen, or this computer alone.
#[tauri::command]
pub fn save_place(saves: State<'_, Saves>) -> saves::PlaceView {
    saves.place_view()
}

/// Asks Windows for a folder to be this PC's place, one that a cloud client syncs, a network drive or a
/// USB drive, and takes this computer's history there. Nothing, when the picker is closed.
#[tauri::command]
pub async fn choose_save_place(
    window: WebviewWindow,
    ask: String,
) -> Result<Option<saves::PlaceView>, SaveRefusal> {
    #[cfg(debug_assertions)]
    let picked = match std::env::var("SHELF_PICK_SAVE_PLACE") {
        Ok(path) => Some(PathBuf::from(path)),
        Err(_) => pick_place(&window, short(&ask)).await?,
    };
    #[cfg(not(debug_assertions))]
    let picked = pick_place(&window, short(&ask)).await?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn_blocking(move || app.state::<Saves>().choose_place(&folder))
        .await
        .map_err(|_| SaveRefusal::Failed)?
        .map(Some)
}

async fn pick_place(window: &WebviewWindow, title: String) -> Result<Option<PathBuf>, SaveRefusal> {
    let dialog = window.dialog().file().set_parent(window).set_title(title);
    let picked = tauri::async_runtime::spawn_blocking(move || dialog.blocking_pick_folder())
        .await
        .map_err(|_| SaveRefusal::Failed)?;
    Ok(picked.and_then(|folder| folder.into_path().ok()))
}

/// Back to this computer alone. What is in the folder or the service stays there.
#[tauri::command]
pub fn forget_save_place(saves: State<'_, Saves>) -> Result<saves::PlaceView, SaveRefusal> {
    saves.forget_place()
}

/// Sends what waits on this computer to a service just chosen, on a thread of its own.
fn send_all_waiting(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || app.state::<Saves>().send_all_waiting());
}

/// Signs in to a service on its own page, in the default browser (ADR 008, phase 5), and makes it this
/// PC's place once that is done: what waits here goes to it. Answers when the browser comes back, Cancel
/// is pressed, or the time runs out. Shelf comes forward again after.
#[tauri::command]
pub async fn sign_in_save_cloud(
    app: AppHandle,
    service: String,
) -> Result<saves::PlaceView, saves::sign_in::Ended> {
    use saves::sign_in::Ended;
    let service = saves::cloud::Service::of(&service).ok_or(Ended::Unavailable)?;
    let cloud = app
        .state::<Saves>()
        .cloud(service)
        .ok_or(Ended::Unavailable)?;
    let opener = app.clone();
    let signed = cloud
        .sign_in(move |address| open_sign_in(&opener, address))
        .await;
    crate::show_shelf(&app);
    signed?;
    let choosing = app.clone();
    let place = tauri::async_runtime::spawn_blocking(move || {
        choosing.state::<Saves>().choose_cloud(service)
    })
    .await
    .map_err(|_| Ended::Refused)?
    .map_err(|_| Ended::Refused)?;
    send_all_waiting(&app);
    Ok(place)
}

/// The service's page, in the default browser. A development build pointed at `pnpm desktop:check`'s
/// stand-in asks for the page itself instead, which answers by sending it straight back with a code, so no
/// browser opens.
fn open_sign_in(app: &AppHandle, address: &str) -> bool {
    #[cfg(debug_assertions)]
    if std::env::var("SHELF_CLOUD_STAND_IN").is_ok() {
        let address = address.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = reqwest::get(address).await;
        });
        return true;
    }
    app.opener().open_url(address, None::<&str>).is_ok()
}

/// Stops waiting for the browser to come back from a service's page.
#[tauri::command]
pub fn cancel_save_sign_in(service: String, saves: State<'_, Saves>) {
    if let Some(cloud) =
        saves::cloud::Service::of(&service).and_then(|service| saves.cloud(service))
    {
        cloud.cancel_sign_in();
    }
}

/// Makes a service already signed in to this PC's place again.
#[tauri::command]
pub async fn use_save_cloud(
    app: AppHandle,
    service: String,
) -> Result<saves::PlaceView, SaveRefusal> {
    let service = saves::cloud::Service::of(&service).ok_or(SaveRefusal::Invalid)?;
    let choosing = app.clone();
    let place = tauri::async_runtime::spawn_blocking(move || {
        choosing.state::<Saves>().choose_cloud(service)
    })
    .await
    .map_err(|_| SaveRefusal::Failed)??;
    send_all_waiting(&app);
    Ok(place)
}

/// Signs out of a service: ended there where it can be, forgotten here. When it was this PC's place, this
/// computer alone is again; what is in the service stays there.
#[tauri::command]
pub async fn sign_out_save_cloud(
    app: AppHandle,
    service: String,
) -> Result<saves::PlaceView, SaveRefusal> {
    let service = saves::cloud::Service::of(&service).ok_or(SaveRefusal::Invalid)?;
    let saves = app.state::<Saves>();
    let cloud = saves.cloud(service).ok_or(SaveRefusal::Invalid)?;
    cloud.sign_out().await;
    if saves.place_view().cloud == Some(service) {
        return saves.forget_place();
    }
    Ok(saves.place_view())
}

/// Settles a choice between copies: this PC's (`keep` none) or one of the latest snapshots. Never while
/// the game runs.
#[tauri::command]
pub async fn keep_saves(
    app: AppHandle,
    entry: String,
    title: String,
    apps: Vec<String>,
    keep: Option<String>,
) -> Result<saves::View, SaveRefusal> {
    if keep.as_deref().is_some_and(|id| !ids::entry(id)) {
        return Err(SaveRefusal::Invalid);
    }
    with_saves(
        &app,
        entry,
        title,
        apps,
        move |app, saves, entry, title, apps, setup, read| {
            if running_now(app, entry, apps) {
                return Err(SaveRefusal::Running);
            }
            let _busy = saves.begin(entry)?;
            saves.keep(entry, title, &setup, now(), keep.as_deref())?;
            Ok(saves.view(entry, &setup, read))
        },
    )
    .await
}

/// The caps, the same for every game (ADR 008, section 4).
#[tauri::command]
pub fn save_caps(saves: State<'_, Saves>) -> Caps {
    saves.caps()
}

/// Changes the caps, kept within what Settings offers: never fewer than three snapshots.
#[tauri::command]
pub fn set_save_caps(
    most_mb: u32,
    kept: u32,
    saves: State<'_, Saves>,
) -> Result<Caps, SaveRefusal> {
    saves.set_caps(Caps { most_mb, kept })
}

/// A newer version, downloaded while the app ran and waiting for the owner's word (ADR 005, section 9).
#[tauri::command]
pub fn update_ready(updates: State<'_, Updates>) -> Option<ReadyView> {
    updates.ready()
}

/// Ends the app, installs what is waiting and opens Shelf again: returning means it could not. `busy`
/// while a game's saves are being backed up or put back, which the installer would cut short.
#[tauri::command]
pub fn install_update(updates: State<'_, Updates>, saves: State<'_, Saves>) -> Result<(), Refusal> {
    if saves.any_busy() {
        return Err(Refusal::Busy);
    }
    updates.install().map_err(|error| {
        eprintln!("could not install the update: {error}");
        Refusal::Failed
    })
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
    fn a_refused_folder_is_named_and_anything_else_is_a_word() {
        assert_eq!(
            serde_json::to_value(FolderRefusal::of(
                SaveRefusal::GameFolder,
                r"C:\Games\A Game".into()
            ))
            .unwrap(),
            serde_json::json!({ "why": "game-folder", "folder": r"C:\Games\A Game" })
        );
        assert_eq!(
            serde_json::to_value(FolderRefusal::of(SaveRefusal::Busy, r"C:\x".into())).unwrap(),
            serde_json::json!("busy")
        );
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
