# ADR 008: Carrying a game's saves between my PCs, through storage I own

- **Status:** accepted by the owner, 7 Nov 2026. Phases 2 and 3 are built, phase 4 and phase 5's OneDrive and
  Google Drive (8 Nov 2026), the last waiting for Shelf's registrations (below)
- **Date:** 7 Nov 2026
- **Decides:** how Shelf for Windows finds a game's saves, keeps their history, and carries them between
  my computers through a place of my own, for games no store carries saves for, and what Shelf's server
  never does along the way
- **Issue:** [#151](https://github.com/ldallacqua/shelf/issues/151), which has the research this starts
  from and the phases

## Context

The owner, in issue 151: back up a game's saves and carry them between my PCs, "through storage I own (a
folder, OneDrive, Google Drive…)", above all for copies from outside the big stores (`third-party` in
`stores.ts`). Steam, GOG Galaxy and Epic already carry their own games' saves; Shelf should not fight them.

The issue compares six tools (Steam Cloud, Epic and GOG Galaxy, Ludusavi, Hydra Cloud, Game Backup Monitor
and GameSave Manager) and draws five lessons: where saves are is solved by the Ludusavi manifest; back up
after a session and restore before launch; never move or link the game's own files; never choose silently
between two copies; keep history. This record takes those as given and settles what the issue left open.

Read again on 7 Nov 2026, for what follows:

