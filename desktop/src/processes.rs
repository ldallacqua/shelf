//! What Windows says of the programs running, and asking one to close (ADR 005,
//! section 11). A process is known by its identity, its id and the moment it
//! started, never by its id alone, which Windows gives out again. Nothing here
//! decides whose a process is: that is `running.rs`, from what this reads.

use std::path::PathBuf;

/// A process, as no later process can be: an id is reused, an id and a start are not.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Identity {
    pub pid: u32,
    /// When it started, as Windows counts: hundreds of nanoseconds since 1601. 0 when unread.
    pub started: u64,
}

#[derive(Clone, Debug)]
pub struct Process {
    pub id: Identity,
    /// The process that started it, which may have ended, its id given to another since.
    pub parent: u32,
    /// The name of its file. Never proof of what it is, only of what to say when it can't be read.
    pub name: String,
    /// Its whole path, or nothing when Windows would not say (a protected process).
    pub image: Option<PathBuf>,
}

/// How asking a game's processes to close went.
#[derive(Debug, PartialEq, Eq)]
pub enum Closing {
    /// At least one window was asked.
    Asked,
    /// None of them has a window to ask.
    NoWindow,
    /// Windows refused: a game running as administrator, asked by an app that is not.
    Denied,
}

/// Why a process could not be ended.
#[derive(Debug, PartialEq, Eq)]
pub struct Denied;

/// This moment, as `Identity::started` counts.
pub fn now_as_windows_counts(unix_ms: u64) -> u64 {
    (unix_ms + 11_644_473_600_000) * 10_000
}

#[cfg(windows)]
mod windows {
    use std::collections::HashSet;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::path::PathBuf;

