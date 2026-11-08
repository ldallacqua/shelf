//! The language Windows is in, for the few words the app says itself with no page open: the tray's
//! menu and its notifications. Everything else is the page's, in the language the site is in.

/// Whether Windows shows itself in Portuguese. Anything else is English.
#[cfg(windows)]
pub fn portuguese() -> bool {
    /// Portuguese, in the low bits of a Windows language id.
    const PORTUGUESE_ID: u16 = 0x16;
    // SAFETY: takes nothing, and can't fail.
    let language = unsafe { windows_sys::Win32::Globalization::GetUserDefaultUILanguage() };
    language & 0x3ff == PORTUGUESE_ID
}

#[cfg(not(windows))]
pub fn portuguese() -> bool {
    false
}
