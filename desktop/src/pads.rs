//! Whether a controller was touched (ADR 005, section 12). Windows' idle time does not see one, so
//! a game played on a controller would look like nobody there. Only whether something changed is
//! kept, never what. A stick has to move an eighth of its range, as they drift; motion sensors
//! are not looked at. Listened to only while a game is in front.

use std::collections::BTreeMap;

/// A controller's state, as far as it says anything about a person.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PadState {
    pub buttons: Vec<u16>,
    /// Each axis, by its usage: its value, and how far it can go.
    pub axes: BTreeMap<u32, (u32, u32)>,
    /// The point of view hat, which has no in between.
    pub hat: Option<u32>,
}

/// Whether going from `from` to `to` took a person. `from` is what was last taken as a touch: a
/// stick drifting slowly never gets far from it, and moving one slowly does.
pub fn touched(from: &PadState, to: &PadState) -> bool {
    if from.buttons != to.buttons || from.hat != to.hat {
        return true;
    }
    to.axes.iter().any(|(usage, (value, range))| {
        from.axes
            .get(usage)
            .is_some_and(|(before, _)| before.abs_diff(*value) >= (range / 8).max(1))
    })
}

#[cfg(windows)]
mod windows {
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    use windows_sys::Win32::Devices::HumanInterfaceDevice::{
        HIDP_CAPS, HIDP_STATUS_SUCCESS, HIDP_VALUE_CAPS, HidP_GetCaps, HidP_GetUsageValue,
        HidP_GetUsages, HidP_GetValueCaps, HidP_Input,
    };
    use windows_sys::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::System::SystemInformation::GetTickCount64;
    use windows_sys::Win32::UI::Input::XboxController::{XINPUT_STATE, XInputGetState};
    use windows_sys::Win32::UI::Input::{
        GetRawInputData, GetRawInputDeviceInfoW, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
        RAWINPUTHEADER, RID_INPUT, RIDEV_INPUTSINK, RIDEV_REMOVE, RIDI_PREPARSEDDATA, RIM_TYPEHID,
        RegisterRawInputDevices,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, HWND_MESSAGE, MSG,
        PostMessageW, RegisterClassW, WM_APP, WM_INPUT, WNDCLASSW,
    };

    use super::{PadState, touched};

    /// Joystick, gamepad and multi-axis controller, on HID's generic desktop page.
    const USAGES: [u16; 3] = [0x04, 0x05, 0x08];
    const GENERIC_DESKTOP: u16 = 0x01;
    const BUTTON_PAGE: u16 = 0x09;
    /// X, Y, Z, Rx, Ry and Rz: sticks and triggers, on every controller that names them.
    const AXES: std::ops::RangeInclusive<u16> = 0x30..=0x35;
    const HAT: u16 = 0x39;
    const LISTEN: u32 = WM_APP + 1;

    /// When a controller was last touched, by `GetTickCount64`. 0 is never.
    static LAST_TOUCH: AtomicU64 = AtomicU64::new(0);
    /// The listening window, once it is there.
    static WINDOW: AtomicUsize = AtomicUsize::new(0);

    fn touch() {
        // SAFETY: takes nothing, and can't fail.
        LAST_TOUCH.store(unsafe { GetTickCount64() }, Ordering::Relaxed);
    }

    /// A controller Windows has told us of: how to read its reports, and what it last said.
    struct Device {
        preparsed: Vec<u8>,
        ranges: HashMap<u16, u32>,
        last: Option<PadState>,
        last_unread: Vec<u8>,
    }

    impl Device {
        fn of(handle: HANDLE) -> Option<Device> {
            let mut size = 0u32;
            // SAFETY: asks only for the size, which goes in `size` of this frame.
            unsafe {
                GetRawInputDeviceInfoW(handle, RIDI_PREPARSEDDATA, std::ptr::null_mut(), &mut size);
            }
            if size == 0 {
                return None;
            }
            let mut preparsed = vec![0u8; size as usize];
            // SAFETY: the buffer holds `size` bytes, as asked just above.
            let read = unsafe {
                GetRawInputDeviceInfoW(
                    handle,
                    RIDI_PREPARSEDDATA,
                    preparsed.as_mut_ptr().cast(),
                    &mut size,
                )
            };
            if read == u32::MAX {
                return None;
            }
            let ranges = ranges_of(&preparsed);
            Some(Device {
                preparsed,
                ranges,
                last: None,
                last_unread: Vec::new(),
            })
        }

