//! What a chosen shortcut points at (ADR 005, section 11), read from the file
//! itself, so what is running can be compared with it: the program of a `.lnk`,
//! by Microsoft's published format (MS-SHLLINK), or the Steam app of a `.url`.
//! What cannot be read is nothing: a shortcut is only ever one more piece of
//! evidence, and a game with none is told by what Play started.

use std::fs;
use std::path::{Path, PathBuf};

const HEADER: usize = 76;
const HAS_ID_LIST: u32 = 0x1;
const HAS_LINK_INFO: u32 = 0x2;
const LOCAL_PATH: u32 = 0x1;

fn u32_at(bytes: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?))
}

fn u16_at(bytes: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_le_bytes(bytes.get(at..at + 2)?.try_into().ok()?))
}

/// The text at `at`, up to its end: one byte a letter. A letter past ASCII depends on the
/// computer's code page, so such a path is not read at all.
fn ascii_at(bytes: &[u8], at: usize) -> Option<String> {
    let text = bytes.get(at..)?;
    let text = &text[..text.iter().position(|byte| *byte == 0)?];
    text.is_ascii()
        .then(|| String::from_utf8_lossy(text).into_owned())
}

/// The text at `at`, up to its end: two bytes a letter.
fn wide_at(bytes: &[u8], at: usize) -> Option<String> {
    let text: Vec<u16> = bytes
        .get(at..)?
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .take_while(|letter| *letter != 0)
        .collect();
    String::from_utf16(&text).ok()
}

/// The program a `.lnk` file's bytes point at, on a disk of this computer.
fn program_of_link(bytes: &[u8]) -> Option<PathBuf> {
    if u32_at(bytes, 0)? != HEADER as u32 {
        return None;
    }
    let flags = u32_at(bytes, 20)?;
    let mut at = HEADER;
    if flags & HAS_ID_LIST != 0 {
        at += 2 + usize::from(u16_at(bytes, at)?);
    }
    if flags & HAS_LINK_INFO == 0 {
        return None;
    }
    let info = bytes.get(at..)?;
    if u32_at(info, 8)? & LOCAL_PATH == 0 {
        return None;
    }
    let header_size = u32_at(info, 4)? as usize;
    // Past the older header's end, the same two parts in two bytes a letter: the ones to read.
    let (base, suffix) = if header_size >= 0x24 {
        let base = wide_at(info, u32_at(info, 0x1C)? as usize)?;
        let suffix = wide_at(info, u32_at(info, 0x20)? as usize)?;
        (base, suffix)
    } else {
        let base = ascii_at(info, u32_at(info, 0x10)? as usize)?;
        let suffix = ascii_at(info, u32_at(info, 0x18)? as usize)?;
        (base, suffix)
    };
    let path = format!("{base}{suffix}");
    (!path.is_empty()).then(|| PathBuf::from(path))
}

/// The Steam app an internet shortcut's text opens: Steam's own are all `.url` files.
fn steam_app_of_url(text: &str) -> Option<String> {
    let url = text
        .lines()
        .find_map(|line| line.trim().strip_prefix("URL="))?;
    let app = url
        .strip_prefix("steam://rungameid/")
        .or_else(|| url.strip_prefix("steam://run/"))?
        .trim_end_matches('/');
    crate::ids::steam_app(app).then(|| app.to_string())
}

/// What a game's file really is.
#[derive(Debug, PartialEq, Eq)]
pub enum Pointed {
    /// A program, this one.
    Program(PathBuf),
    /// A Steam app.
    Steam(String),
    /// What it starts can't be told from the file: a script, a shortcut to something else.
    Unknown,
}

