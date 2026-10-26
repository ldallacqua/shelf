//! What a page may name (ADR 005, section 3): ids, checked here before
//! anything is done with them. Never a path, never a command line.

/// An entry's id, as Shelf makes them (a UUID) and as the seeds do: letters,
/// digits, `-` and `_`, up to 64.
pub fn entry(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// A Steam app id: digits only, as many as a 32-bit number has.
pub fn steam_app(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 10
        && id.chars().all(|c| c.is_ascii_digit())
        && id.parse::<u32>().is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entries_are_shelf_ids() {
        assert!(entry("0b8f6f43-3c1e-4f6e-9d55-0e0f8d6a1b2c"));
        assert!(entry("sample_entry-1"));
        assert!(!entry(""));
        assert!(!entry(&"a".repeat(65)));
        assert!(!entry("../launchers"));
        assert!(!entry("C:\\Games\\x.exe"));
        assert!(!entry("a b"));
    }

    #[test]
    fn steam_apps_are_digits() {
        assert!(steam_app("219990"));
        assert!(steam_app("10"));
        assert!(!steam_app(""));
        assert!(!steam_app("21999O"));
        assert!(!steam_app("219990 -console"));
        assert!(!steam_app("-1"));
        assert!(!steam_app("99999999999"));
    }
}