        /// One report from it. One Windows can't read counts as a touch if it differs from the
        /// last: a game wrongly counted as played is a smaller error than one played and missed.
        fn report(&mut self, report: &mut [u8]) {
            let Some(state) = read(&self.preparsed, &self.ranges, report) else {
                if self.last_unread != *report {
                    if !self.last_unread.is_empty() {
                        touch();
                    }
                    self.last_unread = report.to_vec();
                }
                return;
            };
            match &self.last {
                None => self.last = Some(state),
                Some(last) if touched(last, &state) => {
                    touch();
                    self.last = Some(state);
                }
                Some(_) => {}
            }
        }
    }

    /// How far each axis can go, by the size of the field that carries it.
    fn ranges_of(preparsed: &[u8]) -> HashMap<u16, u32> {
        // SAFETY: a struct of plain numbers, for which all zeroes is a valid value.
        let mut caps: HIDP_CAPS = unsafe { std::mem::zeroed() };
        // SAFETY: `preparsed` is what Windows gave for this device.
        if unsafe { HidP_GetCaps(preparsed.as_ptr() as isize, &mut caps) } != HIDP_STATUS_SUCCESS {
            return HashMap::new();
        }
        let mut count = caps.NumberInputValueCaps;
        // SAFETY: as above.
        let mut values: Vec<HIDP_VALUE_CAPS> = vec![unsafe { std::mem::zeroed() }; count as usize];
        // SAFETY: `values` holds `count` of them.
        let read = unsafe {
            HidP_GetValueCaps(
                HidP_Input,
                values.as_mut_ptr(),
                &mut count,
                preparsed.as_ptr() as isize,
            )
        };
        if read != HIDP_STATUS_SUCCESS {
            return HashMap::new();
        }
        values
            .iter()
            .take(count as usize)
            .filter(|caps| caps.UsagePage == GENERIC_DESKTOP && !caps.IsRange)
            // SAFETY: not a range, so this side of the union is the one Windows filled.
            .map(|caps| (unsafe { caps.Anonymous.NotRange.Usage }, caps))
            .filter(|(usage, _)| AXES.contains(usage))
            .map(|(usage, caps)| {
                (
                    usage,
                    1u32.checked_shl(u32::from(caps.BitSize))
                        .map_or(u32::MAX, |range| range - 1),
                )
            })
            .collect()
    }

    /// What a report says of buttons, sticks and the hat. Nothing when it says none of them: a
    /// vendor's own report, as Steam asks of some controllers.
    fn read(preparsed: &[u8], ranges: &HashMap<u16, u32>, report: &mut [u8]) -> Option<PadState> {
        let data = preparsed.as_ptr() as isize;
        let mut state = PadState::default();
        let mut usages = [0u16; 64];
        let mut length = usages.len() as u32;
        // SAFETY: each buffer is of this frame or borrowed, and each size says how long it is.
        let buttons = unsafe {
            HidP_GetUsages(
                HidP_Input,
                BUTTON_PAGE,
                0,
                usages.as_mut_ptr(),
                &mut length,
                data,
                report.as_mut_ptr(),
                report.len() as u32,
            )
        };
        let mut understood = buttons == HIDP_STATUS_SUCCESS;
        if understood {
            state.buttons = usages[..length as usize].to_vec();
            state.buttons.sort_unstable();
        }
        let value = |usage: u16, report: &mut [u8]| {
            let mut value = 0u32;
            // SAFETY: as above.
            let read = unsafe {
                HidP_GetUsageValue(
                    HidP_Input,
                    GENERIC_DESKTOP,
                    0,
                    usage,
                    &mut value,
                    data,
                    report.as_mut_ptr(),
                    report.len() as u32,
                )
            };
            (read == HIDP_STATUS_SUCCESS).then_some(value)
        };
        for usage in AXES {
            if let (Some(range), Some(value)) = (ranges.get(&usage), value(usage, report)) {
                state.axes.insert(u32::from(usage), (value, *range));
                understood = true;
            }
        }
        if let Some(hat) = value(HAT, report) {
            state.hat = Some(hat);
            understood = true;
        }
        understood.then_some(state)
    }

    fn register(window: HWND, listening: bool) {
        let devices = USAGES.map(|usage| RAWINPUTDEVICE {
            usUsagePage: GENERIC_DESKTOP,
            usUsage: usage,
            dwFlags: if listening {
                RIDEV_INPUTSINK
            } else {
                RIDEV_REMOVE
            },
            hwndTarget: if listening {
                window
            } else {
                std::ptr::null_mut()
            },
        });
        // SAFETY: the list says its own length and each entry's size.
        unsafe {
            RegisterRawInputDevices(
                devices.as_ptr(),
                devices.len() as u32,
                size_of::<RAWINPUTDEVICE>() as u32,
            );
        }
    }

