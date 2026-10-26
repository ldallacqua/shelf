# Shelf for Windows: the desktop app

The desktop app is the same Shelf in a window of its own, with one thing a browser cannot do:
**Play**. It starts a game from the file chosen for it on this computer, or through Steam. Why
it is built this way is [ADR 005](adr/005-desktop-app.md); what it does, for the person using
it, is [spec 7.7](spec.md#77-playing-a-game). This guide is how to use it, build it, and the
steps it is built in.

## Contents

1. [Using it](#1-using-it)
2. [Building and running it](#2-building-and-running-it)
3. [How it is made](#3-how-it-is-made)
4. [The steps](#4-the-steps)
5. [Checking it](#5-checking-it)
6. [When something goes wrong](#6-when-something-goes-wrong)

---

## 1. Using it

1. **Install it** from `Shelf_<version>_x64-setup.exe`. Windows warns the first time, since
   the installer is not signed (ADR 005): **More info**, then **Run anyway**. It installs for
   this Windows account only and needs no administrator.
2. **Sign in** as on the site. The app remembers it, as a browser does, for seven days after
   the last use.
3. **On a game of your own,** under Mine:
   - a game the Steam sync brought in has **Play** at once, through Steam;
   - any other has **Choose the game's file**: pick its `.exe` (or a shortcut). Play starts it
     from then on, from its own folder.
4. **The menu beside Play** (Ways to play) names the file, with **Change the file**, **Show in
   folder** and **Forget the file**.
5. **The header is the window's bar:** drag it to move the window, double-click it to
   maximize, and minimize, maximize and close are at its right end.

What the app keeps on this computer is only the files chosen, in
`%APPDATA%\com.ldallacqua.shelf\launchers.json`. Uninstalling leaves that file; delete the
folder to forget everything.

## 2. Building and running it

**What it needs,** all present on the owner's computer on 25 Oct 2026:

| | Version | Check |
| --- | --- | --- |
| Rust, stable, MSVC | 1.99 | `rustup show active-toolchain` says `stable-x86_64-pc-windows-msvc` |
| Visual Studio Build Tools, C++ | 2022 | Visual Studio Installer, "Desktop development with C++" |
| WebView2 | 155 | Part of Windows 11 |
| Node and pnpm | As the site | `.nvmrc`, `packageManager` |

**Commands,** from the repository's root:

| Command | Does |
| --- | --- |
| `pnpm desktop:dev` | The app against the local server, `http://localhost:3300`, rebuilt when its Rust changes. Start `pnpm serve:test` (or `pnpm dev`) first. |
| `pnpm desktop:build` | The installer, a release build that opens production: `desktop/target/release/bundle/nsis/Shelf_<version>_x64-setup.exe` |
| `pnpm desktop:test` | The Rust side's tests (`cargo test`) |
| `pnpm desktop:check` | The app against `pnpm serve:test`, driven through its web view's debugging port: signs in as the made-up owner and checks that the pages show what a browser shows ([section 5](#5-checking-it)) |

The first build compiles Tauri and its dependencies, about five minutes; later ones take
seconds. `desktop/target/` is the build's own and is not committed.

**Another address:** `SHELF_URL=https://… pnpm desktop:dev` opens that one. A release build
ignores `SHELF_URL` and opens production only.

## 3. How it is made

### Where things are

```text
desktop/
  Cargo.toml, build.rs   The Rust program, shelf-desktop
  tauri.conf.json        The app: name, identifier, window, installer
  capabilities/          What the local page may ask (Shelf's origin gets its own in lib.rs)
  offline/               The one local page: "Shelf can't be reached", and Try again
  icons/                 Made from src/app/icon.svg by the Tauri CLI's `icon` command, Windows' only
  src/
    main.rs, lib.rs      The window, and what the app keeps while it runs
    commands.rs          What Shelf's pages may ask, each checking what it is given
    ids.rs               What an entry's id and a Steam app id may be
    navigation.rs        Which addresses stay in the window (unit-tested)
    launchers.rs         The files chosen, kept in launchers.json
    launch.rs            Starting a file as Explorer does, or Steam
    steam.rs             Steam's folders: which apps are installed
  tests/fixtures/        Steam's files as Steam writes them, for the tests
src/features/desktop/    The site's side: is this the app, the bridge to its commands, and the
                         window's bar (window-frame.tsx, window-script.tsx)
src/features/game-detail/play.tsx   Play, under Mine
```

### The bridge

The site calls the commands of ADR 005 section 3 through `src/features/desktop/tauri.ts`,
the only code that knows Tauri's global. It imports nothing, so the window's controls in every
page's header cost a visitor next to nothing. The commands that answer with data go through
`bridge.ts`, which reads every answer through a Zod schema; Zod must never reach a page's first
load (`zod-script.tsx` says why), so only code fetched when needed imports it, as Play is.
Outside the app there is no bridge, and Play falls back to what a browser can do (Play on
Steam, or nothing). The commands' Rust side is `commands.rs`; each takes an entry id (letters,
digits, `-` and `_`, up to 64) or Steam app ids (digits), and refuses anything else as
`invalid`. A refusal is a word the page has a sentence for: `invalid`, `unset`, `missing`,
`refused`, `failed`.

### Rules that keep it safe

- Only the address the build opens may call a command: the capability `lib.rs` adds when the
  app starts names that address in its `remote` URLs, and `build.rs` lists every command, so
  none is allowed without one.
- A path comes only from the file picker. No command takes one.
- No plugin's JavaScript API is allowed to any page.
- Shelf's origin may also use Tauri's window commands for the window it is in: minimize,
  maximize, close, whether it is maximized, and dragging. The app's own page may minimize,
  close and move its window.
- The window keeps Shelf's pages and the platforms' sign-in pages (`navigation.rs`); any other
  address goes to the default browser; `steam://rungameid/` and `steam://install/` go to Steam,
  and every other scheme is dropped.

### The site's side

- `connect-src` allows `http://ipc.localhost`, Tauri's channel on Windows (`next.config.ts`).
- The window has no Windows bar. The app runs `window.__SHELF_WINDOW__ = 'frameless'` before
  a page's scripts; `window-script.tsx`, in `<head>`, puts `data-window="frameless"` on
  `<html>` before the first paint, and the `frameless` variant (`globals.css`) keeps room at
  the header's right end and shows the controls there (`WindowControls`, drawn for everyone,
  shown only by that variant). `TitleBar` gives the header Tauri's
  `data-tauri-drag-region="deep"` once the page runs, and only in that window: an app with
  Windows' bar would refuse the drag, and say so in the console. The page's own scrollbar is
  hidden there and `PageScrollbar` drawn instead, below the header.
- Mine's Play (`play.tsx`) reads `steam` from the owner's game (`GET /api/v1/entries/{id}`):
  the app id the Steam sync recorded on one of its copies, and the ones IGDB lists for it. It
  carries `data-play`, so `pnpm desktop:check` reads every page without it: the app's and a
  browser's differ there by design.

## 4. The steps

One pull request each, merged before the next starts, `pnpm verify --skip-browser` passing on
its last commit, and this guide, the spec and architecture section 25 changed with it. A step
the owner has to answer is marked **Asks**.

### Step 1: Play on Steam, on the site

What a browser can already do, and what the app builds on.

**Built 25 Oct 2026.**

- [x] `readOwnerGame` and the API's `OwnerGame` carry `steam`: `{ owned?: string, known: string[] }`.
      `owned` is the app id of a Steam item feeding one of the entry's copies (the primary
      version's first, then the most played); `known` is every app of those items, then every
      Steam id IGDB lists for the entry's versions (`games.store_ids`), `owned` first.
- [x] On Mine's own line, on one's own shelf: **Play on Steam**, a link to
      `steam://rungameid/{owned}` (`steamPlayLink`, digits only), when there is an `owned`. Not
      on a coarse pointer, a phone's.
- [x] Messages in both languages; Mine's line is as tall as the button in the editor and its
      skeleton alike (`mineTop`), so a game with Play moves nothing below it.
- [x] Tests: the read picks the right app id (primary first, most played next, none without a
      Steam item, never another library's); Mine shows the link with it, and none without one;
      the link takes digits only.

**Done when** a game the Steam sync brought in opens Steam from its page in a browser.

### Step 2: The app opens Shelf

**Built 25 Oct 2026.**

- [x] `desktop/`: Tauri 2, one window (1280 by 800, at least 960 by 600, its size and place
      remembered) on the build's address, the app's name and icon, one instance (a second start
      brings the first to the front), an NSIS installer for the current user (1.4 MB).
- [x] `navigation.rs` with its tests; the app's own page, which opens Shelf once its server
      answers within ten seconds and otherwise says it can't be reached, with Try again.
- [x] A capability for the address the build opens, added by `lib.rs` when the app starts (a
      file cannot know a development build's `SHELF_URL`), and `desktop_info`.
- [x] `connect-src` gains `http://ipc.localhost`.
- [x] `pnpm desktop:dev`, `desktop:build`, `desktop:test`; `pnpm verify` runs `desktop:test`
      when `cargo` is there and says so when it is not.
- [x] `pnpm desktop:check` ([section 5](#5-checking-it)).
- The site's bridge (`src/features/desktop/bridge.ts`) waits for step 3, its first user: the
  check calls `desktop_info` from Shelf's page itself.

**Done when,** against `pnpm serve:test`, signed in as the made-up owner, the app shows the
same as a browser on: the shelf (2D, 3D, wall, list), a game's page and panel with Mine and its
private notes, a private game, the trophy wall, the placing page and the account page with its
platforms; linking Steam (the test double) comes back to the app; an outside link opens the
default browser; and the console has no error. Then the owner installs it and signs in to
production.

### Step 3: Choose a file, and Play

**Built 25 Oct 2026.**

- [x] `launchers.rs` (kept in `launchers.json`, written whole to a new file then renamed; a file
      it cannot read is put aside as `launchers.unreadable.json`), `launch.rs` (`ShellExecuteW`,
      `open`, the file's folder), `steam.rs` (Steam's folder from the registry,
      `libraryfolders.vdf`, each library's `appmanifest_{id}.acf`, installed when its
      `StateFlags` has 4).
- [x] The commands `launcher`, `choose_launcher` (filters: `.exe`, `.bat`, `.lnk`, `.url`; the
      picker titled with the game, in the page's language), `forget_launcher`, `show_launcher`,
      `play`, `steam_installed` (`commands.rs`). Steam is reached by its links, which the window
      hands over (ADR 005, section 5), so `play` takes the entry alone.
- [x] Play in the app (`play.tsx`), on Mine's own line: the file, or Steam installed (`owned`,
      else a `known` id Steam has installed), or **Install on Steam** for an `owned` not
      installed, or **Choose the game's file**. Beside it, a menu (Ways to play): the file's
      name, Change the file, Show in folder, Forget the file; or, for a Steam game, Choose a
      file instead. A file gone says so, and offers to choose it again.
- [x] Tests: every command refuses a bad id; Steam's fixtures (two libraries, one game half
      downloaded); the kept file survives a broken write; Play's choices with the bridge faked
      (`setBridgeForTests`).
- [x] `pnpm desktop:check` goes through choosing (a development build takes the file from
      `SHELF_PICK`) and Play, with a batch file that writes down the folder it started in.

**Done when** a game starts from its file, from its own folder; one that needs administrator
gets Windows' prompt; a Steam game starts through Steam; and nothing a page sends starts
anything else. Checked: the first and the last by `pnpm desktop:check` and the tests. The
administrator's prompt and Steam itself are the owner's to see on their own games: no script
here starts a real game or opens Steam.

Steps 4 to 6 are what the owner asked once the app was installed (ADR 005, sections 8 to 10).
Where installers live was theirs to answer: this repository, made public.

### Step 4: The window's own title bar

**Built 25 Oct 2026.**

- [x] The window without Windows' bar (`decorations(false)`; Windows keeps its edges, shadow,
      rounded corners and snapping), and the app's line that tells Shelf's pages so
      (`window.__SHELF_WINDOW__ = 'frameless'`, before any of the page's scripts), mirrored on
      `<html>` as `data-window="frameless"` by Shelf's head script before the first paint.
- [x] Shelf's header as the bar: `data-tauri-drag-region="deep"` (its empty parts move the
      window, a double click maximizes it), room kept at its right end, and minimize, maximize
      (restore, when maximized) and close there, as wide as Windows draws them, close turning
      red. Through the bridge, Tauri's window commands, allowed to Shelf's origin: `minimize`,
      `toggle_maximize`, `close`, `is_maximized`, `start_dragging`, `internal_toggle_maximize`.
- [x] The page's scrollbar in the app: Windows' would run beside the close button, so it is
      hidden there and a thin one of Shelf's is drawn below the header, over the page, shown
      while the page scrolls or the pointer is on it, and draggable.
- [x] Tests: the controls are drawn only in a window without a bar, and each asks its command;
      the scrollbar follows the page.

**Done when** the window has one bar, Shelf's: it moves, maximizes, restores, minimizes and
closes from the header, resizes from its edges, and Shelf's name shows once. An app from step 3,
which has Windows' bar, shows no second set of controls. Checked by `pnpm desktop:check`, which
finds the controls in the header, maximizes and restores the window from it, and still reads
every page as a browser does. A development build no longer takes the single-instance lock,
which closed it at once and brought the installed app forward whenever that was open.

### Step 5: Ready to play

- [ ] `playable`: the entries whose file is chosen and still there, and every Steam app
      installed here (each library's manifests, flag 4). It takes nothing.
- [ ] `GET /api/v1/me/play`: each of my games' entry id and apps on Steam, worked out as
      `steam.known` is for one game; `private, no-store`.
- [ ] **Ready to play** (Prontos para jogar) among the library's controls, on one's own shelf in
      the app only: a choice of this device (`preferences.ts`) that leaves only the ready games
      in the library before anything is drawn from it, as hiding adult games does. While what is
      ready is not known yet, the shelf waits in ghosts rather than show every game first. What
      is ready is read again when the window comes back to the front and when Play changes a
      file.
- [ ] Nothing ready: the shelf says so, and offers to show every game.
- [ ] Tests: Steam's fixtures (an installed game listed, a half-downloaded one not); the read
      gives each of my entries with its apps, never another library's; the choice leaves only
      the ready games, with counts to match.

**Done when** Ready to play leaves exactly the games with a file that is still there or a Steam
app installed, in every view, with counts to match, and is still on the next time the app
opens.

### Step 6: Updates, and the installer in one step

- [ ] The repository public (the owner's choice), after its whole history is searched for
      anything secret.
- [ ] A signing key: the private half in `.env.local` (`TAURI_SIGNING_PRIVATE_KEY` and
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, names in `.env.example`), the public half in
      `tauri.conf.json`. The owner keeps a copy of the private half elsewhere.
- [ ] Tauri's updater (`tauri-plugin-updater`), reading
      `https://github.com/ldallacqua/shelf/releases/latest/download/latest.json`, installing in
      the installer's passive mode.
- [ ] The splash: a small window of the app's own, first at every start. It looks for an update
      (a few seconds at most), downloads one showing how far, installs it and starts the new
      version; then opens Shelf in the main window, unseen until its page is there, and closes.
      Shelf not answering: it says so, with Try again and Close. A development build skips
      the update.
- [ ] The installer in one step: a template of our own (`desktop/installer/`), Tauri 2.12.4's
      without its pages. One small window like the splash while it installs, then Shelf opens;
      an update runs the same.
- [ ] `pnpm desktop:release`: from a clean `main`, builds the version `tauri.conf.json` names,
      signed, writes `latest.json`, and publishes the release `desktop-v{version}` with the
      installer, its signature and `latest.json`.
- [ ] Version 0.2.0, the first released. It is installed by hand once over 0.1.0, which has no
      updater; every later version arrives by itself.

**Done when** the installer opens Shelf without a click, and a newer release published is
installed at the next start without one.

### Step 7: Hours for the games started from a file

- [ ] The app watches what it started (`sysinfo`, every 15 seconds): the process it started,
      or, once that ends within a minute, a process running from the same folder. A session
      ends when none is left.
- [ ] Sessions are kept on this computer until the page takes them (`sessions`, then
      `sessions_sent`), so a session played offline is not lost.
- [ ] The server: a new source of hours, `desktop`, on the entry's PC copy (made if there is
      none), added as a store's hours are; never for a game started through Steam. Its API and
      migration are designed in that step's pull request, and the spec says it first.
- [ ] Closing the window while a game runs keeps the app in the notification area until the
      game ends.

**Done when** an hour played from a file shows as an hour on the PC copy, once, and an hour on
Steam is still counted once.

### Later

- **Offline:** the games set up on this computer, with their covers, playable without the
  internet.
- **From the shelf:** Play on a box's menu, not only on its page.
- **Start with Windows,** in the notification area.
- **Other launchers** (Epic, GOG, Xbox): by their files today; by their own links when IGDB's
  ids for them prove to be the launchers' own.

## 5. Checking it

- **The Rust side:** `pnpm desktop:test`. Steam's folders are read from
  `desktop/tests/fixtures/`, never from this computer's Steam.
- **The site's side:** Vitest, with the bridge faked (`src/features/desktop/tauri.ts` takes a
  stand-in in tests).
- **Pictures:** `DESKTOP_CHECK_SHOTS=<folder> pnpm desktop:check` keeps a picture of the app's
  page at each step, for a person to look at.
- **The app itself:** `pnpm desktop:check` starts the development build against
  `pnpm serve:test` with WebView2's debugging port open
  (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`), connects to it
  as Playwright connects to any Chromium, signs in as the made-up owner and reads the pages,
  each beside the same page read in a plain Chromium. It is a check run by hand, not one of the
  browser tests, which stay off until the MVP.
- **Never:** a real game started by a test, a real Steam opened, production signed in to by a
  script.

## 6. When something goes wrong

| What happens | Why, and what to do |
| --- | --- |
| Windows says it protected the PC | The installer is not signed: More info, Run anyway |
| "Shelf can't be reached" | No internet, or the site is down: Try again when it is back |
| Play says the file is gone | The game moved or was uninstalled: Choose the file again |
| A game opens and closes at once | It needs another folder or arguments: point at its launcher, or at a shortcut (`.lnk`) that has them |
| Steam opens on the game's page, not the game | Steam does that for a game with several ways to start: pick one there once |
| The app opens blank | WebView2 is missing or broken: Windows Update, or Microsoft's WebView2 installer |
| `cargo` not found, though Rust is installed | A stray `"` in Windows' PATH (the owner's has one after `C:\Program Files\dotnet`) hides every folder after it from cmd and from Rust. The `desktop:` scripts tidy PATH for what they start; remove the quote in Windows' environment variables to fix it everywhere |