    use windows_sys::Win32::Foundation::{
        CloseHandle, FILETIME, HANDLE, HWND, INVALID_HANDLE_VALUE, LPARAM,
    };
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessId, GetProcessTimes, OpenProcess, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE, QueryFullProcessImageNameW,
        TerminateProcess,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GW_OWNER, GetWindow, GetWindowThreadProcessId, IsWindowVisible, PostMessageW,
        WM_CLOSE,
    };
    use windows_sys::core::BOOL;

    use super::{Closing, Denied, Identity, Process};

    /// A handle, closed when it goes. While it is open Windows cannot give its id to another.
    struct Held(HANDLE);

    impl Held {
        fn open(pid: u32, rights: u32) -> Option<Held> {
            // SAFETY: OpenProcess takes plain values and answers a handle or null.
            let handle = unsafe { OpenProcess(rights, 0, pid) };
            (!handle.is_null()).then_some(Held(handle))
        }

        fn started(&self) -> Option<u64> {
            started_of(self.0)
        }

        fn image(&self) -> Option<PathBuf> {
            let mut buffer = vec![0u16; 32_768];
            let mut length = buffer.len() as u32;
            // SAFETY: the buffer holds `length` wide characters, and the handle is open.
            let read = unsafe {
                QueryFullProcessImageNameW(
                    self.0,
                    PROCESS_NAME_WIN32,
                    buffer.as_mut_ptr(),
                    &mut length,
                )
            };
            (read != 0).then(|| PathBuf::from(OsString::from_wide(&buffer[..length as usize])))
        }
    }

    impl Drop for Held {
        fn drop(&mut self) {
            // SAFETY: the handle is open, and this is the only place that closes it.
            unsafe { CloseHandle(self.0) };
        }
    }

    fn started_of(handle: HANDLE) -> Option<u64> {
        let empty = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut created, mut ended, mut kernel, mut user) = (empty, empty, empty, empty);
        // SAFETY: each pointer is to a FILETIME of this frame, and the handle is open.
        let read =
            unsafe { GetProcessTimes(handle, &mut created, &mut ended, &mut kernel, &mut user) };
        (read != 0)
            .then(|| (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime))
    }

    /// The identity of a process just started, from the handle Windows gave for it.
    pub fn identity_of(handle: HANDLE) -> Option<Identity> {
        // SAFETY: the handle is open for as long as the caller keeps it.
        let pid = unsafe { GetProcessId(handle) };
        if pid == 0 {
            return None;
        }
        Some(Identity {
            pid,
            started: started_of(handle)?,
        })
    }

    /// Every process running, each with what Windows will say of it. Nothing when it won't list them.
    pub fn snapshot() -> Option<Vec<Process>> {
        // SAFETY: plain values; the answer is checked before it is used.
        let list = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if list == INVALID_HANDLE_VALUE {
            return None;
        }
        let list = Held(list);
        // SAFETY: a struct of plain numbers, for which all zeroes is a valid value.
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut found = Vec::new();
        // SAFETY: `entry` says its own size, and the list's handle is open.
        let mut more = unsafe { Process32FirstW(list.0, &mut entry) } != 0;
        while more {
            // Windows' own idle and system processes have no file.
            if entry.th32ProcessID > 4 {
                let held = Held::open(entry.th32ProcessID, PROCESS_QUERY_LIMITED_INFORMATION);
                let length = entry
                    .szExeFile
                    .iter()
                    .position(|c| *c == 0)
                    .unwrap_or(entry.szExeFile.len());
                found.push(Process {
                    id: Identity {
                        pid: entry.th32ProcessID,
                        started: held.as_ref().and_then(Held::started).unwrap_or(0),
                    },
                    parent: entry.th32ParentProcessID,
                    name: String::from_utf16_lossy(&entry.szExeFile[..length]),
                    image: held.as_ref().and_then(Held::image),
                });
            }
            // SAFETY: as above.
            more = unsafe { Process32NextW(list.0, &mut entry) } != 0;
        }
        Some(found)
    }

    /// The processes still the ones named, held open so their ids cannot change hands meanwhile.
    fn holding(ids: &[Identity]) -> (Vec<Held>, HashSet<u32>) {
        let mut held = Vec::new();
        let mut pids = HashSet::new();
        for id in ids {
            if let Some(process) = Held::open(id.pid, PROCESS_QUERY_LIMITED_INFORMATION)
                && process.started() == Some(id.started)
            {
                pids.insert(id.pid);
                held.push(process);
            }
        }
        (held, pids)
    }

    struct Asking {
        pids: HashSet<u32>,
        asked: usize,
        denied: usize,
    }

    /// Called for each window on the desktop: one of these processes' own is asked to close.
    unsafe extern "system" fn ask(window: HWND, asking: LPARAM) -> BOOL {
        // SAFETY: `close` hands this callback its `Asking`, alive through EnumWindows.
        let asking = unsafe { &mut *(asking as *mut Asking) };
        let mut pid = 0;
        // SAFETY: Windows hands a window it has, and `pid` is of this frame.
        unsafe { GetWindowThreadProcessId(window, &mut pid) };
        if asking.pids.contains(&pid) {
            // SAFETY: as above. Only a window of its own that a person can see stands for a
            // program: a window with an owner is a dialog of another, and a hidden one
            // may be anything.
            let standalone = unsafe { IsWindowVisible(window) != 0 }
                && unsafe { GetWindow(window, GW_OWNER) }.is_null();
            if standalone {
                // SAFETY: as above; the message carries no pointers.
                if unsafe { PostMessageW(window, WM_CLOSE, 0, 0) } != 0 {
                    asking.asked += 1;
                } else {
                    asking.denied += 1;
                }
            }
        }
        1
    }

    /// Asks each window of these processes to close, as its own close button does.
    pub fn close(ids: &[Identity]) -> Closing {
        let (_held, pids) = holding(ids);
        let mut asking = Asking {
            pids,
            asked: 0,
            denied: 0,
        };
        // SAFETY: `asking` outlives the call, which is the only time the callback runs.
        unsafe { EnumWindows(Some(ask), &raw mut asking as LPARAM) };
        if asking.asked > 0 {
            Closing::Asked
        } else if asking.denied > 0 {
            Closing::Denied
        } else {
            Closing::NoWindow
        }
    }

    /// Ends these processes at once, the youngest first, each checked on the handle that ends
    /// it. Refused only if one Windows would not end is still there: one that ended meanwhile
    /// answers the same refusal while another program still holds a handle to it.
    pub fn terminate(ids: &[Identity]) -> Result<(), Denied> {
        let mut youngest = ids.to_vec();
        youngest.sort_by_key(|id| std::cmp::Reverse(id.started));
        let mut refused = Vec::new();
        for id in youngest {
            let rights = PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION;
            let Some(process) = Held::open(id.pid, rights) else {
                refused.push(id);
                continue;
            };
            // Its id belongs to another process now, which is none of this.
            if process.started() != Some(id.started) {
                continue;
            }
            // SAFETY: the handle is open, with the right to end it.
            if unsafe { TerminateProcess(process.0, 1) } == 0 {
                refused.push(id);
            }
        }
        if refused.is_empty() {
            return Ok(());
        }
        let still = snapshot().ok_or(Denied)?;
        let there = refused.iter().any(|id| {
            still.iter().any(|process| {
                process.id.pid == id.pid
                    && (process.id.started == id.started || process.id.started == 0)
            })
        });
        if there { Err(Denied) } else { Ok(()) }
    }
}

#[cfg(windows)]
pub use windows::{close, identity_of, snapshot, terminate};

#[cfg(not(windows))]
pub fn snapshot() -> Option<Vec<Process>> {
    None
}

#[cfg(not(windows))]
pub fn close(_ids: &[Identity]) -> Closing {
    Closing::NoWindow
}

#[cfg(not(windows))]
pub fn terminate(_ids: &[Identity]) -> Result<(), Denied> {
    Err(Denied)
}

