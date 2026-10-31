//! Shelf for Windows (ADR 005): the hosted Shelf in a window of its own, and
//! the few commands its pages may ask of this computer.

mod commands;
mod ids;
mod launch;
mod launchers;
mod navigation;
mod processes;
mod running;
mod shortcut;
mod steam;

use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::{CapabilityBuilder, Channel};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::{StateFlags, WindowExt};

use launchers::Launchers;
use navigation::Decision;

/// The Shelf a release build opens.
const PRODUCTION: &str = "https://shelf-ldallacqua.vercel.app";

/// Run in every page before its own scripts: the window has no Windows bar,
/// so Shelf's header is the bar and draws the window's controls (ADR 005,
/// section 8). An app with Windows' bar never says it, and the site draws none.
const FRAMELESS: &str = "window.__SHELF_WINDOW__ = 'frameless'";

/// How long Shelf has to answer before the app says it cannot be reached.
const REACH_TIMEOUT: Duration = Duration::from_secs(10);

/// How long the splash waits to learn whether there is an update, before it
/// opens Shelf without one (ADR 005, section 9).
const UPDATE_CHECK: Duration = Duration::from_secs(5);

/// How long an update may take to download, at most.
const UPDATE_DOWNLOAD: Duration = Duration::from_secs(120);

/// How long the main window waits for Shelf's page before it is shown anyway.
const SHOW_AT_MOST: Duration = Duration::from_secs(15);

/// What the main window keeps of itself between starts: where it was and how
/// large. Not whether it had Windows' bar, which an app of 0.1.0 kept as yes
/// and would bring back, nor whether it was shown.
fn kept_state() -> StateFlags {
    StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED | StateFlags::FULLSCREEN
}

/// The Shelf a development build opens unless `SHELF_URL` names another: the
/// local server, as `pnpm dev` and `pnpm serve:test` serve it.
#[cfg(debug_assertions)]
const LOCAL: &str = "http://localhost:3300";

/// The Shelf this build opens: production in a release build; in a
/// development build the local server, or the address in `SHELF_URL`.
fn shelf_url() -> Url {
    #[cfg(debug_assertions)]
    {
        let address = std::env::var("SHELF_URL").unwrap_or_else(|_| LOCAL.into());
        if let Ok(url) = Url::parse(&address) {
            return url;
        }
    }
    Url::parse(PRODUCTION).expect("the production address is an address")
}

/// In a development build, `SHELF_DATA_DIR` keeps the web view's profile (and
/// so its sign-ins) and the files chosen apart from the installed app's:
/// `pnpm desktop:check` starts each run with empty ones.
fn data_dir() -> Option<PathBuf> {
    #[cfg(debug_assertions)]
    if let Ok(dir) = std::env::var("SHELF_DATA_DIR") {
        return Some(PathBuf::from(dir));
    }
    None
}

/// The Shelf this app opens, for the commands that need it.
struct Shelf(Url);

/// Whether Shelf's server takes a connection within the time it has.
fn reachable(shelf: &Url) -> bool {
    let (Some(host), Some(port)) = (shelf.host_str(), shelf.port_or_known_default()) else {
        return false;
    };
    let Ok(addresses) = (host, port).to_socket_addrs() else {
        return false;
    };
    addresses
        .into_iter()
        .any(|address| TcpStream::connect_timeout(&address, REACH_TIMEOUT).is_ok())
}

/// Opens an address the window does not keep: the default browser, or Steam.
fn hand_off(app: &AppHandle, url: &Url, decision: Decision) {
    match decision {
        Decision::Browser | Decision::Steam => {
            if let Err(error) = app.opener().open_url(url.as_str(), None::<&str>) {
                eprintln!("could not open {url}: {error}");
            }
        }
        Decision::Stay | Decision::Drop => {}
    }
}

#[derive(Serialize)]
struct DesktopInfo {
    version: String,
}

/// The app's version: how a page knows it is inside the app.
#[tauri::command]
fn desktop_info(app: AppHandle) -> DesktopInfo {
    DesktopInfo {
        version: app.package_info().version.to_string(),
    }
}

/// What the splash is told as the app starts.
#[derive(Clone, Serialize)]
#[serde(tag = "step", rename_all = "lowercase")]
enum Step {
    Checking,
    /// Bytes of the update so far, and of all of it when GitHub says.
    Downloading {
        done: u64,
        total: Option<u64>,
    },
    Installing,
    Opening,
}

/// Asked by the splash, first thing at every start (ADR 005, section 9): an
/// update, if there is one, is downloaded and installed, and the installer
/// starts the new version; otherwise Shelf opens in the main window, which
/// closes the splash once Shelf is there. `unreachable` when Shelf does not
/// answer, and the splash says so.
#[tauri::command]
async fn start(
    app: AppHandle,
    shelf: State<'_, Shelf>,
    on_step: Channel<Step>,
) -> Result<(), String> {
    // A development build has no releases to compare itself with.
    if cfg!(not(debug_assertions)) {
        update(&app, &on_step).await;
    }
    let _ = on_step.send(Step::Opening);
    let url = shelf.0.clone();
    let answered = tauri::async_runtime::spawn_blocking({
        let url = url.clone();
        move || reachable(&url)
    })
    .await
    .unwrap_or(false);
    if !answered {
        return Err("unreachable".into());
    }
    open_main(&app, url).map_err(|error| error.to_string())
}

