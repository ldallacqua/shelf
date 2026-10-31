//! Starting a game from its file (ADR 005, section 5), as Explorer starts
//! one: Windows' own `ShellExecuteW`, verb `open`, in the file's folder. That
//! is what lets a game that needs administrator ask for it (starting it
//! directly fails with error 740), and what opens shortcuts and `.bat`
//! files; many games break when started from another folder.
//!
//! Windows answers with the process it started, when there is one: what
//! `running.rs` follows. A shortcut to a page or a file opened by another
//! program has none, and starting something never means the game is running.

use std::path::Path;

use crate::processes::Identity;

/// Why a file did not start.
#[derive(Debug, PartialEq, Eq)]
pub enum Failure {
    /// It is not there any more.
    Missing,
    /// Windows refused, or the person said no to its prompt.
    Refused,
}

/// The folder a file is started in: its own.
pub fn folder_of(file: &Path) -> Option<&Path> {
    file.parent()
        .filter(|folder| !folder.as_os_str().is_empty())
}

#[cfg(windows)]
pub fn start(file: &Path) -> Result<Option<Identity>, Failure> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::UI::Shell::{
        SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    if !file.is_file() {
        return Err(Failure::Missing);
    }
    let wide = |text: &std::ffi::OsStr| text.encode_wide().chain(Some(0)).collect::<Vec<u16>>();
    let verb = wide("open".as_ref());
    let target = wide(file.as_os_str());
    let folder = folder_of(file).map(|folder| wide(folder.as_os_str()));
    // SAFETY: a struct of plain values and null pointers, for which zeroes are valid.
    let mut asked: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    asked.cbSize = size_of::<SHELLEXECUTEINFOW>() as u32;
    asked.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC;
    asked.lpVerb = verb.as_ptr();
    asked.lpFile = target.as_ptr();
    asked.lpDirectory = folder
        .as_ref()
        .map_or(std::ptr::null(), |folder| folder.as_ptr());
    asked.nShow = SW_SHOWNORMAL;
    // SAFETY: every pointer in `asked` is to a NUL-terminated wide string that outlives the call.
    if unsafe { ShellExecuteExW(&mut asked) } == 0 {
        // Above 32 is success; 2 and 3 are "not found", anything else a refusal.
        return match asked.hInstApp as isize {
            2 | 3 => Err(Failure::Missing),
            _ => Err(Failure::Refused),
        };
    }
    if asked.hProcess.is_null() {
        return Ok(None);
    }
    let started = crate::processes::identity_of(asked.hProcess);
    // SAFETY: Windows handed this handle to be closed here, and it is closed once.
    unsafe { CloseHandle(asked.hProcess) };
    Ok(started)
}

#[cfg(not(windows))]
pub fn start(_file: &Path) -> Result<Option<Identity>, Failure> {
    Err(Failure::Refused)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_game_starts_in_its_own_folder() {
        assert_eq!(
            folder_of(Path::new("D:\\Games\\Grim Dawn\\x64\\Grim Dawn.exe")),
            Some(Path::new("D:\\Games\\Grim Dawn\\x64"))
        );
        assert_eq!(folder_of(Path::new("Game.exe")), None);
    }

    #[test]
    fn a_file_that_is_gone_says_so_and_starts_nothing() {
        let gone = std::env::temp_dir().join("shelf-launch-test-gone.exe");
        let _ = std::fs::remove_file(&gone);
        assert_eq!(start(&gone), Err(Failure::Missing));
    }
}