/// With a program of the tests' own (`examples/stand_in.rs`), never a real game: a copy of it
/// in a folder of the test's, drawing a window that takes no focus from whatever is in front.
#[cfg(all(test, windows))]
mod tests {
    use std::fs;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command};
    use std::time::{Duration, Instant};

    use super::*;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    struct Folder(PathBuf);

    impl Folder {
        fn new(name: &str) -> Self {
            let folder =
                std::env::temp_dir().join(format!("shelf-processes-{name}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&folder);
            fs::create_dir_all(&folder).unwrap();
            let stand_in = std::env::current_exe()
                .unwrap()
                .parent()
                .unwrap()
                .parent()
                .unwrap()
                .join("examples")
                .join("stand_in.exe");
            fs::copy(stand_in, folder.join("game.exe")).unwrap();
            Folder(folder)
        }

        fn start(&self, args: &[&str]) -> Child {
            Command::new(self.0.join("game.exe"))
                .args(args)
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .unwrap()
        }
    }

    impl Drop for Folder {
        fn drop(&mut self) {
            // Ended first: Windows keeps a running program's file from being deleted.
            for _ in 0..50 {
                if fs::remove_dir_all(&self.0).is_ok() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
        }
    }

    fn seen(pid: u32) -> Option<Process> {
        snapshot().unwrap().into_iter().find(|p| p.id.pid == pid)
    }

    fn until(what: &str, mut done: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(10);
        while Instant::now() < deadline {
            if done() {
                return;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("waited too long for {what}");
    }

    fn same_path(a: &Path, b: &Path) -> bool {
        crate::running::key(a) == crate::running::key(b)
    }

    #[test]
    fn reads_a_running_process_whole() {
        let folder = Folder::new("read");
        let mut child = folder.start(&[]);
        until("the process", || seen(child.id()).is_some());
        let process = seen(child.id()).unwrap();
        assert_eq!(process.parent, std::process::id());
        assert_eq!(process.name.to_lowercase(), "game.exe");
        assert!(process.id.started > 0);
        assert!(same_path(
            process.image.as_ref().unwrap(),
            &folder.0.join("game.exe")
        ));
        child.kill().unwrap();
        child.wait().unwrap();
    }

    #[test]
    fn asks_a_window_to_close_and_the_program_ends() {
        let folder = Folder::new("close");
        let mut child = folder.start(&[]);
        until("its window", || {
            seen(child.id()).is_some_and(|process| close(&[process.id]) == Closing::Asked)
        });
        until("it ending", || child.try_wait().unwrap().is_some());
        assert!(child.try_wait().unwrap().unwrap().success());
    }

    #[test]
    fn a_program_that_ignores_the_question_goes_on_until_it_is_ended() {
        let folder = Folder::new("force");
        let mut child = folder.start(&["--ignore-close"]);
        until("its window", || {
            seen(child.id()).is_some_and(|process| close(&[process.id]) == Closing::Asked)
        });
        std::thread::sleep(Duration::from_millis(500));
        assert!(child.try_wait().unwrap().is_none());

        let id = seen(child.id()).unwrap().id;
        assert_eq!(terminate(&[id]), Ok(()));
        until("it ending", || child.try_wait().unwrap().is_some());
        assert_eq!(child.try_wait().unwrap().unwrap().code(), Some(1));
    }

    #[test]
    fn says_when_a_program_has_no_window_to_ask() {
        let folder = Folder::new("no-window");
        let mut child = folder.start(&["--no-window"]);
        until("the process", || seen(child.id()).is_some());
        let id = seen(child.id()).unwrap().id;
        assert_eq!(close(&[id]), Closing::NoWindow);
        child.kill().unwrap();
        child.wait().unwrap();
    }

    #[test]
    fn an_id_that_changed_hands_is_left_alone() {
        let folder = Folder::new("reused");
        let mut child = folder.start(&[]);
        until("its window", || {
            seen(child.id()).is_some_and(|process| process.id.started > 0)
        });
        // The same id, started at another moment: as if this were a later process.
        let id = seen(child.id()).unwrap().id;
        let other = Identity {
            pid: id.pid,
            started: id.started - 1,
        };
        assert_eq!(close(&[other]), Closing::NoWindow);
        assert_eq!(terminate(&[other]), Ok(()));
        std::thread::sleep(Duration::from_millis(300));
        assert!(child.try_wait().unwrap().is_none());
        child.kill().unwrap();
        child.wait().unwrap();
    }

    #[test]
    fn ending_a_process_already_gone_is_what_was_asked() {
        let folder = Folder::new("gone");
        let mut child = folder.start(&[]);
        until("the process", || seen(child.id()).is_some());
        let id = seen(child.id()).unwrap().id;
        child.kill().unwrap();
        child.wait().unwrap();
        until("it going", || seen(id.pid).is_none());
        assert_eq!(terminate(&[id]), Ok(()));
    }
}
