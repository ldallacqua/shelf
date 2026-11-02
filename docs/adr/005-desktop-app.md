# ADR 005: Shelf for Windows, a desktop app that plays the games

- **Status:** accepted, 25 Oct 2026; amended the same day with the window's own title bar,
  Ready to play, updates and the installer in one step (sections 8 to 10), and on 31 Oct 2026
  with whether a game is running (section 11)
- **Date:** 25 Oct 2026
- **Decides:** how Shelf becomes an app on the owner's computer that starts their games, as
  Hydra does, while the site stays what it is
- **Built in steps:** [the desktop guide](../desktop.md), which also says how to build, run and
  install it
- **Changed by:** [ADR 007](007-download-sources.md), 1 Nov 2026: the app reads download sources, so one
  command takes an address, and downloading is now something Shelf does

## Context

The owner, on 25 Oct 2026: "quero converter esse projeto não somente em um browser mas tbm em
um projeto que vai rodar no meu computar para eu executar meus jogos direito dele, tipo o hydra
sabe. [...] Eu vou poder apontar o caminho no meu pc do game local e ele vai rodar o game, se o
game for da steam ele vai rodar o comando que executa o game pela steam." Shown the research
(Tauri or Electron, in phases), they chose: "vamos usar tauri mesmo, Desde que o projeto
continue mostrando todos os meus dados corretamente na versão baixada ta tudo certo."

So the one condition is that the downloaded app shows everything the site shows, correctly.

Having installed it, the owner asked four more things the same day:
"* vai ter um instalador no github para as pessoas baixarem ne mas eu queria atualização
automatica, é o melhor cenario, tem como? * Tem como tirar a barra de cima nativa do windows?
queria algo mais parecido com o discord, mais integrado sabe? Sem redundacia do nome shelf
tanto na barra nativa quanto na nav bar. * No app instalado precisamos de um "filtro" que
mostre jogos instalados. Igual o botão da steam "Exibir apenas jogos prontos para jogar" * Se
possivel queria que o instalador fosse mais paracido com o do discord. Que não tem que ficar
clicando setup setup, next, next. E sim aparecesse uma splashzinha."
Told the repository is private, so nobody can download from it without signing in, the app
included, they chose to make it public.

What the site is today decides most of the rest:

1. **Shelf is a server.** Pages are built and cached on Vercel, data is in Turso, sign-in is a
   session on the server, IGDB is asked with a secret. None of that can be shipped inside an
   installer: a secret in an app is a secret given away.
2. **A browser can open Steam but never a file.** A `steam://rungameid/{app}` link opens Steam
   from any page, after the browser asks once. Nothing a page does can start an `.exe`.
3. **What a computer has is that computer's.** The path to a game on this PC means nothing on
   another, and nothing on the server needs it.
4. **Steam already counts its own hours,** and the Steam sync brings them in daily. A game's
   hours are the larger of what I typed and what its sources report together (spec 7.3), so
   counting a Steam game again would count it twice.

