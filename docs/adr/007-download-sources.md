# ADR 007: Downloading a game from a source, in the app

- **Status:** accepted, 1 Nov 2026. Sources are built; downloading is not yet (the phases, below)
- **Date:** 1 Nov 2026
- **Decides:** how Shelf for Windows reads a list of downloads in Hydra's format and downloads from it,
  by a direct link or through Real-Debrid, and what it refuses to do along the way
- **Changes:** [ADR 005](005-desktop-app.md), which said downloading is not something Shelf does and
  that a command never takes an address

## Context

The owner, 1 Nov 2026: "Quero que possamos usar os sources do Hydra para baixar jogos no shelf. Então
vou copiar um link do source do Hydra. Colocar aqui e baixar. [...] Precisamos fazer funcionar com
direct link e real debrid por enquanto." Shown the research and the limits below, they said to start.

What was read, 1 Nov 2026:

- **The format.** A source is a JSON file at an address: a `name` and a list `downloads`, each with
  `title`, `uris`, `uploadDate` and `fileSize`.
  [Hydra's last validator in the open](https://github.com/hydralauncher/hydra/blob/0180bd2a771767646669a07d552f899cc1d8e168/src/main/events/download-sources/validate-download-source.ts),
  October 2025, says so. Since then Hydra sends the address to its own API, which reads the file, so
  the reader in use is not public. Its types also have `uriGroups`: a mirror split into parts, in order.
- **Links.** [Hydra takes](https://github.com/hydralauncher/hydra/blob/main/src/shared/index.ts)
  `magnet:` and a list of file hosts, each with code of its own, and nothing else. So a "direct link" in
  a source is often a host's page, not a file.
- **Real-Debrid.** [Its API](https://api.real-debrid.com/) adds a magnet, lists its files, starts it on
  their servers, and turns what is finished, or a host's link it supports, into a link to the file.
  It sent `instantAvailability` away [in November 2024](https://torrentfreak.com/real-debrid-implements-extreme-anti-piracy-filters-to-appease-film-companies-241122/)
  and it filters by hash and word, so whether a magnet will work is known only by adding it.
- **[Real-Debrid's terms](https://real-debrid.com/terms)** allow an account to its holder alone, no use
  from a server, a VPS or the cloud (without a separate product), and no downloading of infringing files.
- **What sources hold.** Many list repacks of commercial games. Shelf's owner chooses what to paste, and
  the app can't tell what a link leads to.

## Decisions

1. **Only in the app.** A page can't write a game to a disk, and Real-Debrid's terms keep it off Vercel.
   Shelf's server never sees a source, a link, a Real-Debrid account or a download.
2. **The mechanism, and no content.** Shelf ships no source, suggests none, and links to no list of them.
   It reads the format, from an address the person pastes. Tests use a source written by hand with
   made-up names on addresses that can't exist (`fixtures/sources/`), and nobody running a check
   here reaches a real one. Whether what a source lists may be downloaded is the person's to know, and the page says so.
3. **Not everything Hydra does.** No code that runs a host's obfuscated script to get a token, no list of
   passwords of cracking sites for archives, no way around a host's limits. A link is a file at an
   `https` address, or Real-Debrid's to resolve. What neither can do is left out and said.
4. **Not on the landing page.** AGENTS.md has a feature a visitor would choose Shelf for shown there; this
   one is the exception. The repository and installer are public, and Shelf is not offered as a place to get
   games. It appears only inside the app, on the account page, for someone who goes looking.
5. **The app reads a source itself.** The page hands over the address as text and gets back a name and
   counts. The links stay in the app's folder. Once downloads exist the page will name a download by its
   source's id and its place, and the app takes the link from its own copy, so a page that went wrong can't
   ask for a file from anywhere.
6. **An address is the one thing a page may name that is not an id** (ADR 005, section 3, changed here).
   It is only ever read as a list, never run, and it passes `allowed` first: `https`, no name and password
   in it, and no loopback or private address written out. A redirect passes the same rule. A
   development build may also read `http` on this computer, for `pnpm desktop:check`. A name that resolves
   to a private address is not caught.
7. **What is read is checked, and kept short.** At most 200 MB, two minutes, five redirects. No `name`
   or no list of `downloads` is not a source, and says so. One bad item is left out and counted, rather than
   losing the rest: hand-made files have them, and `uploadDate` and `fileSize` may be missing. A link that is
   neither `https` nor a `magnet:` with a hash is dropped: plain `http` has no check at all, since the
   format has no checksum.
8. **What is the computer's stays on the computer** (ADR 005, section 4): `sources.json` for what they are,
   and `sources/{id}.json` for each list, read only when asked for. A file that can't be read is put aside.
9. **Reading again is by hand.** Nothing is fetched by itself, so a source's owner doesn't learn when
   the app is open. It sends the `ETag` it has, and a failed reading keeps the list it has.
10. **Nothing that was downloaded runs by itself, ever.** Not an installer, not a game, not after extracting.
    The file is reached through Windows' picker, as every game's is, so Play and the hours work as before.
    That is the one defense against what a source can hide, since anything it starts has my access to the computer.

## Phases

Each is its own pull request.

1. **Sources** (this one): paste, read, list, read again, remove, on the account page.
2. **A direct download.** The game's page lists what a source has for it, by every word of the game's
   name (the rule for matching: no looser), and I choose. A folder from Windows' picker. One at a time,
   resuming with `Range` and `If-Range` into a `.part` file, kept going from the tray, with progress
   and the disk's space checked first.
3. **Real-Debrid.** Signing in through its device code, with the client id it offers open-source apps, and
   never the private token, which it warns against. Kept in Windows' Credential Manager and never given to a
   page. Magnets, and the hosts its `/hosts` lists. The app says what it can't know ahead (above).
4. **Extracting and Play.** Whichever of `zip`, `7z` and `rar` it is, with every path checked to stay in the
   folder, and then the existing file picker for Play.

Each needs a desktop release for the owner, and that needs the owner's OK.

## Consequences

- `reqwest` is a direct dependency. It was in the app already through the updater.
- The account page gains a section for the app alone, loaded apart, so no visitor pays for it. `desktop:check`
  leaves it out of what it compares (`data-device`).
- **Its words are in `messages/app/`,** not `messages/{locale}.json`. The layout hands every visitor
  all of those, in every page's HTML, the landing page's too, which decision 4 can't allow. They come
  with the section's code, and `pnpm i18n:check` checks them the same way.
- **Tests never talk to a real source or to Real-Debrid.**
- Anyone can read this code. It holds nothing about where to find a source.

## Not chosen

- **Through Shelf's server,** to read a source once for everyone, as Hydra's API does: every list on Vercel, a
  server reaching out to addresses people type, and something Shelf would have to answer for.
- **A built-in torrent client,** as Hydra has: the owner asked for direct links and Real-Debrid, and a seeding
  program is a different thing to have running beside a game.
- **Copying Hydra's per-host code:** see decision 3. Its license (MIT) would allow it.
- **Matching games by themselves.** A list's titles carry versions and editions, and a wrong match
  here would download the wrong thing, so the person chooses.