pub fn pointed_at(file: &Path) -> Pointed {
    let extension = file
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase());
    match extension.as_deref() {
        Some("exe") => Pointed::Program(file.to_path_buf()),
        Some("lnk") => fs::read(file)
            .ok()
            .and_then(|bytes| program_of_link(&bytes))
            .filter(|program| {
                program
                    .extension()
                    .is_some_and(|extension| extension.eq_ignore_ascii_case("exe"))
            })
            .map_or(Pointed::Unknown, Pointed::Program),
        Some("url") => fs::read(file)
            .ok()
            .and_then(|bytes| steam_app_of_url(&String::from_utf8_lossy(&bytes)))
            .map_or(Pointed::Unknown, Pointed::Steam),
        _ => Pointed::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A shortcut as Windows' own shell wrote it (`WScript.Shell`), to Notepad: cut after the
    /// part read here, and its disk's serial and label blanked, since the rest of such a file
    /// names the computer that wrote it.
    const LINK: &[u8] = include_bytes!("../tests/fixtures/shortcut/a-game.lnk");

    #[test]
    fn reads_the_program_of_a_shortcut_windows_wrote() {
        assert_eq!(
            program_of_link(LINK),
            Some(PathBuf::from("C:\\Windows\\System32\\notepad.exe"))
        );
    }

    /// A shortcut's bytes with one path in its info: `wide` puts it in two bytes a letter.
    fn link(path: &str, wide: bool) -> Vec<u8> {
        let mut bytes = vec![0u8; HEADER];
        bytes[0] = HEADER as u8;
        bytes[20] = HAS_LINK_INFO as u8;
        let header: u32 = if wide { 0x24 } else { 0x1C };
        let mut info = vec![0u8; header as usize];
        info[4..8].copy_from_slice(&header.to_le_bytes());
        info[8] = LOCAL_PATH as u8;
        let base = info.len() as u32;
        if wide {
            for letter in path.encode_utf16() {
                info.extend(letter.to_le_bytes());
            }
            info.extend([0, 0]);
            let suffix = info.len() as u32;
            info.extend([0, 0]);
            info[0x1C..0x20].copy_from_slice(&base.to_le_bytes());
            info[0x20..0x24].copy_from_slice(&suffix.to_le_bytes());
        } else {
            info.extend(path.as_bytes());
            info.push(0);
            let suffix = info.len() as u32;
            info.push(0);
            info[0x10..0x14].copy_from_slice(&base.to_le_bytes());
            info[0x18..0x1C].copy_from_slice(&suffix.to_le_bytes());
        }
        bytes.extend(info);
        bytes
    }

    #[test]
    fn reads_a_path_past_ascii_only_where_the_format_says_how() {
        assert_eq!(
            program_of_link(&link("D:\\Jogos\\Coração\\game.exe", true)),
            Some(PathBuf::from("D:\\Jogos\\Coração\\game.exe"))
        );
        assert_eq!(
            program_of_link(&link("D:\\Games\\game.exe", false)),
            Some(PathBuf::from("D:\\Games\\game.exe"))
        );
    }

    #[test]
    fn anything_else_is_not_a_program() {
        assert_eq!(program_of_link(b""), None);
        assert_eq!(program_of_link(&[0xFF; 200]), None);
        // Cut short anywhere, it answers nothing rather than going past its end.
        let whole = link("D:\\Games\\game.exe", true);
        for length in 0..whole.len() - 4 {
            assert_eq!(program_of_link(&whole[..length]), None, "{length}");
        }
    }

    #[test]
    fn reads_the_app_of_steam_s_own_shortcuts() {
        let text = "[{000214A0-0000-0000-C000-000000000046}]\r\nProp3=19,0\r\n[InternetShortcut]\r\nIDList=\r\nIconIndex=0\r\nURL=steam://rungameid/219990\r\n";
        assert_eq!(steam_app_of_url(text).as_deref(), Some("219990"));
        assert_eq!(
            steam_app_of_url("URL=steam://run/10/").as_deref(),
            Some("10")
        );
        assert_eq!(steam_app_of_url("URL=https://example.com"), None);
        assert_eq!(steam_app_of_url("URL=steam://rungameid/1 -x"), None);
    }

    #[test]
    fn a_script_is_not_a_program_whatever_it_starts() {
        assert_eq!(
            pointed_at(Path::new("D:\\Games\\run.bat")),
            Pointed::Unknown
        );
        assert_eq!(
            pointed_at(Path::new("D:\\Games\\Game.EXE")),
            Pointed::Program(PathBuf::from("D:\\Games\\Game.EXE"))
        );
        assert_eq!(
            pointed_at(Path::new("D:\\Games\\gone.lnk")),
            Pointed::Unknown
        );
    }
}
