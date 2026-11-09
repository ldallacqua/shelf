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

1. **Install it** from `Shelf_<version>_x64-setup.exe`, on
   [this repository's latest release](https://github.com/ldallacqua/shelf/releases/latest).
   Windows warns the first time, since the installer is not signed (ADR 005): **More info**,
   then **Run anyway**. Then it asks nothing: a small window shows while it installs, for this
   Windows account only and without administrator, and Shelf opens.
   **It updates itself:** each time it starts, a small window looks for a newer version and
   installs it before opening Shelf. Left open, or in the tray, it also looks every hour: a
   version it finds shows **Update** in Shelf's header, and Restart and update installs it.
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
6. **Ready to play,** among your shelf's controls, leaves only the games you can start on this
   computer: a file chosen and still there, or a Steam app installed. It stays on until you
   press it again.
7. **While a game runs, Play is Stop,** however it was started, when the app can tell which
   program is the game. Stop asks it to close; a game that doesn't answer offers Force stop, with
   a warning. A launcher waiting, or a game Windows won't let the app check, says so instead.

8. **Download sources,** on Settings' Download sources page, are lists of games to download in the format
   Hydra uses (ADR 007, spec 7.10). Paste a source's address; adding one downloads nothing. Add only
   sources you trust: Shelf can't check where their links lead.
9. **Find a download,** in the ⋯ menu beside Play on a game of your own once you have a source, lists what your
   sources have with every word of the game's name. Choose one and a folder. It goes on with the window
   closed to the tray, and **Downloads**, from the icon in the header, shows how far along it is, with Pause and
   Cancel. Shelf never starts what it downloads.
10. **Real-Debrid,** on Settings' Download services page, signs in with a code you enter on its own page, and needs an
    account of your own. Then Find a download also offers **Through Real-Debrid**, for magnets and file
    hosts. It has to fetch a magnet first, which can take a while, and the card shows how far along it is.
11. **Extract,** on a finished download that brought a `zip`, `7z` or `rar`, unpacks it into a folder beside it.
    An archive with a password, or with paths that would leave its folder, isn't opened. **Choose the game's
    file** then opens Windows' picker in that folder, and Play on the game's page starts what you choose.
12. **Saves,** in the ⋯ menu beside Play on a game whose file is chosen, show where its saves were found
    (PCGamingWiki's list, through the Ludusavi manifest) and keep snapshots of them on this computer, with
    their history (ADR 008, spec 7.12). Turn them on, **Back up now**, and **Restore** any snapshot: what is
    here is kept as a backup first, and nothing is done while the game runs. A folder the list doesn't know is
    added by hand. Nothing is sent to Shelf. On Settings' Saves page, **Where they go** takes a folder of
    yours (one OneDrive, Google Drive for desktop or Dropbox syncs, a network drive, a USB drive): choose the
    same on each PC, and a game's Saves offers another PC's newer snapshot, or asks which copy to keep when
    both changed. The limits are there too. Once a game's saves are on, they are backed up when it closes,
    and **Play** looks first: it takes another PC's newer snapshot, or stops and asks when two copies
    differ. A Windows notification says when something needs you after a session. Where they go can also
    be your OneDrive or Google Drive: **Sign in** there opens Microsoft's or Google's page in your browser,
    and Shelf reaches only its own folder in it. Choose the same on each PC.

What the app keeps on this computer is the files chosen, in
`%APPDATA%\com.ldallacqua.shelf\launchers.json`, the sources, in `sources.json` and `sources\` beside it,
the list of downloads, in `downloads.json`, and the saves: what was decided for each game in `saves.json`,
the list of where games save in `save-manifest.json`, the snapshots in `saves\{entry}\`, what was there
before each restore in `save-backups\{entry}\`, those waiting for a folder that can't be reached in
`saves-waiting\{entry}\`, what was read of OneDrive or Google Drive in `saves-cloud\`, and while a restore
runs, `save-restore.json`. In a folder you chose, Shelf keeps its own, `Shelf saves`; in OneDrive, `Apps ›
Shelf`; in Google Drive, `Shelf saves`. A sign-in to either is in Windows' Credential Manager, as
Real-Debrid's is.
Uninstalling leaves those, and everything downloaded, in the folders you chose; delete the app's folder
to forget the rest.

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
| `pnpm desktop:release` | From a clean `main` that is GitHub's: the installer for the version in `tauri.conf.json`, signed with the key in `.env.local`, and `latest.json`, published as the release `desktop-v{version}`, which every installed app finds at its next start ([step 6](#step-6-updates-and-the-installer-in-one-step)) |
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
  splash/                The one local page, the splash: an update, then Shelf, or "Shelf can't
                         be reached" with Try again
  installer/             The installer's template: Tauri's, with its pages taken out
                         and its one page drawn as the splash
  icons/                 Made from src/app/icon.svg by the Tauri CLI's `icon` command, Windows' only
  src/
    main.rs, lib.rs      The window, and what the app keeps while it runs
    commands.rs          What Shelf's pages may ask, each checking what it is given
    ids.rs               What an entry's id and a Steam app id may be
    navigation.rs        Which addresses stay in the window (unit-tested)
    launchers.rs         The files chosen, kept in launchers.json
    sources.rs           Download sources (ADR 007): which addresses, read, checked, kept, searched
    source_window.rs     A window the person can see, for an address that only answers a browser
    downloads.rs         Downloading from them: one at a time, resuming, and never starting anything
    extract.rs           Opening what arrived: zip, 7z, rar, every path checked before anything is written
    real_debrid.rs       Real-Debrid: its device sign-in, kept in Credential Manager, and its API
    launch.rs            Starting a file as Explorer does, or Steam
    steam.rs             Steam's folders: which apps are installed, asked or all
    shortcut.rs          What a chosen .lnk or .url points at
    processes.rs         What Windows says is running, and asking it to close or ending it
    running.rs           Which of that is a game, and the game's state (unit-tested, no process)
    saves/               A game's saves (ADR 008): paths.rs (the manifest's placeholders as this
                         computer's folders, and those too wide refused), manifest.rs (the Ludusavi
                         manifest, read from its address), snapshot.rs (a zip and its list, and which
                         copy wins), restore.rs (every path checked, then put back), mod.rs (saves.json),
                         remote.rs and cloud.rs (OneDrive and Google Drive, the only code that knows
                         their addresses), sign_in.rs (their pages, with PKCE and a loopback address)
  examples/stand_in.rs   A stand-in for a game, for the tests, that takes no focus
  tests/fixtures/        Steam's files as Steam writes them, and a shortcut, for the tests
src/features/desktop/    The site's side: Tauri's global (tauri.ts), the commands that answer
                         with data (bridge.ts), and the window's bar (window-script.tsx,
                         window-controls.tsx, and frame.ts, fetched only in the app)
src/features/game-detail/play.tsx   Play, under Mine
src/features/game-detail/use-game-state.ts   Asks whether the game is running, and when
src/features/library/use-ready.ts   Ready to play: which of my games this computer can start
src/features/desktop/saves*.tsx, save-settings.tsx   A game's saves, from Play's menu, and their limits
fixtures/saves/manifest.yaml        Where made-up games save, in the manifest's shape, for the tests
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
- An update is installed only when its signature is made with the app's key and names the
  version `latest.json` announces (`requireSignedVersion`): a `latest.json` that pairs a newer
  number with an older release is refused. `pnpm desktop:release` refuses to publish a
  signature without its version.
- The splash may ask `start`, and move and close its own window; nothing else.
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
  the header's right end and shows the controls there (`window-controls.tsx`, drawn on the
  server for every page, shown only by that variant). What they do is `frame.ts`, which
  `window-frame.tsx` fetches once the page runs and only in that window, so a visitor's page
  carries none of it: it gives the header Tauri's `data-tauri-drag-region="deep"` (an app with
  Windows' bar would refuse the drag, and say so in the console), acts on the controls' clicks,
  marks `<html>` `data-maximized` for the restore button, and draws the page's scrollbar below
  the header, Windows' own being hidden there.
- Ready to play asks `playable` (no argument: the entries whose file is still there, every
  Steam app installed) and `GET /api/v1/me/play` (each of my games' address, entry and apps on
  Steam), both in `features/desktop/playable.ts`, fetched only in the app on one's own shelf
  and read without Zod; `domain/library/ready.ts` matches them. The library leaves the other
  games out before drawing anything (`onlyReady`, as `withoutAdult`), and waits in ghosts until
  both have answered. The button carries `data-play`, so `pnpm desktop:check` reads pages
  without it.
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
private notes, a private game, the trophy wall, the placing page and Settings with its
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

**Built 25 Oct 2026.**

- [x] `playable`: the entries whose file is chosen and still there, and every Steam app
      installed here (each library's manifests, flag 4). It takes nothing.
- [x] `GET /api/v1/me/play`: each of my games' entry id and apps on Steam, worked out as
      `steam.known` is for one game; `private, no-store`.
- [x] **Ready to play** (Prontos para jogar) among the library's controls, on one's own shelf in
      the app only: a choice of this device (`preferences.ts`) that leaves only the ready games
      in the library before anything is drawn from it, as hiding adult games does. While what is
      ready is not known yet, the shelf waits in ghosts rather than show every game first. What
      is ready is read again when the window comes back to the front and when Play changes a
      file.
- [x] Nothing ready: the shelf says so, and offers to show every game.
- [x] Tests: Steam's fixtures (an installed game listed, a half-downloaded one not); the read
      gives each of my entries with its apps, never another library's; the choice leaves only
      the ready games, with counts to match.

**Done when** Ready to play leaves exactly the games with a file that is still there or a Steam
app installed, in every view, with counts to match, and is still on the next time the app
opens. Checked by `pnpm desktop:check`: with Bloodborne's file chosen, Ready to play left 3 of
the sample's 230 games, Bloodborne and two whose Steam apps this computer has installed.

### Step 6: Updates, and the installer in one step

**Built 25 Oct 2026.**

- [x] The repository public (the owner's choice), after its whole history is searched for
      anything secret.
- [x] A signing key: the private half in `.env.local` (`TAURI_SIGNING_PRIVATE_KEY` and
      `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, names in `.env.example`), the public half in
      `tauri.conf.json`. The owner keeps a copy of the private half elsewhere.
- [x] Tauri's updater (`tauri-plugin-updater`), reading
      `https://github.com/ldallacqua/shelf/releases/latest/download/latest.json`, installing in
      the installer's passive mode.
- [x] The splash: a small window of the app's own, first at every start. It looks for an update
      (a few seconds at most), downloads one showing how far, installs it and starts the new
      version; then opens Shelf in the main window, unseen until its page is there, and closes.
      Shelf not answering: it says so, with Try again and Close. A development build skips
      the update.
- [x] The installer in one step: a template of our own (`desktop/installer/`), Tauri 2.12.4's
      without its pages. One small window like the splash while it installs, then Shelf opens;
      an update runs the same.
- [x] While it runs (9 Nov 2026): every hour, from half an hour after it starts, the app looks
      and downloads; the header shows **Update**, whose Restart and update installs it
      (`desktop/src/updates.rs`). A development build looks for none: `SHELF_UPDATE_STAND_IN`
      names a version for a person to see the button, and installing it fails.
- [x] `pnpm desktop:release`: from a clean `main`, builds the version `tauri.conf.json` names,
      signed, writes `latest.json`, and publishes the release `desktop-v{version}` with the
      installer, its signature and `latest.json`.
- [x] Version 0.2.0, the first released. It is installed by hand once over 0.1.0, which has no
      updater; every later version arrives by itself.

**Done when** the installer opens Shelf without a click, and a newer release published is
installed at the next start without one. Checked: the installer, built under another name so
the owner's Shelf was left alone, installs with no question, shows the splash's window (Shelf's
icon, "INSTALANDO O SHELF", the bar, in Windows' dark), and opens the app; `pnpm desktop:check`
sees the splash open Shelf and go, and say Shelf can't be reached when nothing answers. An
update arriving is seen only with a second release: 0.2.0 is the first.

Two things the window kept were fixed on the way: the size and place it remembers no longer
include whether it had Windows' bar (0.1.0 remembered yes, and would have put it back), and a
development build with a profile of its own no longer reads or writes the installed app's
memory of its window.

### Step 7: Hours for every PC game

Replaced on 31 Oct 2026 by what the owner asked for: what it counts, and why, is ADR 005,
section 12.

**Built 31 Oct 2026.**

- [x] `tracker.rs` decides from what it is told, and keeps sessions in `play-sessions.json`;
      `watch.rs` looks at the program in front every 5 seconds; `pads.rs` hears controllers while
      a game is in front; `tray.rs` and `autostart.rs` keep it counting with no window.
- [x] The server: `play_sessions`, `POST /api/v1/me/play/sessions`, and the page's
      `send-played.ts`. Sent twice is one session. An app older than these commands sends nothing.
- [x] Hours can't be typed, and the game's page says what time away is.
- [x] Tests: every rule of time away with no clock and no game; the page with the bridge faked; the
      server on a real database.
- [x] `pnpm desktop:check` has a stand-in take the focus and touch a key nothing uses, and sees
      its seconds counted and sent.
- [ ] By hand, on an installed version: a game opened from Steam with the window closed; a game
      played on a controller, with no key touched, going on counting; leaving it for over 5
      minutes, and that stretch not counting; turning off Start with Windows.

**Done when** the owner has seen those on an installed version.

### Step 8: Play turns to Stop

Issue 102; what counts as evidence, and the limits, are ADR 005, section 11.

**Built 31 Oct 2026.**

- [x] `running.rs` decides from what is read; `processes.rs` reads it and acts; `shortcut.rs` reads
      `.lnk` and `.url` files. `play` starts with `ShellExecuteExW` to learn the process it
      started, and starts nothing for a game starting or running.
- [x] `game_state`, `stop_game`, `force_stop_game`, each taking an entry and Steam apps.
- [x] Play's states (`play.tsx`, `use-game-state.ts`), and `Confirm` in `src/ui`. An app older than
      these commands keeps Play as it was: the site is updated before an app is.
- [x] Tests: every rule of evidence without a process; closing, ending, a reused id and a process
      with no window on `examples/stand_in.rs`; the button with the bridge faked.
- [x] `pnpm desktop:check` plays a stand-in through a script in the real app: Play to Stop, Stop,
      ended from outside, and Force stop behind its question.
- [ ] By hand, on a game from a file and a Steam game: Play to Stop, Stop, closing it from the
      game, starting it outside Shelf, and Windows waking up. No test may do this: no script
      starts a real game or opens Steam.

**Done when** the owner has seen those on an installed version.

### Step 9: Saves on this computer

Issue 151, [ADR 008](adr/008-save-sync.md)'s phase 2; spec 7.12.

**Built 7 Nov 2026.**

- [x] `saves/`: the manifest read a game at a time from its address, with its `ETag`, kept small; a game
      found by its Steam apps, then its title's words; `<base>` from the chosen file; every location
      checked against the folders too wide to be one game's.
- [x] Snapshots: a zip and its list, never overwritten, parents named, history pruned to the caps;
      Restore with every path checked first, what is here backed up, staged, and a journal that undoes one
      cut short at the next start. Going back by hand makes the snapshot the latest.
- [x] Commands: `saves`, `turn_saves`, `back_up_saves`, `restore_saves`, `add_save_folder`,
      `remove_save_location`, `choose_save_game`, `choose_game_folder`, `show_save_snapshot`, `save_caps`,
      `set_save_caps`. None takes a path, reads a save's bytes or deletes a snapshot; none acts while the
      game runs.
- [x] Saves in Play's menu (`saves-panel.tsx`), and Settings' Saves page (`save-settings.tsx`), with their
      stories. An app older than these commands offers neither.
- [x] Tests: every rule above with made-up games and temporary folders; the page with the bridge faked;
      `pnpm desktop:check` adds a folder, backs up twice and restores the first in the real app.
- [ ] By hand, by the owner, on an installed version: a game from outside the stores, its saves found or
      added, backed up, played, backed up again, and an older one restored.

**Done when** the owner has seen those on an installed version.

### Step 10: Saves between PCs, through a folder

ADR 008's phase 3; spec 7.12.

**Built 7 Nov 2026.**

- [x] This PC's place (`saves.json`'s `place`), `Shelf saves` inside it, this PC's history copied there;
      snapshots waiting in `saves-waiting\` while it can't be reached, and sent when it can.
- [x] Section 5's table on the page: another PC's newer snapshot offered, and the choice, settled by
      `keep_saves` with a snapshot whose parents are every latest one.
- [x] Commands: `save_place`, `choose_save_place`, `forget_save_place`, `keep_saves`.
- [x] Tests: two made-up PCs sharing a folder (one then the other, both, two latest), a folder gone and
      back, the history taken along; the page's choice and Settings' place with the bridge faked;
      `pnpm desktop:check` chooses a folder and finds the history there.
- [ ] By hand, by the owner, on two PCs with an installed version: one folder synced between them, a game
      played on one and opened on the other, and a choice after playing both.

**Done when** the owner has carried a game's progress between two PCs.

### Step 11: Saves by themselves

ADR 008's phase 4; spec 7.12.

**Built 8 Nov 2026.**

- [x] After a session: the tracker says which games' sittings ended (`Ended`), and a game whose saves are
      on gets a snapshot unless what is here is known, on a thread of its own, never while it runs.
- [x] Before Play: `play` takes `check` and answers `{ started, saves }`, the look's verdict done (in
      step, backed up, restored, unreachable, a choice, failed); a choice starts nothing, and a backup or
      restore going on is waited for, then refused as `busy`.
- [x] Windows notifications (`tauri-plugin-notification`), in Windows' language, for a choice waiting, a
      backup that failed and a folder out of reach (`saves/notice.rs`); nothing when all went well.
- [x] The page: Play says Starting while it looks, opens Saves on a choice (Keep and play, Decide later),
      and says when the game started with what is here.
- [x] Tests: two made-up PCs through Play and sessions (taken across, a choice, nothing played, a folder
      gone, a damaged snapshot); the page with the bridge faked; `pnpm desktop:check` changes the saves
      with the game closed and while it runs, and finds a snapshot from Play and one after the session.
- [ ] By hand, by the owner, on two PCs with an installed version: a game played on one and started with
      Play on the other, taking the first's progress; a choice after playing both; a notification seen.

**Done when** the owner has played on one PC and pressed Play on the other.

### Step 12: Saves through OneDrive and Google Drive

ADR 008's phase 5; spec 7.12.

**Built 8 Nov 2026,** and offered by a release only once Shelf is registered with each service.

- [x] `saves/remote.rs`: a service as a folder of snapshots, read once and kept in `saves-cloud\`, written
      from `saves-waiting\`, archive first; `saves/cloud.rs`: OneDrive's app folder (Microsoft Graph) and
      what Shelf made in Google Drive (`drive.file`), sent in pieces, tokens refreshed, refusals read as
      out of reach, signed out or full; `saves/sign_in.rs`: the service's page in the browser, PKCE, and an
      address on this computer to come back to.
- [x] Commands: `sign_in_save_cloud`, `cancel_save_sign_in`, `use_save_cloud`, `sign_out_save_cloud`; and
      `save_place` names the services this build can sign in to.
- [x] Settings' Where they go as a list of places, and the game's Saves and Play saying a service signed
      out of or full. Stories for each.
- [x] Tests: the sign-in with PKCE checked, sending in pieces, reading, deleting and refreshing, against a
      stand-in for each service; two made-up PCs through a service; the page with the bridge faked;
      `pnpm desktop:check` signs in to a stand-in OneDrive, sends this PC's history and Play's snapshot
      there, and signs out.
- [x] **By the owner: registering Shelf with Microsoft.** At [entra.microsoft.com](https://entra.microsoft.com)
      (or portal.azure.com), signed in with your Microsoft account (if it says you have no directory,
      the free Azure account it offers makes one; nothing is charged for this): **App registrations ›
      New registration**. Name it **Shelf**, which names its folder in OneDrive (`Apps › Shelf`); for
      who can use it choose **Accounts in any organizational directory and personal Microsoft
      accounts**; for the redirect URI choose **Public client/native (mobile & desktop)** and enter
      `http://localhost`. Once made, **API permissions › Add a permission › Microsoft Graph › Delegated**:
      `Files.ReadWrite.AppFolder` (`openid`, `profile` and `offline_access` are asked for at sign-in).
      Copy the **Application (client) ID** from Overview into `.env.local` as `SHELF_ONEDRIVE_CLIENT_ID`.
- [x] **By the owner: registering Shelf with Google.** At
      [console.cloud.google.com](https://console.cloud.google.com), a new project, **Shelf**. Enable the
      **Google Drive API** (APIs & Services › Library). In **Google Auth Platform** (the OAuth consent
      screen): app name **Shelf**, your email, audience **External**; under Data access add the scopes
      `.../auth/drive.file`, `openid` and `.../auth/userinfo.email`; under Audience, **Test users**: your
      Google account. Under **Clients › Create client**, type **Desktop app**, named **Shelf for
      Windows**; copy its client ID and client secret into `.env.local` as `SHELF_GOOGLE_CLIENT_ID` and
      `SHELF_GOOGLE_CLIENT_SECRET` (Google shows the secret only then).
- [x] **Checked against the real services** (8 Nov 2026), the owner signing in: a debug build with the
      registrations, a made-up game's saves and `pnpm serve:test`. On each, this PC's two snapshots went
      up by themselves after signing in, Back up now sent a third, the game's Saves listed the three read
      from the service, restoring the first downloaded it, and signing out forgot the sign-in (at Google,
      ended it there). The check's files were put in each one's recycle bin. On the very first OneDrive
      sign-in the two snapshots went up only with the next backup, most likely while OneDrive was making
      `Apps › Shelf`; it didn't happen again.
- [ ] **By the owner: publishing Shelf at Google.** Left in Testing, only test users can sign in, and
      Google ends each sign-in after seven days: Shelf then says it is signed out, and Sign in again
      brings it back. Publishing asks, under **Branding**, for a home page, a privacy policy and terms of
      service (`/privacy`, `/terms`) on an authorized domain, which Google doesn't take on `vercel.app`:
      it needs a domain of Shelf's own, added to Vercel. Then **Remove** the logo (a logo makes Google
      review the app first) and **Publish app** under Audience: these scopes need no review.
- [ ] A release with them (`pnpm desktop:release` reads them, and says which services it built in, never
      their values), then by hand on two PCs: sign in to the same service on each, play on one and press
      Play on the other.

**Done when** the owner has carried a game's progress between two PCs through OneDrive or Google Drive.
Next: S3-compatible storage, an access key pasted for one bucket; and taking a game's history along when
the place changes, from a service too ([issue 170](https://github.com/ldallacqua/shelf/issues/170)).

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
  each beside the same page read in a plain Chromium. Both have their HTTP cache off, so they ask
  the server for every answer, as a browser does on production (architecture section 25, row
  "Desktop check, idle"). It is a check run by hand, not one of the browser tests, which stay
  off until the MVP.
- **Never:** a real game started by a test, a real Steam opened, production signed in to by a
  script.

## 6. When something goes wrong

| What happens | Why, and what to do |
| --- | --- |
| Windows says it protected the PC | The installer is not signed: More info, Run anyway |
| "Shelf can't be reached" | No internet, or the site is down: Try again when it is back |
| An update never arrives | The app looks at `latest.json` on this repository's latest release, for five seconds at each start: if GitHub is slow it goes on to Shelf and tries the next time. A release whose signature is not made with the key in `.env.local` is refused by every installed app |
| The key in `.env.local` is lost | Installed apps cannot be updated any more: make a new key, put its public half in `tauri.conf.json`, and install that version by hand once |
| Play says the file is gone | The game moved or was uninstalled: Choose the file again |
| Play shows while the game is open | Nothing ties what is running to the game: its launcher left, and the game is in another folder. Choose the game's own file instead of its launcher |
| Stop shows while only the launcher is open | A launcher whose file doesn't say it is one reads as the game. Choose the game's own file |
| "Running", with no Stop | Steam says the game is running but no program from its folder is, or Windows won't let the app check it. Close it from the game. If nothing is open, Steam's mark is stale: restart Steam |
| Stop says Windows did not let it | The game runs as administrator, or is protected. Close it from the game |
| A game opens and closes at once | It needs another folder or arguments: point at its launcher, or at a shortcut (`.lnk`) that has them |
| Steam opens on the game's page, not the game | Steam does that for a game with several ways to start: pick one there once |
| A game's hours don't grow | Shelf for Windows wasn't running (look in the tray), the game wasn't in front, or a session is still open: hours arrive when the game closes |
| Hours stop on a controller | Time away is decided from what Windows shows of the controller: with HidHide or similar hiding it, only keys and the mouse count |
| The app opens blank | WebView2 is missing or broken: Windows Update, or Microsoft's WebView2 installer |
| `cargo` not found, though Rust is installed | A stray `"` in Windows' PATH (the owner's has one after `C:\Program Files\dotnet`) hides every folder after it from cmd and from Rust. The `desktop:` scripts tidy PATH for what they start; remove the quote in Windows' environment variables to fix it everywhere |