Hydra, the reference the owner named, is Electron, React and TypeScript with a Rust addon. It
keeps its data on the computer, starts a game from its file or through Steam's link, and counts
time by looking at the running processes every few seconds, sending the total to its server
every three minutes ([its code](https://github.com/hydralauncher/hydra), read 25 Oct 2026). Its
centre, downloading games, is not something Shelf does.

## Decision

### 1. Tauri 2, Windows first

The app is [Tauri 2](https://v2.tauri.app): a Rust program that shows pages in Windows' own
web view (WebView2, Chromium-based, part of Windows 11). An installer of a few megabytes, little
memory while a game runs, and the native part is small: a file picker, starting a program,
reading Steam's folders, looking at processes. This computer has what building needs: Rust
(stable, MSVC), Visual Studio Build Tools 2022 and WebView2.

Electron was the alternative: TypeScript throughout, as Hydra is, but a Chromium of its own
(an installer near 100 MB) and more memory beside every game. The owner chose Tauri.

Mac and Linux are not built. Tauri can build both; nothing here stops it, but nothing is tested
there.

### 2. The app opens the hosted Shelf, not a copy of it

The window opens `https://shelf-ldallacqua.vercel.app`, the same address a browser does. Every
page, every number and every game is the one the site serves, signed in with the same account,
so the app cannot show different data from the browser: there is only one Shelf. This is what
meets the owner's condition.

Nothing of the site is bundled but one local page, the splash (section 9), which opens Shelf or
says it cannot be reached ("Shelf can't be reached", and Try again). Without the internet the
app has no shelf to show; a list of the games set up on this computer, to play offline, is a
later step.

A build for development opens the address in `SHELF_URL` instead (`http://localhost:3300`, the
local server); a release build opens production only.

### 3. A bridge of a few commands, for Shelf's own pages only

The pages ask the app to act through Tauri's commands. Each command takes ids, never a path or
a command line. What the app may do is the list below, nothing more:

| Command | Does |
| --- | --- |
| `desktop_info` | The app's version: how a page knows it is inside the app |
| `launcher` | For an entry, the file chosen for it on this computer, if any, and whether it is still there |
| `choose_launcher` | Opens Windows' own file picker for an entry, titled with words the page gives, and keeps the file chosen |
| `forget_launcher` | Forgets an entry's file |
| `show_launcher` | Opens the folder of an entry's file in Explorer, the file selected |
| `play` | Starts an entry from the file chosen for it |
| `steam_installed` | Of the Steam app ids a page names, the ones Steam has installed on this computer |
| `playable` | What is ready to play on this computer: the entries whose chosen file is still there, and every Steam app installed. It takes nothing |
| `game_state` | Whether a game is running (section 11), for an entry and its Steam apps installed here |
| `stop_game` | Asks that game to close, whichever processes are identified as it now |
| `force_stop_game` | Ends those processes at once. The page has asked the person first |

- **Only Shelf's origin may call them.** Tauri allows a remote page no command unless a
  capability names its address (`remote.urls`); Shelf's capability names the one address the
  build opens. Steam's and Nintendo's sign-in pages, which open in the same window, get
  nothing.
- **A path enters only through the file picker,** which the person sees and answers. A page
  cannot hand the app a path, so a page that went wrong could at worst start a game I chose, or
  Steam.
- **A Steam app id is digits only,** checked by the app, and opens nothing but
  `steam://rungameid/{id}` or `steam://install/{id}`.
- No plugin's own JavaScript API is allowed to the page: no file system, no shell.
- **The window's own controls** (section 8) are Tauri's window commands, allowed to Shelf's
  origin as well: minimize, maximize, close, whether it is maximized, and dragging. They act on
  the window the page is in, and on nothing else.

### 4. What is the computer's stays on the computer

The files chosen are kept in the app's own folder (`%APPDATA%\com.ldallacqua.shelf\
launchers.json`), by entry id. They are never sent to Shelf's server, and another computer
keeps its own. An entry's id is stable for the game's life on the shelf; a game removed and
added again, or a version separated, is a new entry and asks for its file again.

### 5. Starting a game

- **From a file:** as Explorer starts it (`ShellExecuteEx`, verb `open`), in the file's own
  folder. Explorer's way is what lets a game that needs administrator ask Windows for it
  (starting it directly fails with error 740), and what opens `.lnk`, `.url` and `.bat` files;
  many games break when started from another folder.
- **Through Steam:** `steam://rungameid/{app}`. The app id is the one the Steam sync recorded
  for the copy (`source_items.store_id`), which is the app the account owns; failing that, in
  the app only, one IGDB lists for the game (`games.store_ids`) that Steam has installed here.
  A Steam game not installed offers `steam://install/{app}`, which opens Steam's own installer.
- **Which wins:** a chosen file, then Steam. A game owned on Steam but run from another file
  (a mod loader) is started from the file.
- **Steam is reached by its links, not by a command** (as built, 25 Oct 2026): the page links
  to `steam://rungameid/{app}` or `steam://install/{app}`, and the window hands those two to
  Windows, as section 6 says. So `play` needs no Steam id, and a page that went wrong can open
  nothing of Steam's but those two links, which a browser page can open too.

### 6. The window keeps to Shelf

Shelf's own pages open in the window, and so do the sign-in pages the account page sends to
for linking (Steam's OpenID, Nintendo's accounts), whose way back is Shelf. Any other web
address opens in the default browser. Of the other schemes, only `steam://rungameid/` and
`steam://install/` are passed to Windows.

### 7. Hours, for the games started from a file

Replaced by section 12 (31 Oct 2026): the app counts every PC game it can name, Steam's too,
and hours are never typed. Written first as: the app watches only the game it started, and a
game started through Steam is Steam's to count.

### 8. The window is Shelf's own

Windows' title bar is gone (the window has no decorations): Shelf's header is the bar, so the
name shows once. The header's empty parts move the window and a double click maximizes it
(Tauri's `data-tauri-drag-region="deep"`; links, buttons and fields keep their clicks), and
minimize, maximize and close sit at its right end, in Windows' sizes, close turning red as
Windows' does. Windows still gives the window its edges to resize, its shadow, its rounded
corners and snapping when dragged to a side.

The site draws the controls only when the app says its window has no bar: the app runs a line
of its own before any of the page's scripts (`window.__SHELF_WINDOW__ = 'frameless'`), and
Shelf's head script mirrors it on `<html>` before the first paint. An app built before this,
with Windows' bar, says nothing, and never shows two sets of controls.

In the app the page's scrollbar is Shelf's own: Windows' would run the window's whole height,
beside the close button. Shelf's is thin, starts below the header, and lies over the page,
shown while the page scrolls or the pointer is on it; the wheel and the keyboard scroll the
page as before.

### 9. Updates, checked at every start

- **Where:** each version is a release of this repository, public since 25 Oct 2026, tagged
  `desktop-v{version}`: the installer, its signature, and `latest.json`, the description
  Tauri's updater reads, at `releases/latest/download/latest.json`.
- **Signed:** with a key of the app's own (Tauri's updater signs with minisign). The public half
  is in `tauri.conf.json`; the private half is a secret, kept in `.env.local`
  (`TAURI_SIGNING_PRIVATE_KEY`) like every other, and the owner keeps a copy elsewhere: an
  installed app takes only updates signed with it, so losing it means installing the next
  version by hand. An update whose signature does not match is not installed.
- **When:** at every start, the app first opens a small window of its own, the splash, as
  Discord does. It looks for a newer version, for a few seconds at most; if there is one it
  downloads it, saying how far it is, installs it without a question (the installer's passive
  mode) and starts the new version. Then it opens Shelf: the main window loads the page unseen
  and appears once it is there, and the splash closes. If GitHub does not answer, it goes on to
  Shelf.
- **Made by hand:** `pnpm desktop:release`, from `main`, publishes the version
  `tauri.conf.json` names. Nothing on GitHub's side runs by itself.

### 10. Installing in one step

The installer is Tauri's NSIS installer with a template of our own: Tauri's, as CLI 2.12.4 ships
it, with its pages taken out. It asks nothing. While it installs (for this Windows account, as
before) it shows one small window like the splash, with Shelf's mark and a bar; it closes Shelf
if it is open, adds the Start menu and desktop shortcuts, and opens Shelf. An update runs the
same installer. Uninstalling is from Windows' settings, as before.

### 11. Whether a game is running, and stopping it

Issue 102 asks that Play turn to Stop while a game runs, as Steam's does, and be right about it.
Checked on the owner's Windows 11 on 31 Oct 2026, read only, with a Steam game open: Steam's own
mark and three processes in the game's install folder agreed, every one of 265 processes could
be read without administrator, and the list took 37 ms through .NET, less directly.

**What counts as evidence that a process is the game.** Only these, and never a process's name
or a window's title:

| Evidence | Comes from |
| --- | --- |
| Its file is the file chosen, or what a chosen `.lnk` points at (`shortcut.rs`) | The process's whole path |
| It runs from inside the folder Steam installed the app in, read from its manifest | The process's whole path, and `appmanifest_{id}.acf`'s `installdir` |
| It descends from what Play started, and stands in the game's folder or the one above it | Windows' answer to Play, and each process's parent |
| It appeared, while the game was starting, in the folder of the file chosen | The moment it started, and its whole path |

The last is for a launcher that asks something else to start the game and leaves. It holds only
for the minute after Play, and never in a folder many programs share (a disk's top, Program
Files, the home folder, Steam's list of games), since `D:\Games\` holds other games too.

**What is never the game,** whatever else is said of it: anything in Windows' folder (a script's
`cmd.exe`, a crash's reporter), anything of Steam's own outside its `steamapps`, Steam's
`_CommonRedist` installers, and a program whose file says it only starts others (`launcher` in
its name, or a store's own). That last reads a name, as a reason to offer less and never more.
Those are left out of Stop too, so stopping a game leaves its launcher and Steam alone.

**A process is its id and the moment it started.** Windows gives an id out again, so a parent is
only a parent if it started first, and every action re-identifies the game, opens each process,
checks its start on that handle, and acts while holding it: that id cannot change hands meanwhile.
A page names an entry and Steam apps, and the app works out the rest; no command takes an id or
a path, and an app it can name has to have a manifest on this computer.

**What is not known is said.** A game has five states: `stopped`, `starting`, `running`,
`stopping`, and `unverified`, which has no Stop and says why:

- `steam`: Steam says it is running (`Software\Valve\Steam\Apps\{id}\Running`, not documented by
  Valve, and it can stay set after Steam crashes), and no process shows it. Never enough for a Stop.
- `denied`: Windows would not say what a process with the game's file's name is, or would not
  list processes at all.
- `open`: what Play started is still open a minute on, and nothing shows it is the game: a
  launcher waiting, a script.

**Stopping.** Stop posts `WM_CLOSE` to the game's visible windows, as their close button does.
Valve documents no command that stops a game, so a Steam game is asked the same way, and Steam
sees it close. Only the game gone says it stopped, whatever was asked.
After 20 seconds, or at once for a game with no window to ask, Force stop is offered, behind a
question that says what is lost (`TerminateProcess`). Windows refusing either (a game running
as administrator, asked by an app that is not; a protected process) is said, and the game stays
as it is.

**Cost.** The page asks every 5 seconds while Play shows, each second while starting or
stopping, and never while the window is hidden; coming back, it looks at once, which is also
what covers Windows waking up. The app looks each second for the minute after Play, then every 5
seconds while something Play started runs, and not at all otherwise. Each look lists the
processes once and asks each for its path and start, the least Windows offers: nothing is
injected into a game, and nothing of its memory read.

**Known limits.**

- A launcher not called one that stays open by itself reads as the game: its file is the one
  chosen. Pointing Shelf at the game's own file avoids it.
- A game started by a launcher that has left, in another folder, or started outside Shelf, or
  already running when Shelf started, is known only if its file is the one chosen: nothing else
  ties it to the game. After Shelf restarts it reads `stopped`, and Play stays what it does
  anyway. A game whose launcher runs the whole time is unaffected, and a Steam game always is.
- A Steam game whose program runs outside its install folder reads `steam`, with no Stop.
- Every instance of a game's file is the game: Stop closes them all.
- A game that answers `WM_CLOSE` with a question ("Quit without saving?") waits for it, as with
  its own close button, until Force stop is offered.

Hours (section 7) can use the same evidence when they are built; nothing here counts time, so
nothing is counted twice and Steam's hours are untouched.

### 12. Counting play

The owner, 31 Oct 2026: take typing hours away, and show what the app counted by itself, only
active time, games on a console keeping their platform's hours. So:

- **What counts.** A stretch counts while a game's program holds the foreground window (a game
  behind another window is not being played) and input keeps arriving. The foreground window's
  program is the only one looked at, so nothing is read of anything else, and no process list is
  taken while nothing is being counted. It is a game by the evidence of section 11: its file is
  the one chosen for an entry, it descends from what Play started, or it runs from where Steam
  installed an app. A launcher alone is not a game.
- **Time away.** After **5 minutes** (`AWAY_AFTER_MINUTES`, `AWAY_AFTER` in `tracker.rs`) with
  no input, the whole stretch since the last input is dropped, not just what came after the five
  minutes: walking away for an hour costs no hours. The owner asked for about 1 minute and to
  check it. A minute would throw away play: cutscenes, reading, thinking, loading, holding a
  throttle. ActivityWatch waits 3 minutes and a launcher built the same way 5. A cutscene past
  5 minutes is lost, which the page says; Steam's own count keeps it.
- **Input.** `GetLastInputInfo` for keys and the mouse. It does not see controllers: Valve says
  so of Steam Input, and it is why every tracker that only asks it stops counting pad play. So
  controllers are read too: XInput, and Raw Input for the others (usage pages for joystick,
  gamepad and multi-axis, with `RIDEV_INPUTSINK`, on a message-only window). Only whether
  something changed is kept. A stick has to move an eighth of its range, as they drift; motion
  sensors are not looked at. **A controller whose report Windows can't parse counts as input**:
  a game wrongly counted as played is a smaller error than a game played and never counted.
- **No hooks, no injection.** Nothing touches a game's process. Anti-cheat has nothing to object to.
- **Where it runs.** On a thread of the app, not in a page, so it counts with no window open. Closing
  the window leaves the app in the tray, and the window's web view is destroyed, so it costs
  little. The app starts with Windows, in the tray (`--background`), so a game opened from Steam
  counts without opening Shelf first; the tray's menu turns that off. A development build never
  writes to the registry.
- **Sessions.** A game's stretch of play is one session with a random id, written to
  `play-sessions.json` every 30 seconds, so a crash or a power cut loses 30 seconds at most. Time a
  sleeping computer spent is never counted: a gap between two looks longer than 15 seconds adds
  nothing. A session ends when the programs seen of it have all ended.
- **Reaching the server.** The page, only inside the app, asks for what is finished and sends it to
  `POST /api/v1/me/play/sessions` once a minute and when the window opens, then tells the app what
  was kept. Sent again it is the same session, the larger number winning. A Steam session names its
  app and the server finds the game; one on no shelf stays on the computer, for when it is added,
  up to 90 days.
- **Which number shows.** `playedMinutes`: on a PC the larger of the app's and Steam's, since they
  count the same play; a console's add to that. Hours typed before this stay in `play_time`,
  counting for nothing, so taking the decision back loses nothing.
- **What it can't do.** A game played with the app closed by hand is not counted. Two games in
  front in turn are two sessions; a game in a window with something else in front is not counted
  even if played with a controller.

Researched on 31 Oct 2026: [Hydra's process watcher](https://github.com/hydralauncher/hydra/blob/main/src/main/services/process-watcher.ts)
counts every moment a game's process exists, foreground or not; [a launcher](https://github.com/trendlinepros-afk/zirtola-launcher/pull/2)
requires the foreground and input in the last 5 minutes, and says that part was never run on
real Windows; [ActivityWatch](https://github.com/ActivityWatch/aw-watcher-afk) calls 3 minutes
away; [Valve](https://steamcommunity.com/groups/SteamClientBeta/discussions/3/3887226156980206582)
says Steam Input produces nothing `GetLastInputInfo` reads.

## Consequences

- **The site changes little.** Play appears under Mine, on one's own shelf: in a browser only
  as Play on Steam, for a game the Steam sync brought in; in the app, for every game. In the
  app only, the header holds the window's controls and the library has Ready to play. The site
  tells the app apart by the global Tauri puts on its pages (`window.__TAURI__`), and no visitor
  pays for it but a few hundred bytes of the game page's script.
- **The site's content policy allows Tauri's channel** (`connect-src` gains
  `http://ipc.localhost`, where Tauri's commands go on Windows), harmless in any browser.
- **An installer without a signature.** Microsoft's signing service for individuals is open in
  the USA and Canada only (checked 25 Oct 2026), so Windows warns the first time it is run
  (More info, Run anyway). For one person's app that is the whole cost; a certificate can be
  added later without changing anything else.
- **Updates are automatic, and the installer is public** (section 9). Anyone can download it
  from the repository's releases, and with them read the code: the owner chose that over a
  separate repository of installers only.
- **Tests never start a game, open Steam or reach the real Shelf.** The Rust side has unit tests
  (`cargo test`) for every rule above that is not Windows itself: which addresses stay in the
  window, what an id may be, Steam's folders read from fixtures, the kept files. The site's side
  is tested with the bridge faked. The app itself is checked against `pnpm serve:test`, its web
  view driven through its debugging port.
- **`desktop/` is a Rust project inside the repository,** apart from the site's code, with its
  own build (`pnpm desktop:dev`, `pnpm desktop:build`). Vercel ignores it.

## Not chosen

- **A copy of the site inside the app**, with a server of its own on the computer: it would need
  the database and IGDB's secret on every computer, and two Shelves could disagree.
- **Only a link handler** (`shelf://play/...`) installed beside the browser: smaller, but every
  page in any browser could call it, and the owner asked for an app.
- **Electron:** above, section 1.
- **A public repository of installers only,** the code staying private: offered; the owner
  chose to make this one public.
- **Updating while Shelf is open,** as a browser does: an update waits for the next start,
  where the splash installs it with nothing to interrupt.
- **Keeping Windows' title bar:** the name twice, and a look apart from Shelf's, which the owner
  asked to be rid of.
