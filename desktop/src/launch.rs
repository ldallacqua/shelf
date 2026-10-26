//! Starting a game from its file (ADR 005, section 5), as Explorer starts
//! one: Windows' own `ShellExecuteW`, verb `open`, in the file's folder. That
//! is what lets a game that needs administrator ask for it (starting it
//! directly fails with error 740), and what opens shortcuts and `.bat`
//! files; many games break when started from another folder.

use std::path::Path;

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
pub fn start(file: &Path) -> Result<(), Failure> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    if !file.is_file() {
        return Err(Failure::Missing);
    }
    let wide = |text: &std::ffi::OsStr| text.encode_wide().chain(Some(0)).collect::<Vec<u16>>();
    let verb = wide("open".as_ref());
    let target = wide(file.as_os_str());
    let folder = folder_of(file).map(|folder| wide(folder.as_os_str()));
    // SAFETY: every pointer is to a NUL-terminated wide string that outlives the call.
    let answer = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            target.as_ptr(),
            std::ptr::null(),
            folder
                .as_ref()
                .map_or(std::ptr::null(), |folder| folder.as_ptr()),
            SW_SHOWNORMAL,
        )
    };
    // Above 32 is success; 2 and 3 are "not found", anything else a refusal.
    match answer as isize {
        code if code > 32 => Ok(()),
        2 | 3 => Err(Failure::Missing),
        _ => Err(Failure::Refused),
    }
}

#[cfg(not(windows))]
pub fn start(_file: &Path) -> Result<(), Failure> {
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
