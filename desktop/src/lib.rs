//! Shelf for Windows (ADR 005): the hosted Shelf in a window of its own, and
//! the few commands its pages may ask of this computer.

mod commands;
mod ids;
mod launch;
mod launchers;
mod navigation;
mod steam;

use std::net::{TcpStream, ToSocketAddrs};
use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use tauri::ipc::CapabilityBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Manager, State, Url, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use launchers::Launchers;
use navigation::Decision;

/// The Shelf a release build opens.
const PRODUCTION: &str = "https://shelf-ldallacqua.vercel.app";

/// How long Shelf has to answer before the app says it cannot be reached.
const REACH_TIMEOUT: Duration = Duration::from_secs(10);

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

/// Asked by the app's own page: Shelf's address once its server answers, or
/// `unreachable`, and the page says so and offers to try again.
#[tauri::command]
async fn open_shelf(shelf: State<'_, Shelf>) -> Result<String, String> {
    let url = shelf.0.clone();
    let answered = tauri::async_runtime::spawn_blocking({
        let url = url.clone();
        move || reachable(&url)
    })
    .await
    .unwrap_or(false);
    if answered {
        Ok(url.to_string())
    } else {
        Err("unreachable".into())
    }
}

pub fn run() {
    tauri::Builder::default()
        // A second start brings the first window forward.
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            desktop_info,
            open_shelf,
            commands::launcher,
            commands::choose_launcher,
            commands::forget_launcher,
            commands::show_launcher,
            commands::play,
            commands::steam_installed,
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
                    .permission("allow-steam-installed"),
            )?;
            app.manage(Shelf(shelf.clone()));
            let folder = match data_dir() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            app.manage(Launchers::open(&folder));

            let navigating = app.handle().clone();
            let opening = app.handle().clone();
            let mut window =
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                    .title("Shelf")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(960.0, 600.0)
                    .center()
                    .on_navigation(move |url| {
                        let decision = navigation::decide(url, &shelf);
                        let stays = decision == Decision::Stay;
                        hand_off(&navigating, url, decision);
                        stays
                    })
                    .on_new_window(move |url, _| {
                        hand_off(&opening, &url, navigation::decide_new_window(&url));
                        NewWindowResponse::Deny
                    });
            if let Some(dir) = data_dir() {
                window = window.data_directory(dir);
            }
            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Shelf for Windows could not start");
}