    thread_local! {
        static DEVICES: std::cell::RefCell<HashMap<isize, Option<Device>>> =
            std::cell::RefCell::new(HashMap::new());
    }

    fn input(handle: HRAWINPUT) {
        let header = size_of::<RAWINPUTHEADER>() as u32;
        let mut size = 0u32;
        // SAFETY: asks only for the size.
        unsafe { GetRawInputData(handle, RID_INPUT, std::ptr::null_mut(), &mut size, header) };
        // Aligned for RAWINPUT, as a buffer of bytes need not be.
        let mut buffer = vec![0u64; (size as usize).div_ceil(8)];
        // SAFETY: the buffer holds at least `size` bytes.
        let read = unsafe {
            GetRawInputData(
                handle,
                RID_INPUT,
                buffer.as_mut_ptr().cast(),
                &mut size,
                header,
            )
        };
        if read == u32::MAX || (size as usize) < size_of::<RAWINPUTHEADER>() {
            return;
        }
        // SAFETY: Windows filled it, aligned, and said its size.
        let raw = unsafe { &*(buffer.as_ptr().cast::<RAWINPUT>()) };
        if raw.header.dwType != RIM_TYPEHID {
            return;
        }
        // SAFETY: the type says this side of the union is the one filled.
        let hid = unsafe { &raw.data.hid };
        let (each, count) = (hid.dwSizeHid as usize, hid.dwCount as usize);
        let total = each.saturating_mul(count);
        let start = hid.bRawData.as_ptr();
        // The reports sit at the end of what Windows wrote, past the fixed part.
        let offset = start as usize - buffer.as_ptr() as usize;
        if each == 0 || offset + total > size as usize {
            return;
        }
        // SAFETY: just checked to be inside the buffer, which nothing else holds.
        let reports = unsafe { std::slice::from_raw_parts_mut(start.cast_mut(), total) };
        DEVICES.with_borrow_mut(|devices| {
            let device = devices
                .entry(raw.header.hDevice as isize)
                .or_insert_with(|| Device::of(raw.header.hDevice));
            if let Some(device) = device {
                for report in reports.chunks_exact_mut(each) {
                    device.report(report);
                }
            }
        });
    }

    unsafe extern "system" fn on_message(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match message {
            WM_INPUT => input(lparam as HRAWINPUT),
            LISTEN => {
                register(window, wparam != 0);
                // A device may be another by the same handle when listened to again.
                if wparam == 0 {
                    DEVICES.with_borrow_mut(HashMap::clear);
                }
            }
            _ => {}
        }
        // SAFETY: passes on what Windows sent, as every window must.
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }

    /// A window nobody can see, on a thread of its own, for Windows to send reports to.
    pub fn start() {
        std::thread::spawn(|| {
            let name: Vec<u16> = "ShelfPads\0".encode_utf16().collect();
            // SAFETY: a struct of plain values and null pointers, for which zeroes are valid.
            let mut class: WNDCLASSW = unsafe { std::mem::zeroed() };
            class.lpfnWndProc = Some(on_message);
            class.lpszClassName = name.as_ptr();
            // SAFETY: null asks for this program's own.
            class.hInstance = unsafe { GetModuleHandleW(std::ptr::null()) };
            // SAFETY: the class and its name live until the thread ends, which is the app's end.
            let window = unsafe {
                RegisterClassW(&class);
                CreateWindowExW(
                    0,
                    name.as_ptr(),
                    name.as_ptr(),
                    0,
                    0,
                    0,
                    0,
                    0,
                    HWND_MESSAGE,
                    std::ptr::null_mut(),
                    class.hInstance,
                    std::ptr::null(),
                )
            };
            if window.is_null() {
                eprintln!("could not listen for controllers");
                return;
            }
            WINDOW.store(window as usize, Ordering::SeqCst);
            // SAFETY: a struct of plain values, filled by GetMessageW before it is read.
            let mut message: MSG = unsafe { std::mem::zeroed() };
            // SAFETY: `message` is of this frame.
            while unsafe { GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) } > 0 {
                // SAFETY: as Windows filled it.
                unsafe { DispatchMessageW(&message) };
            }
        });
    }

    /// Whether to hear controllers: only while a game is in front.
    pub fn listen(listening: bool) {
        let window = WINDOW.load(Ordering::SeqCst);
        if window != 0 {
            // SAFETY: the window lasts as long as the app; the message carries no pointers.
            unsafe { PostMessageW(window as HWND, LISTEN, usize::from(listening), 0) };
        }
    }

    /// An Xbox controller as a `PadState`, for what reaches XInput and not Raw Input.
    fn xinput(state: &XINPUT_STATE) -> PadState {
        let pad = &state.Gamepad;
        let stick = |value: i16| (i32::from(value) + 32_768) as u32;
        let mut axes = std::collections::BTreeMap::new();
        for (at, value) in [pad.sThumbLX, pad.sThumbLY, pad.sThumbRX, pad.sThumbRY]
            .into_iter()
            .enumerate()
        {
            axes.insert(at as u32, (stick(value), 65_535));
        }
        axes.insert(4, (u32::from(pad.bLeftTrigger), 255));
        axes.insert(5, (u32::from(pad.bRightTrigger), 255));
        PadState {
            buttons: vec![pad.wButtons],
            axes,
            hat: None,
        }
    }

    thread_local! {
        static XINPUT: std::cell::RefCell<[Option<PadState>; 4]> =
            const { std::cell::RefCell::new([None, None, None, None]) };
    }

    /// Looks at the Xbox controllers once. Called on each look, so nothing is read between them.
    pub fn look_at_xinput() {
        XINPUT.with_borrow_mut(|known| {
            for (slot, last) in known.iter_mut().enumerate() {
                // SAFETY: a struct of plain numbers, for which all zeroes is a valid value.
                let mut state: XINPUT_STATE = unsafe { std::mem::zeroed() };
                // SAFETY: `state` is of this frame.
                if unsafe { XInputGetState(slot as u32, &mut state) } != 0 {
                    *last = None;
                    continue;
                }
                let now = xinput(&state);
                match last {
                    None => *last = Some(now),
                    Some(before) if touched(before, &now) => {
                        touch();
                        *last = Some(now);
                    }
                    Some(_) => {}
                }
            }
        });
    }

    /// How long since a controller was touched, in milliseconds, if one ever was.
    pub fn age() -> Option<u64> {
        let last = LAST_TOUCH.load(Ordering::Relaxed);
        // SAFETY: takes nothing, and can't fail.
        (last != 0).then(|| unsafe { GetTickCount64() }.saturating_sub(last))
    }
}

#[cfg(windows)]
pub use windows::{listen, look_at_xinput, start};

/// How long since a key, the mouse or a controller was touched, in milliseconds. Windows' own
/// idle time does not see a controller.
#[cfg(windows)]
pub fn input_age() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};

    let mut info = LASTINPUTINFO {
        cbSize: size_of::<LASTINPUTINFO>() as u32,
        dwTime: 0,
    };
    // SAFETY: `info` is of this frame and says its own size.
    let keys = if unsafe { GetLastInputInfo(&mut info) } != 0 {
        // SAFETY: takes nothing. Both are the same 32-bit count, which wraps every 49 days.
        u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
    } else {
        u64::MAX
    };
    windows::age().map_or(keys, |pad| keys.min(pad))
}

#[cfg(not(windows))]
pub fn input_age() -> u64 {
    u64::MAX
}

#[cfg(not(windows))]
pub fn start() {}

#[cfg(not(windows))]
pub fn listen(_listening: bool) {}

#[cfg(not(windows))]
pub fn look_at_xinput() {}

#[cfg(test)]
mod tests {
    use super::*;

    fn pad(stick: u32) -> PadState {
        PadState {
            buttons: vec![],
            axes: BTreeMap::from([(0x30, (stick, 65_535))]),
            hat: None,
        }
    }

    #[test]
    fn a_button_is_a_touch_pressed_and_let_go() {
        let at_rest = pad(32_768);
        let pressed = PadState {
            buttons: vec![1],
            ..pad(32_768)
        };
        assert!(touched(&at_rest, &pressed));
        assert!(touched(&pressed, &at_rest));
    }

    #[test]
    fn a_stick_s_drift_is_nobody() {
        assert!(!touched(&pad(32_768), &pad(32_768 + 1_500)));
        assert!(!touched(&pad(32_768), &pad(32_768 - 4_000)));
    }

    #[test]
    fn a_stick_pushed_is_a_touch_either_way() {
        assert!(touched(&pad(32_768), &pad(32_768 + 9_000)));
        assert!(touched(&pad(32_768), &pad(32_768 - 9_000)));
    }

    #[test]
    fn the_hat_is_a_touch() {
        let up = PadState {
            hat: Some(1),
            ..pad(32_768)
        };
        assert!(touched(&pad(32_768), &up));
    }

    #[test]
    fn nothing_changing_is_nobody() {
        assert!(!touched(&pad(32_768), &pad(32_768)));
    }
}
