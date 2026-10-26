//! What a page may name (ADR 005, section 3): ids, checked here before
//! anything is done with them. Never a path, never a command line.

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