- **[The Ludusavi manifest](https://github.com/mtkennerly/ludusavi-manifest)** is one YAML file, 17.7 MB,
  at a fixed address, to be read again with its `ETag`. Each game has `files` (paths with placeholders such
  as `<base>`, `<winAppData>`, `<winDocuments>`, each with `tags`, `save` or `config`, and `when`, by OS and
  store), `installDir`, `registry`, `steam.id`, `alias` and `cloud` (which stores carry its saves). Paths are
  globs; a folder means everything in it. Its own code and format are MIT. **Its data is compiled from
  [PCGamingWiki](https://www.pcgamingwiki.com/)**, whose content is CC BY-NC-SA 3.0 by
  [Wikipedia's account](https://en.wikipedia.org/wiki/PCGamingWiki); PCGamingWiki's own copyright page
  refused to be read from here (403), so that was not confirmed at the source.
- **Hydra** reads the same manifest in Rust, with `serde_yaml_ng`, `globset` and `sha2`
  ([its `Cargo.toml`](https://github.com/hydralauncher/hydra/blob/main/native/hydra-native/Cargo.toml)).
  Ludusavi uses `serde_yaml` 0.8, `globset` and `zip`.
- **[OneDrive's app folder](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder)**
  (`Files.ReadWrite.AppFolder`) gives an app one folder, `Apps/{its name}`, and nothing else of the drive.
  The person can see, move and delete what is in it.
- **[Google Drive's `drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)**
  reaches only the files the app made or the person opened with it. It is non-sensitive: basic verification
  only. `drive.appdata` is non-sensitive too, but its folder is hidden from the person.

What Shelf for Windows already has decides much of the rest: it knows the file I chose for a game
(`launchers.rs`), whether the game is running (`running.rs`, ADR 005 section 11), when a session ends
(`tracker.rs`, `watch.rs`, section 12), this computer's random id (`device.rs`), and how to keep a sign-in in
Windows' Credential Manager and tell a page only who is signed in (`real_debrid.rs`, ADR 007).

## Decisions

### 1. Shelf's server never holds a save, a token or a key

Saves go from the app on one PC to a place I own, and from there to the app on another. Nothing passes
through Vercel: no endpoint takes a save, a snapshot's list, a token or a key, and none will. Shelf has no
budget to store anyone's saves, and a save is its owner's. What a page learns is what it draws: where saves
were found, where they go, and each snapshot's date, computer and size.

### 2. Per game, opted into, for a game started from its file

Saves are offered on a game's page, in the app only, for a game with a file chosen on this computer (Play
from a file, ADR 005 section 5). They stay off until I turn them on. A game played through Steam is not
offered: Steam Cloud carries it. When the manifest says a store carries the game's saves (`cloud`) and my
copy is from that store, the page says so beside the switch, and still lets me turn it on: Shelf can't tell
which copy I start. A copy from outside the stores is the case this is for.

### 3. Where saves are: the Ludusavi manifest, read by the app

- **Read from its own address,** `raw.githubusercontent.com/mtkennerly/ludusavi-manifest/master/data/manifest.yaml`,
  by the app, with its `ETag`: the first time a page asks about a game's saves, then again when what the app
  has is over a week old and a page asks. Never while a game is being counted, so it costs no frames. Shelf
  ships no copy and serves none: PCGamingWiki's data stays where it is published, read the way Ludusavi reads
  it, and the page credits PCGamingWiki and the manifest by name, with links. Shelf is free and sells nothing.
- **Kept small.** On arrival the YAML is read once, a game at a time, on a thread of its own, into what Shelf
  uses: each game's title, aliases, Steam ids, `installDir` and the paths that apply to Windows, kept as
  `save-manifest.json` in the app's folder. The YAML is not kept. A manifest that can't be read leaves the last
  good one. Read once by hand on 7 Nov 2026, in a release build: 0.35 s, 21,554 games with saves, none left
  out, kept in 4 MB that read back in 34 ms.
- **Which game.** A page names the game by its title and Steam app ids (the copy's synced app, and those
  IGDB lists), as text and digits, never a path. The app looks for a Steam id first, then the title by the
  same words, punctuation aside (the rule for matching titles: no looser). Several matches are a choice;
  none is said, and I pick the folders.
- **`<base>`,** the game's folder: the nearest folder above the chosen file whose name is one of the game's
  `installDir`s, or else the file's own folder. Shown, and I can choose another through Windows' picker.
- **The other placeholders** are this PC's known folders, asked of Windows (`SHGetKnownFolderPath`), so a
  Documents folder moved into OneDrive is found where it is: home, Roaming and Local AppData, LocalLow,
  Documents, Public, ProgramData and Windows. `<storeUserId>` and `<storeGameId>` match any one folder.
  `<osUserName>` is this PC's user, used to look and never written into a snapshot. A path only for Linux or
  Mac is skipped.
- **Saves, not settings.** A path tagged `save`, or untagged, is a save; one tagged only `config` is left
  out: a resolution or a key binding belongs to each PC. Registry saves are left for later, and a game the
  manifest knows only by the registry says so.
- **I see it before it is on.** Every location found is shown with its size, and I turn saves on, add a
  folder through the picker, or take one away. What was decided is kept in `saves.json`, by entry id.
- **Never a folder that holds more than a game.** A location can't be, or contain, a disk's top, Windows'
  folder, Program Files, ProgramData itself, the home folder itself, Documents or AppData themselves, a
  store's library, or the app's own folder. A restore makes a location what the snapshot holds (section 6),
  so a location too wide would be a disaster; such a one is refused, found or picked. The game's own
  folder, or one above it, is refused for the same reason, in words of its own. A folder refused is named
  (9 Nov 2026): Windows' picker hides AppData, and what it hands over is not always what was meant, so
  the panel says which folder came, and tells how to reach AppData.

### 4. A snapshot

- **What it is:** the game's save files as one zip archive, and a list beside it (`.json`): its format's
  version, its id, the entry's id and the game's title, the computer it was made on (`device.rs`), when, its
  parents (section 5), and each file's path, size, time and SHA-256, and the archive's size and SHA-256.
  Zip because the app already reads it and Explorer opens it: a save can be taken out without Shelf.
- **Paths are placeholders,** `<winAppData>/A Game/slot1.sav`, never `C:\Users\{name}\…`, so they map onto
  another PC, whose folders put them back. The list also has a hash of all the files' paths, sizes and hashes
  together: two snapshots with the same one hold the same saves, wherever they were made.
- **Never overwritten.** A snapshot is new files with a name no other can have: its time, the computer's
  id, and a hash of its content and its parents (`20261107T193000Z-1a2b3c4d-0f1e2d3c4b5a`). The parents are
  in it since `pnpm desktop:check` went back to a snapshot in the second it was made: the same saves with
  other parents took the older one's name, and were never written. A name that is there is never written
  again. Writing only new files is what lets two PCs share a plain synced folder, with no locking,
  and never destroy each other's work.
- **Whole or not at all.** The archive is written under a `.partial` name and renamed, then the list. The
  list is what makes a snapshot exist. One counts only when both are there and the archive has the list's
  size, and is put back only once its SHA-256 is the list's too: a cloud client may still be bringing the
  rest, and until then it doesn't count.
- **No change, no snapshot:** saves whose content hash is the latest's make none, nor saves that are still
  what this PC last made or put back (added while building phase 4: otherwise a PC that opened the game and
  played nothing, after another PC had written, copied its old saves again, and made a choice of nothing).
- **Caps,** set in Settings, the same for every game: the largest snapshot (500 MB to start with), and how
  many are kept per game (20, and never fewer than 3). A snapshot over the size is not made, and the page
  says why. Past the count the oldest go, never a head (section 5) nor one a choice is waiting on. Shelf
  sets no quota of its own: the space is mine, with my service.

While a backup or restore runs, the panel shows what is being done and how far it has got (9 Nov 2026,
the owner): reading the saves, writing the archive (its files' bytes counted), sending it to a service
(the pieces sent counted) or a folder, reading one back from a service, and putting the saves back. The
page asks the app as it waits (`save_progress`), as it does for downloads. Each snapshot also says
whether it is at the place yet, a service by its name or the folder, or still waiting on this computer
for it (the owner, the same day: "mostre se o snapshot já está na nuvem ou não").

### 5. Which copy wins: parents, not clocks

Each snapshot names the one it came from. So the app can tell, with no server and with clocks that disagree:

- **here:** the content hash of the saves on this PC now;
- **known:** the snapshot this PC last made or restored, kept in `saves.json`;
- **heads:** the snapshots in the place that no other names as its parent.

| What the app finds | It does |
| --- | --- |
| No snapshot anywhere | Nothing before; the first is made after the session |
| One head, and it holds what is here | Nothing: in step |
| One head that descends from known, and here is still known | Restores the head: another PC played since |
| One head that is known, and here has changed | Makes a snapshot: this PC played without one |
| Anything else: here changed and the head moved, two heads, a head whose parents never reach known, or a PC that never synced finding saves of its own that differ | **A choice.** Nothing is restored or replaced |

**The choice** shows each copy (this PC's and each head) with its date, computer and size, and three answers:
keep one of them, or decide later. Keeping one writes a new snapshot of it whose parents are every head, so
every PC sees it settled; a head not chosen stays in the history, restorable. Deciding later starts the game
with what is here and writes nothing. Time is only ever shown, never used to decide.

A parent that is gone (pruned, or not yet arrived) is not guessed past: it is a choice.

**Going back by hand** to an older snapshot is choosing it: the app writes a new snapshot of it whose
parents are every head, as a choice does, so the next check doesn't take this PC forward again. (Added
while building phase 2: without it, phase 4's check before Play would undo a restore by hand.)

### 6. Restoring

- **Never while the game runs,** by `running.rs`'s evidence, nor while a backup or restore of it is going.
  One at a time per game.
- **What is here goes first** to a backup on this PC (`save-backups\{entry}\`, a zip like any snapshot), kept
  30 days and never fewer than the last 5, whatever the caps say.
- **Every path is read before anything is written,** as `extract.rs` reads an archive: each must be a
  placeholder known here with a relative path, no `..`, no drive, no `:`, and fall inside one of the game's
  locations on this PC. One that doesn't refuses the whole snapshot.
- **Into a temporary folder first,** on the same disk, each file checked against its SHA-256, then put in
  place. A location becomes what the snapshot holds for it: a file the snapshot doesn't have goes too, as it
  is in the backup just made.
- **A restore cut short is undone.** A journal in the app's folder names the restore and its backup until it
  is finished; an app that starts and finds one puts the backup back before anything else, and Play waits.
  So an interrupted restore leaves the previous files whole.

### 7. When

- **By hand, from phase 2:** Back up now, and Restore on any snapshot in the history, with the guards above.
- **After a session (phase 4):** when the tracker ends a sitting of the game (`watch.rs`), counted or not,
  if what is here isn't known, a snapshot is made. It is made even when another PC has written meanwhile: a
  new file destroys nothing, and the two heads become a choice.
- **Before Play (phase 4):** the table of section 5. Play waits for it, a second or two for a folder, and
  says Starting meanwhile; a backup or restore of the game already going is waited for, twenty seconds at
  most, and a restore cut short that couldn't be undone keeps Play waiting. A choice stops Play and shows
  itself, in the game's Saves: keeping one plays it, as Steam's conflict window launches the game once a
  copy is picked, and **Decide later** plays what is here and writes nothing, Steam's "Play anyway". A
  place that can't be reached starts the game with what is here, and says so; so does a look that fails
  (a damaged snapshot, saves over the caps), with the reason, since what is played over is never lost: the
  snapshot after it names the old one as its parent, and the next look is a choice. A page that says to
  skip the look (`play`'s `check`, false only after Decide later) gets none.
- **What it can't see:** a game started outside Shelf (a shortcut, the file itself) gets no check before it.
  The snapshot after it, if the place moved meanwhile, makes two heads, so the next look is a choice, not a
  silent overwrite.
- **A notification** (phase 4) when something needs me after a session: a choice waiting, a backup that
  failed, a place that is full or gone. Nothing is said when all went well, nor when nothing was found to
  back up, which the game's Saves says. The window may be closed to the tray, so it is Windows' own,
  through Tauri's notification plugin, headed by the game's title, in the language Windows is in, as the
  tray's menu is (`saves/notice.rs`). A click brings Shelf forward; it doesn't open the game's page, which
  the app can't name from an entry, and the next Play shows what waits. Before Play, the page says it
  with a notice, whose action opens the game's Saves.

### 8. Where: one place per PC

Each PC has one place, chosen in Settings' Shelf for Windows group, and every game turned on uses it. Until
one is chosen, snapshots stay in the app's own folder (`saves\{entry}\`), with their history, which is all
phase 2 does. A game's page says where its saves go.

In a place, Shelf keeps a folder of its own, `Shelf saves`, in the one chosen (unless that is the one
chosen), and only ever adds files to it. In it a game is a folder named by its entry id (the same on every
PC of the account), holding `game.json` (its title, for a person looking) and its snapshots. Choosing a
place copies this PC's snapshots there, as new files; going back to this PC alone leaves the folder as it is.

| Phase | Place | How it connects |
| --- | --- | --- |
| 3 | **A folder** | Windows' folder picker. A folder that OneDrive, Google Drive for desktop or Dropbox syncs, a NAS or a USB drive. No sign-in. |
| 5 | **OneDrive** | Microsoft's sign-in in the default browser, with PKCE and a loopback address, for `Files.ReadWrite.AppFolder`: `Apps/Shelf` and nothing else |
| 5 | **Google Drive** | Google's, the same way, for `drive.file`: only what Shelf made, which I can still see and download |
| 5 | **S3-compatible** (Cloudflare R2, Backblaze B2) | An access key pasted, for one bucket |
| Later | Dropbox, WebDAV, rclone for the rest | |

- **A sign-in** happens on the service's own page, never in a field of Shelf's. What it gives, or a key
  pasted, is kept in Windows' Credential Manager, as Real-Debrid's is, opened only to reach the service,
  and never given to a page, which learns the service and the account's name. Disconnecting removes it
  here and, where the service allows, revokes it there.
- **One module per service** knows its addresses, as `real_debrid.rs` does. Each place answers the same few
  questions (list a game's snapshots, read one, write a new one, delete one), so sections 4 to 7 are the same
  code for all.
- **Registering Shelf** with Microsoft and Google, free, is the owner's to do, in their accounts; phase 5
  waits for it. Google's `drive.file` needs only basic verification, to be confirmed when it is done. The
  registrations' ids (and Google's client secret, which Google says isn't one for an app on a computer)
  are kept in `.env.local` and built into the app by `pnpm desktop:release`; a build without one doesn't
  offer that service. The steps are in the desktop guide, step 12.
- **How it was built** (phase 5, 8 Nov 2026). A service is seen as a folder of snapshots like any other:
  it answers four questions (`saves/remote.rs`'s `Remote`: a game's files, one read, one written, one
  deleted), and the rest is the same for every service (`Mirror`). A list or an archive read is kept by
  name in `saves-cloud\{service}\`, as a snapshot never changes once written; what is no longer there goes
  from here too. A snapshot for a service is made in `saves-waiting\` and sent from there at once, archive
  first and list last, so a sending cut short never counts, and the oldest past the caps go there after.
  Choosing a service takes this PC's history along (the app's own folder and the folder chosen, when one
  is), waiting here and sent off the page's way. Microsoft's sign-in comes back to `http://localhost` at
  any port, as Microsoft takes it, listened for on IPv4 and IPv6; Google's to `http://127.0.0.1`, with
  `access_type=offline` and `prompt=consent` for a refresh token. The account a page is told is the ID
  token's email or user name. Signing out revokes Google's token; Microsoft has no address for it, so it
  is forgotten here. Signing out of the service in use goes back to this computer alone.
- **What a page sees** of a service: its name, the account, whether it is in use, and why it can't be used
  (out of reach, signed out, full), the same words a folder out of reach has. Before Play, a place
  signed out of or full says so, as one out of reach does.
- **A place that is full, gone or signed out** keeps the snapshot on this PC, waiting (`saves-waiting\`),
  and says so; it is sent when the place is back, the next time anything asks about the game. A waiting
  snapshot counts in section 5's table as one in the place does. Nothing here is deleted because a place
  failed.

### 9. What could go wrong, and what holds

| Threat | What holds |
| --- | --- |
| A page on Shelf's origin goes wrong (a script injected) | Commands take entry ids, snapshot ids (checked like ids), titles and Steam ids, never a path or bytes; a folder comes only from Windows' picker. The worst it can do is restore an old snapshot (what was here is backed up first) or make one. It can't read a save, delete a snapshot, or set a cap below 3 |
| A sign-in's token is stolen from this PC | It reaches Shelf's folder in that service and nothing else of it (app folder, `drive.file`, one bucket). Disconnecting revokes it |
| Someone writes a hostile snapshot to my place (a shared folder, a stolen token) | Section 6: paths read first, every file inside the game's locations here, sizes and hashes checked, a size cap; nothing restored ever runs. Restores happen only when I or the rules above ask, and a backup comes first |
| Two PCs play without syncing between | Two heads: a choice, never an overwrite (section 5) |
| A cloud client halfway through syncing | A snapshot counts only when its list and archive are both whole (section 4) |
| A corrupt save synced everywhere | History: the last 20, and the backup before each restore |
| A full, disconnected or signed-out place | Snapshots wait on this PC and the page says why (section 8) |
| The app, the PC or the power ending mid-restore | The journal and the backup (section 6) |
| Clocks that disagree | Order comes from parents; time is only shown |
| The game running | Never restored or read for a snapshot while it runs (section 6) |

Encryption isn't in the first version: the place is mine, and a service reading my saves costs little. Once
issue 150 gives each account a vault key, snapshots can be encrypted on the PC before they leave it.

## Phases

This record came with phase 2; each after it is its own pull request. Each needs a desktop release for
the owner, which needs the owner's OK.

1. **This record.**
2. **Find and back up on this PC** (built, 7 Nov 2026). The manifest, matching, the locations shown and
   chosen, snapshots in the app's own folder with history and caps, Restore with the backup and the journal.
   The game's page in the app gets Saves, in Play's menu; Settings gets a Saves page with the caps (spec 7.12).
3. **Through a folder** (built, 7 Nov 2026). Choosing one in Settings' Saves page, snapshots written there and
   read from another PC, waiting here while it can't be reached, section 5 by hand (the game's Saves says
   when another PC's snapshot is newer, and offers it), and the choice, as two cards with their dates.
4. **By itself** (built, 8 Nov 2026). After a session, before Play, and notifications, as section 7 says:
   `play` looks at the saves first and answers what it found, and the tracker says which games' sittings
   ended, for a backup on a thread of its own. The app keeps each game's title and Steam apps from the page's
   last ask, for when no page asks.
5. **Cloud sign-ins.** OneDrive and Google Drive (built, 8 Nov 2026, reaching the owner once Shelf is
   registered with both), then S3-compatible.
6. **Later.** More places, encryption with issue 150's key, registry saves, other launchers' games.

## Consequences

- **New dependencies in the app:** a YAML reader (`serde_yaml_ng`, as Hydra) and SHA-256 (`sha2`). Globs are
  Shelf's own few lines (`saves/paths.rs`): the manifest uses only `*`, `?`, `**` and a class. The `zip` crate
  it has already writes as well as reads. Phase 4 adds Tauri's notification plugin; phase 5 base64 (PKCE
  and an ID token's claims) and tokio's sockets, for the address the browser comes back to.
- **A few more commands,** each taking only ids, titles and Steam ids, listed in the desktop guide when
  built, and allowed to Shelf's origin alone (ADR 005 section 3).
- **What is the computer's stays on the computer** (ADR 005 section 4): `saves.json`, `save-manifest.json`,
  `saves\`, `save-backups\` and the journal, in the app's folder. Uninstalling leaves them, as it leaves the rest.
- **The words are in `messages/app/`,** fetched only in the app, as the download sources' are.
- **The landing page.** It has no part for Shelf for Windows yet; when it gets one, carrying saves between
  PCs is in it. Unlike download sources (ADR 007, decision 4), nothing keeps this off it.
- **Tests use made-up games,** a manifest written by hand (`fixtures/saves/`), temporary folders and
  stand-ins for each service, never a real save, game, manifest or account. A development build can be
  pointed at a stand-in manifest (`SHELF_SAVE_MANIFEST`) for `pnpm desktop:check`.

## Not chosen

- **Saves on Shelf's server,** as Hydra Cloud keeps them: a cost Shelf can't carry, and a save is its owner's.
- **Moving saves into a synced folder and linking them back,** as GameSave Manager does: games that dislike
  the links, broken saves, and hard to undo. Shelf copies, and copies back.
- **Syncing the save folder itself,** live, as a cloud client syncs a folder: no history, a corrupt save
  everywhere at once, and conflicts settled by whichever wrote last.
- **Running Ludusavi as a program,** as Hydra first did: one more program to install and keep updated, for a
  manifest Shelf can read itself.
- **rclone first:** a large program and its own setup for every service at once. It comes later, for the
  services Shelf doesn't speak itself.
- **Shipping the manifest in the installer:** PCGamingWiki's data in a public installer, and old the day
  after.
- **The newest copy wins:** clocks differ between PCs, and the newest isn't always the one I want. Epic's
  help says progress lost that way is lost for good.
- **`drive.appdata`:** as quiet a scope, but hidden from me: I couldn't see or take my own saves.
- **A place per game:** one per PC covers it, and a game can be turned off.
