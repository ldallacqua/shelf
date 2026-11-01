//! A stand-in for a game, for the tests: never a real game, Steam or anything
//! of the person's. It draws a window that takes no focus and sits off the
//! screen, so tests can run while something else is in front, and ends when
//! that window is asked to close.
//!
//! `--ignore-close` keeps it open when asked, as a game that hangs does;
//! `--no-window` gives it none to ask; `--played` takes the focus after all, and touches F24, a
//! key nothing uses, each second, as a game in front with someone playing it would be seen. It
//! ends itself after a minute whatever happens, so a test that fails leaves nothing behind.

#![cfg_attr(windows, windows_subsystem = "windows")]

#[cfg(windows)]
mod stand_in {
    use std::time::Duration;

    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYEVENTF_KEYUP, SendInput, VK_F24, VK_MENU,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, MSG, PostQuitMessage,
        RegisterClassW, SetForegroundWindow, WM_CLOSE, WNDCLASSW, WS_EX_NOACTIVATE,
        WS_EX_TOOLWINDOW, WS_POPUP, WS_VISIBLE,
    };

    static mut IGNORE_CLOSE: bool = false;

    unsafe extern "system" fn answer(
        window: HWND,
        message: u32,
        wide: WPARAM,
        long: LPARAM,
    ) -> LRESULT {
        if message == WM_CLOSE {
            // SAFETY: set once before the window exists, and read on this one thread after.
            if !unsafe { IGNORE_CLOSE } {
                // SAFETY: takes a plain value.
                unsafe { PostQuitMessage(0) };
            }
            return 0;
        }
        // SAFETY: passes on what Windows handed this function.
        unsafe { DefWindowProcW(window, message, wide, long) }
    }

    fn press(key: u16) {
        let event = |flags| INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: key,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };
        let both = [event(0), event(KEYEVENTF_KEYUP)];
        // SAFETY: the list says its own length and each entry's size.
        unsafe { SendInput(2, both.as_ptr(), size_of::<INPUT>() as i32) };
    }

    pub fn main() {
        let args: Vec<String> = std::env::args().collect();
        let has = |flag: &str| args.iter().any(|arg| arg == flag);

        std::thread::spawn(|| {
            std::thread::sleep(Duration::from_secs(60));
            std::process::exit(2);
        });

        if has("--no-window") {
            std::thread::sleep(Duration::from_secs(60));
            return;
        }

        let name: Vec<u16> = "ShelfStandIn\0".encode_utf16().collect();
        // SAFETY: set before the window that reads it exists.
        unsafe { IGNORE_CLOSE = has("--ignore-close") };
        // SAFETY: a struct of plain values and null pointers, for which zeroes are valid.
        let mut class: WNDCLASSW = unsafe { std::mem::zeroed() };
        class.lpfnWndProc = Some(answer);
        class.lpszClassName = name.as_ptr();
        // SAFETY: `class` and `name` outlive the calls; the window's position is off every screen.
        unsafe {
            RegisterClassW(&class);
            let played = has("--played");
            let window = CreateWindowExW(
                if played {
                    WS_EX_TOOLWINDOW
                } else {
                    WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW
                },
                name.as_ptr(),
                name.as_ptr(),
                WS_POPUP | WS_VISIBLE,
                -32_000,
                -32_000,
                1,
                1,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null(),
            );
            if played {
                // Windows lets a program take the focus once it has seen it press a key.
                press(VK_MENU);
                SetForegroundWindow(window);
                std::thread::spawn(|| {
                    loop {
                        press(VK_F24);
                        std::thread::sleep(Duration::from_secs(1));
                    }
                });
            }
        }
        // SAFETY: as for `class`.
        let mut message: MSG = unsafe { std::mem::zeroed() };
        // SAFETY: `message` is of this frame; a null window asks for all of this thread's.
        while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
            // SAFETY: Windows filled `message` just now.
            unsafe { DispatchMessageW(&message) };
        }
    }
}

#[cfg(windows)]
fn main() {
    stand_in::main();
}

#[cfg(not(windows))]
fn main() {}
