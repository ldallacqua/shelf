//! Starting with Windows, in the tray (ADR 005, section 12), so a game opened from Steam counts
//! without opening Shelf first. On from the first start of a version that counts, and the
//! tray's menu turns it off. The uninstaller removes the same value. A development build never
//! writes to the registry.

use std::fs;
use std::path::Path;

/// The value under Windows' Run key, as the installer's template names it.
#[cfg(windows)]
const VALUE: &str = "Shelf";
#[cfg(windows)]
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
/// What a start from Windows passes: no window, only the tray.
pub const BACKGROUND: &str = "--background";
/// Written once it has been turned on, so turning it off stays off.
const ASKED: &str = "start-with-windows.asked";

/// Whether this build may touch the registry.
pub const fn available() -> bool {
    cfg!(all(windows, not(debug_assertions)))
}

#[cfg(windows)]
pub fn enabled() -> bool {
    available()
        && winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey(RUN_KEY)
            .and_then(|key| key.get_value::<String, _>(VALUE))
            .is_ok()
}

#[cfg(not(windows))]
pub fn enabled() -> bool {
    false
}

#[cfg(windows)]
pub fn set(on: bool) -> std::io::Result<()> {
    if !available() {
        return Ok(());
    }
    let (key, _) =
        winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER).create_subkey(RUN_KEY)?;
    if on {
        let program = std::env::current_exe()?;
        key.set_value(VALUE, &format!("\"{}\" {BACKGROUND}", program.display()))
    } else {
        match key.delete_value(VALUE) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error),
            _ => Ok(()),
        }
    }
}

#[cfg(not(windows))]
pub fn set(_on: bool) -> std::io::Result<()> {
    Ok(())
}

/// On, the first time only. After that it is as the tray's menu left it, and if it is on the
/// value is written again, in case the program has moved.
pub fn first_start(folder: &Path) {
    if !available() {
        return;
    }
    let asked = folder.join(ASKED);
    let on = !asked.exists() || enabled();
    if let Err(error) = set(on) {
        eprintln!("could not set starting with Windows: {error}");
        return;
    }
    let _ = fs::create_dir_all(folder);
    let _ = fs::write(asked, "");
}
