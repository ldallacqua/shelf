# ADR 005: Shelf for Windows, a desktop app that plays the games

- **Status:** accepted, 25 Oct 2026
- **Date:** 25 Oct 2026
- **Decides:** how Shelf becomes an app on the owner's computer that starts their games, as
  Hydra does, while the site stays what it is
- **Built in steps:** [the desktop guide](../desktop.md), which also says how to build, run and
  install it

## Context

The owner, on 25 Oct 2026: "quero converter esse projeto não somente em um browser mas tbm em
um projeto que vai rodar no meu computar para eu executar meus jogos direito dele, tipo o hydra
sabe. [...] Eu vou poder apontar o caminho no meu pc do game local e ele vai rodar o game, se o
game for da steam ele vai rodar o comando que executa o game pela steam." Shown the research
(Tauri or Electron, in phases), they chose: "vamos usar tauri mesmo, Desde que o projeto
continue mostrando todos os meus dados corretamente na versão baixada ta tudo certo."

So the one condition is that the downloaded app shows everything the site shows, correctly.

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

Nothing of the site is bundled but one local page, shown when Shelf cannot be reached ("Shelf
can't be reached", and Try again). Without the internet the app has no shelf to show; a list of
the games set up on this computer, to play offline, is a later step.

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

Built after Play. The app watches the game it started (its process, and the one it hands over
to, when a launcher starts the game and closes), keeps each session on this computer, and gives
them to the page, which sends them to Shelf when it is open. The server adds them to the
entry's PC copy as a store's hours are added. A game started through Steam is not counted: Steam
counts it, and the sync brings it in.

## Consequences

- **The site changes little.** Play appears under Mine, on one's own shelf: in a browser only
  as Play on Steam, for a game the Steam sync brought in; in the app, for every game. The site
  tells the app apart by the global Tauri puts on its pages (`window.__TAURI__`), and no visitor
  pays for it but a few hundred bytes of the game page's script.
- **The site's content policy allows Tauri's channel** (`connect-src` gains
  `http://ipc.localhost`, where Tauri's commands go on Windows), harmless in any browser.
- **An installer without a signature.** Microsoft's signing service for individuals is open in
  the USA and Canada only (checked 25 Oct 2026), so Windows warns the first time it is run
  (More info, Run anyway). For one person's app that is the whole cost; a certificate can be
  added later without changing anything else.
- **Updates are by hand at first.** The repository is private, so its releases are downloadable
  by its owner only, which is enough for one person but not for an updater that asks by itself.
  Where updates live is decided in the guide's step 4.
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
