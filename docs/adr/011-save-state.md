# ADR 011: The product is called Save State

- **Status:** accepted, 23 Nov 2026
- **Date:** 23 Nov 2026
- **Decides:** the name people read, what the word "shelf" still means, which internal names keep "Shelf"
  for now, and what waits for a change of its own. Renames the product of every earlier record.
- **Moves separately:** the domain (the owner's `savestate.gg`), and the desktop app's `productName`

## Context

The product has been called Shelf since its first commit. Two things made the owner want another name:

- **The domain.** The owner holds `savestate.gg`, and "Save State" was the name of the project this one
  grew from. The name and the address they have are the same.
- **Rule 4, "games, not books"** (AGENTS.md; [ADR 002](002-visual-direction.md) for what went wrong the first
  time). "Shelf" says bookcase before it says games, and a library of games is what the product is. "Save
  State" is a word players already use for keeping a moment of a game to come back to.

The name is not free of company, so what else answers to it was looked up first:

- An active open-source Windows tool called **SaveState**, one word
  ([github.com/Matteo842/SaveState](https://github.com/Matteo842/SaveState)), backs up PC game saves to Google
  Drive. That is close to what Save State for Windows does with saves ([ADR 008](008-save-sync.md)).
- Gaming podcasts are called "Save State".
- "Save state" is a generic term for an emulator's snapshot of a running game.

No trademark database could be searched from here, so nothing says the name is clear in law. This ADR does not
claim it is.

## Decision

1. **The brand is "Save State": two words, always.** Never "SaveState", which is that other tool's spelling, and
   never translated. In pt-BR it takes the masculine article, as Shelf did: "o Save State", "do Save State",
   "pelo Save State"; the app is "Save State for Windows" in English and "Save State para Windows" in
   Portuguese.
2. **Where people first meet the name, a short descriptor stands beside it** ("Save State: your game library"),
   because the words alone say little and the neighbors above share them. The header, the footer and the page
   title template (`%s · Save State`) carry the name alone.
3. **Brand and object are two words.** The name is the product's; "shelf" is still what a person owns in it.
   These keep their words, in both languages: a person's shelf at `/u/{handle}` ("your shelf", "estante"); the
   view called Shelf next to Wall, List and Banners; "Shelf in 2D or 3D"; the shelf surface color role; spec
   sections 3.3 and 3.4; the shelves a library is grouped into. The rename was read sentence by sentence, never
   found and replaced.
4. **The site's own words that are the brand:** on a game's page, the score from the people here is "Save State"
   and its tooltip "People on Save State" (`Game.scores`); the violet colorway's detail is "Save State's own".
5. **The living documents take the name** (README, AGENTS.md, the spec, the architecture, the API, desktop,
   setup, testing, design-pass, ui-review and feature-coverage guides, the agents' descriptions). The records
   stay as written: ADRs 001 to 010, the research, the review reports and the older handoffs. In them "Shelf"
   means the product that is now Save State, and the handoff says so at its top.
6. **"savestate" and "save-state" are reserved handles**, beside `shelf`, which stays reserved.

## What stays "Shelf", and why

Every one of these is a name the program or a person's device already holds. Renaming it would log people out,
lose a choice, or break a link between two programs, for no word anyone reads.

| Kept | Because renaming it would |
| --- | --- |
| The cookie prefix `shelf` (`shelf.session_token`), `shelf_signed_in`, `shelf_arrangement` | Sign every account out everywhere, and forget the arrangement each device remembered |
| Every `shelf:*` device-storage key and the `shelf:played` event | Lose each device's preferences (colors, covers or compact, collapsed shelves, setup's place), and the page and app would stop hearing each other |
| `com.ldallacqua.shelf`: the app's identifier and the Credential Manager service (`vault.rs`) | Orphan every sign-in kept for OneDrive, Google Drive and Real-Debrid, and move the app's folders |
| `package.json`'s name, `.data/shelf.db`, every `SHELF_*` variable | Break every machine's environment and the deployed settings |
| The GitHub repository `ldallacqua/shelf` and the updater's address | Break updates: an installed app looks for `latest.json` there |
| Cargo's package and binary names, the installer's identifiers, temporary-folder prefixes | Break the installer's upgrade path, and strand folders from an earlier run |
| The MCP server's machine name `shelf` (its title is Save State) | Break the clients that were set up against it |
| The user agents sent to other services (`Shelf/{version}`, `ShelfForWindows/{version}`, Nintendo's `Shelf`) | Change how three services know the program |
| Test accounts such as `owner@shelf.test` | Change nothing a person sees |

## The folders people already have

Saves are kept in folders named for the old product: `Shelf saves` inside a folder the person chose, and in
Google Drive, and OneDrive's `Apps › Shelf` (named for the registration). Renaming them would leave every
backup where the program no longer looks. They keep their names for now, and the words that name them keep the
folder's real name inside the new sentence: "Save State keeps its own folder here, Shelf saves, and only ever
adds files to it." Renaming the folders, with a move of what is in them, is a later decision of the owner's.
The registrations at Microsoft and Google carry the old name too, and the desktop guide says so where it
describes them.

## The desktop app's `productName` waits

`desktop/tauri.conf.json`'s `productName`, the installer (`desktop/installer/`), the Run value that starts the
app with Windows and the executable's name are all still Shelf. Changing `productName` can change the install
folder and the uninstall entry, which would leave an old copy beside a new one. It gets a desktop pull request
of its own, with the installer's upgrade path checked. What the app shows while it runs (the windows' titles,
the splash, the tray, the notifications, the page after a cloud sign-in) already says Save State.

## The domain moves separately

The address (`shelf-ldallacqua.vercel.app`, the environments, the setup guide's domain steps) changes in its
own pull request when the owner's domain is added. Until then, a few lines about hosts still say Shelf, so as
not to overlap it.

## Consequences

- A person who knew Shelf sees a new name in the header, the pages, the app and the notifications, and the same
  shelf at the same address, signed in as before.
- Two words read heavier than one: where the name repeats in a message, it is said once and the rest rephrased.
- A search for the name finds other things. The descriptor helps; a name check by someone who can search
  trademarks would help more.
- The code still says Shelf in places no one reads (type names, the `shelf` folders of `src/`). Those are
  the code's own words for the object, and stay.

## Not chosen

- **"SaveState", one word.** It is the other tool's spelling.
- **Keeping Shelf.** The domain, the old project and rule 4 all pointed away from it.
- **Renaming every internal name too.** It would sign everyone out and break updates, to change words no one
  reads.
- **Renaming the save folders now.** It would leave every backup behind; it is a decision of its own.
