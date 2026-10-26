fn main() {
    // Every command is listed, so none is allowed to a page unless a capability says so:
    // `capabilities/local.json` for the app's own page, and the one `lib.rs` adds for Shelf's.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_info",
            "open_shelf",
            "launcher",
            "choose_launcher",
            "forget_launcher",
            "show_launcher",
            "play",
            "steam_installed",
        ]),
    ))
    .expect("tauri-build failed");
}
