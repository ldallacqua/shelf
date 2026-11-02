fn main() {
    // Every command is listed, so none is allowed to a page unless a capability says so:
    // `capabilities/local.json` for the splash, and the one `lib.rs` adds for Shelf's.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_info",
            "start",
            "launcher",
            "choose_launcher",
            "forget_launcher",
            "show_launcher",
            "play",
            "steam_installed",
            "playable",
            "game_state",
            "stop_game",
            "force_stop_game",
            "play_sessions",
            "play_sessions_kept",
            "download_sources",
            "add_source",
            "read_source_again",
            "remove_source",
            "search_sources",
            "start_download",
            "downloads_now",
            "pause_download",
            "resume_download",
            "remove_download",
            "show_download",
            "extract_download",
            "cancel_extraction",
            "real_debrid_account",
            "real_debrid_sign_in",
            "real_debrid_cancel_sign_in",
            "real_debrid_sign_out",
        ]),
    ))
    .expect("tauri-build failed");
}
