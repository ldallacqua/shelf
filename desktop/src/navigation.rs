//! Where the window may go (ADR 005, section 6). Shelf's own pages stay in
//! it, and so do the sign-in pages the account page sends to for linking a
//! platform, whose way back is Shelf. Any other web address goes to the
//! default browser, Steam's two links go to Steam, and anything else is
//! dropped. Kept apart from the window so every rule has a test.

use url::Url;

/// What happens to an address the window is asked to open.
#[derive(Debug, PartialEq, Eq)]
pub enum Decision {
    /// Opened in the window.
    Stay,
    /// Opened in the default browser instead.
    Browser,
    /// Handed to Steam: `steam://rungameid/{app}` or `steam://install/{app}`.
    Steam,
    /// Not opened at all.
    Drop,
}

/// The pages a platform's sign-in shows before it sends the account back to
/// Shelf: Steam's OpenID (spec 4.4) and Nintendo's accounts.
fn platform_sign_in(url: &Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    match url.host_str() {
        Some("steamcommunity.com") => url.path().starts_with("/openid"),
        Some("accounts.nintendo.com") => true,
        _ => false,
    }
}

/// The app's own page ("Shelf can't be reached"), as WebView2 serves it on
/// Windows and as other platforms do.
fn app_page(url: &Url) -> bool {
    match url.scheme() {
        "tauri" => url.host_str() == Some("localhost"),
        "http" | "https" => url.host_str() == Some("tauri.localhost"),
        _ => false,
    }
}

/// A Steam link the app passes on: running or installing one app, by its id.
pub fn steam_link(url: &Url) -> bool {
    if url.scheme() != "steam" {
        return false;
    }
    let Some(command) = url.host_str() else {
        return false;
    };
    let id = url.path().trim_matches('/');
    matches!(command, "rungameid" | "install") && crate::ids::steam_app(id)
}

/// Whether the window opens `url`, for the Shelf at `shelf`.
pub fn decide(url: &Url, shelf: &Url) -> Decision {
    // An origin is a scheme, a host and a port: Shelf's own pages, and nothing beside them.
    if url.origin() == shelf.origin() {
        return Decision::Stay;
    }
    if app_page(url) || url.scheme() == "about" || platform_sign_in(url) {
        return Decision::Stay;
    }
    if steam_link(url) {
        return Decision::Steam;
    }
    match url.scheme() {
        "http" | "https" => Decision::Browser,
        _ => Decision::Drop,
    }
}

/// What a page asking for a new window (a link with `target="_blank"`) gets:
/// never a second window. Shelf's own pages open in the browser too, which
/// keeps one window and one history.
pub fn decide_new_window(url: &Url) -> Decision {
    if steam_link(url) {
        return Decision::Steam;
    }
    match url.scheme() {
        "http" | "https" => Decision::Browser,
        _ => Decision::Drop,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHELF: &str = "https://shelf-ldallacqua.vercel.app";

    fn decide_for(address: &str) -> Decision {
        decide(&Url::parse(address).unwrap(), &Url::parse(SHELF).unwrap())
    }

    #[test]
    fn shelf_pages_stay() {
        assert_eq!(
            decide_for("https://shelf-ldallacqua.vercel.app/en/u/lucas"),
            Decision::Stay
        );
        assert_eq!(
            decide_for("https://shelf-ldallacqua.vercel.app/api/v1/me/platforms/steam/return?x=1"),
            Decision::Stay
        );
    }

    #[test]
    fn another_scheme_or_port_of_shelf_is_not_shelf() {
        assert_eq!(
            decide_for("http://shelf-ldallacqua.vercel.app/en"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("https://shelf-ldallacqua.vercel.app:8443/en"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("https://evil.shelf-ldallacqua.vercel.app/en"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("https://shelf-ldallacqua.vercel.app.example.com/"),
            Decision::Browser
        );
    }

    #[test]
    fn the_local_server_is_shelf_when_the_build_opens_it() {
        let local = Url::parse("http://localhost:3300").unwrap();
        let page = Url::parse("http://localhost:3300/en/u/sample").unwrap();
        assert_eq!(decide(&page, &local), Decision::Stay);
        let other = Url::parse("http://localhost:3000/").unwrap();
        assert_eq!(decide(&other, &local), Decision::Browser);
    }

    #[test]
    fn the_app_page_stays() {
        assert_eq!(
            decide_for("http://tauri.localhost/index.html"),
            Decision::Stay
        );
        assert_eq!(decide_for("tauri://localhost/index.html"), Decision::Stay);
        assert_eq!(decide_for("about:blank"), Decision::Stay);
    }

    #[test]
    fn platform_sign_ins_stay() {
        assert_eq!(
            decide_for("https://steamcommunity.com/openid/login?openid.mode=checkid_setup"),
            Decision::Stay
        );
        assert_eq!(
            decide_for("https://accounts.nintendo.com/connect/1.0.0/authorize?client_id=x"),
            Decision::Stay
        );
    }

    #[test]
    fn the_rest_of_steam_goes_to_the_browser() {
        assert_eq!(
            decide_for("https://steamcommunity.com/id/someone"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("http://steamcommunity.com/openid/login"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("https://store.steampowered.com/app/219990"),
            Decision::Browser
        );
    }

    #[test]
    fn other_addresses_go_to_the_browser() {
        assert_eq!(
            decide_for("https://www.igdb.com/games/hades"),
            Decision::Browser
        );
        assert_eq!(
            decide_for("https://github.com/ldallacqua/shelf"),
            Decision::Browser
        );
    }

    #[test]
    fn steam_links_to_run_or_install_go_to_steam() {
        assert_eq!(decide_for("steam://rungameid/219990"), Decision::Steam);
        assert_eq!(decide_for("steam://install/219990"), Decision::Steam);
        assert_eq!(decide_for("steam://rungameid/219990/"), Decision::Steam);
    }

    #[test]
    fn every_other_link_is_dropped() {
        assert_eq!(
            decide_for("steam://rungameid/219990%20-console"),
            Decision::Drop
        );
        assert_eq!(decide_for("steam://rungameid/abc"), Decision::Drop);
        assert_eq!(decide_for("steam://uninstall/219990"), Decision::Drop);
        assert_eq!(decide_for("steam://open/console"), Decision::Drop);
        assert_eq!(
            decide_for("file:///C:/Windows/System32/cmd.exe"),
            Decision::Drop
        );
        assert_eq!(decide_for("ms-settings:privacy"), Decision::Drop);
        assert_eq!(decide_for("javascript:alert(1)"), Decision::Drop);
    }

    #[test]
    fn a_new_window_is_never_opened() {
        let shelf_page = Url::parse("https://shelf-ldallacqua.vercel.app/en").unwrap();
        assert_eq!(decide_new_window(&shelf_page), Decision::Browser);
        let steam = Url::parse("steam://install/10").unwrap();
        assert_eq!(decide_new_window(&steam), Decision::Steam);
        let file = Url::parse("file:///C:/x.exe").unwrap();
        assert_eq!(decide_new_window(&file), Decision::Drop);
    }
}
