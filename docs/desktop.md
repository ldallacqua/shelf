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
4. **Change**, **Show in folder** and **Forget** are beside the file's name.

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
    main.rs, lib.rs      The window, the commands, the rules for where it may go
    navigation.rs        Which addresses stay in the window (unit-tested)
    launchers.rs         The files chosen, kept in launchers.json
    launch.rs            Starting a file as Explorer does, or Steam
    steam.rs             Steam's folders: which apps are installed
  tests/fixtures/        Steam's files as Steam writes them, for the tests
src/features/desktop/    The site's side: is this the app, and the bridge to its commands
src/features/game-detail/play.tsx   Play, under Mine
```

### The bridge

The site calls the commands of ADR 005 section 3 through `src/features/desktop/bridge.ts`,
which is the only code that knows Tauri's global. Outside the app it answers that there is no
app, and Play falls back to what a browser can do (Play on Steam, or nothing). The commands'
Rust side is in `lib.rs`; each takes an entry id (letters, digits, `-` and `_`, up to 64) and
Steam app ids (digits), and refuses anything else as `invalid`.

### Rules that keep it safe

- Only the address the build opens may call a command: the capability `lib.rs` adds when the
  app starts names that address in its `remote` URLs, and `build.rs` lists every command, so
  none is allowed without one.
- A path comes only from the file picker. No command takes one.
- No plugin's JavaScript API is allowed to any page.
- The window keeps Shelf's pages and the platforms' sign-in pages (`navigation.rs`); any other
  address goes to the default browser; `steam://rungameid/` and `steam://install/` go to Steam,
  and every other scheme is dropped.

### The site's side

- `connect-src` allows `http://ipc.localhost`, Tauri's channel on Windows (`next.config.ts`).
- Mine's Play (`play.tsx`) reads `steam` from the owner's game (`GET /api/v1/entries/{id}`):
  the app id the Steam sync recorded on one of its copies, and the ones IGDB lists for it.

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

- [ ] `launchers.rs` (kept in `launchers.json`, written whole to a new file then renamed),
      `launch.rs` (`ShellExecuteExW`, `open`, the file's folder), `steam.rs` (Steam's folder
      from the registry, `libraryfolders.vdf`, each library's `appmanifest_{id}.acf`, installed
      when its `StateFlags` has 4).
- [ ] The commands `launcher`, `choose_launcher` (filters: `.exe`, `.bat`, `.lnk`, `.url`; the
      picker titled with the game), `forget_launcher`, `show_launcher`, `play`,
      `steam_installed`.
- [ ] Play in the app (`play.tsx`): the file, or Steam installed (`owned`, else a `known` id
      Steam has installed), or **Install on Steam** for an `owned` not installed, or **Choose the
      game's file**. The file's name beside it, with Change, Show in folder, Forget. A file gone
      says so, and offers to choose again.
- [ ] Tests: every command refuses a bad id; Steam's fixtures (two libraries, one game half
      downloaded); the kept file survives a broken write; Play's choices with the bridge faked.

**Done when** a game starts from its file, from its own folder; one that needs administrator
gets Windows' prompt; a Steam game starts through Steam; and nothing a page sends starts
anything else.

### Step 4: Releases and updates. Asks

The installer is built here (`pnpm desktop:build`). Where the owner downloads it from, and
whether the app updates itself, is the owner's to decide:

- **A release on this repository** (`gh release create`, the installer attached): private, so
  only the owner's GitHub account downloads it. Updating is by hand.
- **Tauri's updater,** which needs the installers somewhere it can read without signing in (a
  public repository of releases only, or Shelf serving the update's description), and a key of
  its own to sign updates, kept with the other secrets.

### Step 5: Hours for the games started from a file

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
- **The site's side:** Vitest, with the bridge faked (`src/features/desktop/bridge.ts` takes a
  stand-in in tests).
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
