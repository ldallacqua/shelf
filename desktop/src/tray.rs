//! The tray, where the app goes on counting with its window closed (ADR 005, section 12).

use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Result};

use crate::autostart;

/// The menu's words, in the language Windows is in. The site's are the page's, and no page is open.
struct Words {
    open: &'static str,
    start_with_windows: &'static str,
    quit: &'static str,
}

const ENGLISH: Words = Words {
    open: "Open Shelf",
    start_with_windows: "Start with Windows",
    quit: "Quit, and stop counting hours",
};

const PORTUGUESE: Words = Words {
    open: "Abrir o Shelf",
    start_with_windows: "Iniciar com o Windows",
    quit: "Sair e parar de contar horas",
};

fn words() -> &'static Words {
    if crate::language::portuguese() {
        &PORTUGUESE
    } else {
        &ENGLISH
    }
}

const OPEN: &str = "open";
const START_WITH_WINDOWS: &str = "start-with-windows";
const QUIT: &str = "quit";

/// Quit: the app ends, and with it the counting of hours.
pub fn quit(app: &AppHandle) {
    app.exit(0);
}

/// The tray's Start with Windows check, kept so Settings can change it too.
struct StartingCheck(CheckMenuItem<tauri::Wry>);

/// Settings changed starting with Windows: the tray's check says what is now so.
pub fn starting_changed(app: &AppHandle) {
    if let Some(check) = app.try_state::<StartingCheck>() {
        let _ = check.0.set_checked(autostart::enabled());
    }
}

pub fn add(app: &AppHandle) -> Result<()> {
    let words = words();
    let open = MenuItem::with_id(app, OPEN, words.open, true, None::<&str>)?;
    let starting = CheckMenuItem::with_id(
        app,
        START_WITH_WINDOWS,
        words.start_with_windows,
        autostart::available(),
        autostart::enabled(),
        None::<&str>,
    )?;
    let line = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, QUIT, words.quit, true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &starting, &line, &quit])?;

    app.manage(StartingCheck(starting.clone()));
    let toggled = starting.clone();
    let mut tray = TrayIconBuilder::with_id("shelf")
        .tooltip("Shelf")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(move |app, event| match event.id().as_ref() {
            OPEN => crate::show_shelf(app),
            START_WITH_WINDOWS => {
                let on = toggled.is_checked().unwrap_or(false);
                if let Err(error) = autostart::set(on) {
                    eprintln!("could not change starting with Windows: {error}");
                    let _ = toggled.set_checked(autostart::enabled());
                }
            }
            QUIT => self::quit(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::show_shelf(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