/// Looks for a newer version on GitHub, and installs it: on Windows the
/// installer then ends this app and starts the new one, so returning means
/// there was none, or it could not be had, and Shelf opens as it is.
async fn update(app: &AppHandle, steps: &Channel<Step>) {
    use tauri_plugin_updater::UpdaterExt;

    let _ = steps.send(Step::Checking);
    let Ok(updater) = app.updater_builder().timeout(UPDATE_DOWNLOAD).build() else {
        return;
    };
    let update = match tokio::time::timeout(UPDATE_CHECK, updater.check()).await {
        Ok(Ok(Some(update))) => update,
        Ok(Ok(None)) => return,
        Ok(Err(error)) => {
            eprintln!("could not look for an update: {error}");
            return;
        }
        Err(_) => {
            eprintln!("GitHub did not say in time whether there is an update");
            return;
        }
    };
    let mut done = 0u64;
    let installed = update
        .download_and_install(
            |chunk, total| {
                done += chunk as u64;
                let _ = steps.send(Step::Downloading { done, total });
            },
            || {
                let _ = steps.send(Step::Installing);
            },
        )
        .await;
    if let Err(error) = installed {
        eprintln!("could not install the update: {error}");
    }
}

/// The main window, on Shelf, unseen until its page is there.
fn open_main(app: &AppHandle, shelf: Url) -> tauri::Result<()> {
    if let Some(main) = app.get_webview_window("main") {
        reveal(&main);
        return Ok(());
    }
    let navigating = app.clone();
    let opening = app.clone();
    let rules = shelf.clone();
    let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(shelf))
        .title("Shelf")
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 600.0)
        .center()
        .decorations(false)
        .visible(false)
        .initialization_script(FRAMELESS)
        .on_navigation(move |url| {
            let decision = navigation::decide(url, &rules);
            let stays = decision == Decision::Stay;
            hand_off(&navigating, url, decision);
            stays
        })
        .on_new_window(move |url, _| {
            hand_off(&opening, &url, navigation::decide_new_window(&url));
            NewWindowResponse::Deny
        })
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                reveal(&window);
            }
        });
    if let Some(dir) = data_dir() {
        window = window.data_directory(dir);
    }
    let main = window.build()?;
    // A Shelf slow to finish its page is shown anyway, rather than leave the splash up.
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SHOW_AT_MOST).await;
        reveal(&main);
    });
    Ok(())
}

/// The main window comes forward where it was last left, and the splash goes.
fn reveal(main: &WebviewWindow) {
    if main.is_visible().unwrap_or(false) {
        return;
    }
    // Restored only now: restoring a maximized window would show it before its page. Not in a
    // development build with a profile of its own, which keeps no window state (`run`).
    if data_dir().is_none() {
        let _ = main.restore_state(kept_state());
    }
    let _ = main.show();
    let _ = main.set_focus();
    if let Some(splash) = main.app_handle().get_webview_window("splash") {
        let _ = splash.close();
    }
}

pub fn run() {
    let builder = tauri::Builder::default();
    // A second start brings the first window forward. Not in a development
    // build, which would otherwise close itself and bring forward the
    // installed app, when it is open.
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| {
        let window = app
            .get_webview_window("main")
            .or_else(|| app.get_webview_window("splash"));
        if let Some(window) = window {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    // Where the window was is the installed app's to keep: a development build with a profile
    // of its own (`pnpm desktop:check`) neither reads it nor writes over it.
    let builder = if data_dir().is_none() {
        builder.plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(kept_state())
                .with_denylist(&["splash"])
                .skip_initial_state("main")
                .build(),
        )
    } else {
        builder
    };
    builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            start,
            commands::launcher,
            commands::choose_launcher,
            commands::forget_launcher,
            commands::show_launcher,
            commands::play,
            commands::steam_installed,
            commands::playable,
            commands::game_state,
            commands::stop_game,
            commands::force_stop_game,
        ])
        .setup(|app| {
            let shelf = shelf_url();
            // Shelf's own pages, and no other remote page, may ask for commands.
            app.add_capability(
                CapabilityBuilder::new("shelf")
                    .window("main")
                    .local(false)
                    .remote(format!("{}/*", shelf.origin().ascii_serialization()))
                    .permission("allow-desktop-info")
                    .permission("allow-launcher")
                    .permission("allow-choose-launcher")
                    .permission("allow-forget-launcher")
                    .permission("allow-show-launcher")
                    .permission("allow-play")
                    .permission("allow-steam-installed")
                    .permission("allow-playable")
                    .permission("allow-game-state")
                    .permission("allow-stop-game")
                    .permission("allow-force-stop-game")
                    // The window's own controls, in Shelf's header: this window only.
                    .permission("core:window:allow-minimize")
                    .permission("core:window:allow-toggle-maximize")
                    .permission("core:window:allow-close")
                    .permission("core:window:allow-is-maximized")
                    .permission("core:window:allow-start-dragging")
                    .permission("core:window:allow-internal-toggle-maximize"),
            )?;
            app.manage(Shelf(shelf.clone()));
            let folder = match data_dir() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            app.manage(Launchers::open(&folder));
            app.manage(running::Games::default());
            app.manage(commands::Following::default());

            // The splash first: it asks `start`, which opens Shelf when it is time.
            let mut splash =
                WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("index.html".into()))
                    .title("Shelf")
                    .inner_size(320.0, 360.0)
                    .resizable(false)
                    .maximizable(false)
                    .decorations(false)
                    .center()
                    .on_navigation(move |url| navigation::decide(url, &shelf) == Decision::Stay);
            if let Some(dir) = data_dir() {
                splash = splash.data_directory(dir);
            }
            splash.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Shelf for Windows could not start");
}
