# Shelf

A personal game library that feels like standing in front of your own lit shelf.

Add games from IGDB, then browse them on a shelf (2D or 3D) with filters and sorting.

## Run it

```sh
pnpm install
pnpm seed       # once: makes .data/shelf.db with the sample library
pnpm dev        # http://localhost:3300
```

Node 24 and pnpm 10. Everything else about working here is in [AGENTS.md](AGENTS.md), and
how it is tested is in [`docs/testing.md`](docs/testing.md).

## Status

| | What | State |
| --- | --- | --- |
| Phase 1 | Research and visual directions: [`docs/research.md`](docs/research.md) | Done |
| Phase 2 | Product and UX spec: [`docs/spec.md`](docs/spec.md). Data model: [`docs/adr/001-game-entry-model.md`](docs/adr/001-game-entry-model.md) | Done |
| Phase 3 | Architecture: [`docs/architecture.md`](docs/architecture.md). Setup checklist: [`docs/setup.md`](docs/setup.md) | Done |
| Step 1 | Scaffold, tooling, CI, both languages, themes, design tokens. Visual direction changed: [`docs/adr/002-visual-direction.md`](docs/adr/002-visual-direction.md) | Done |
| Step 2 | IGDB client, data model, the three data sets, the library file | Done |
| Step 3 | 2D shelf, wall and list | Done |
| Step 4 | 3D shelf, and the switch between 2D and 3D | Done |
| Step 5 | Filters, sorting, smart shelves, the public API: [`docs/api.md`](docs/api.md) | Done |
| Step 6 | Game detail: its own page, and the same page over the shelf | Done |
| Step 7 | Sign-in, adding one game or a pasted list, editing in place, the write API, and MCP for assistants | Done; on a deployment once sign-in is set up ([setup](docs/setup.md), part C) |
| Accounts | Anyone signs up for a shelf of their own, public or private: [`docs/adr/004-one-library-per-account.md`](docs/adr/004-one-library-per-account.md) | Done |
| Step 8 | Landing page | Done |
| Step 9 | The trophy wall; phone and tablet, accessibility and speed passes; the daily refresh | Done |
| Sync | Steam, then Nintendo, then PlayStation and Xbox: [`docs/adr/003-platform-sync.md`](docs/adr/003-platform-sync.md); placing what a sync brought in ([spec 4.5](docs/spec.md#45-placing-what-a-sync-brought-in)); setting a new shelf up ([spec 4.6](docs/spec.md#46-setting-a-new-shelf-up)) | Steam and Nintendo done and in use; the page for placing their games and the one that sets a new shelf up built; PlayStation and Xbox next ([handoff](docs/handoff.md)) |
| Desktop | Shelf for Windows, which plays the games from their files or through Steam: [`docs/adr/005-desktop-app.md`](docs/adr/005-desktop-app.md), built in the steps of [`docs/desktop.md`](docs/desktop.md) | Play on Steam on the site, and the app that opens Shelf, built; choosing a file and Play next |
| Step 10 | Final review | Not started |

What is on screen today: a landing page that shows what Shelf does with an example shelf, and,
for anyone who signs up, a page that sets their shelf up, then a library of their own at
`/en/u/{handle}`, as a lit shelf, a wall
of covers or a list, grouped by platform, status or year. A Steam library comes in through
Steam's own sign-in, with its hours, and keeps in step once a day; so does a Nintendo play
history, through Nintendo's, each game placed once its owner says cartridge or download. What
a sync brings in waits, unsorted, on a page where each game gets a rating and a status, one
tap at a time or many at once, and the shelf says how many wait. On a desktop the shelf is a lit
wall in 3D, walked sideways, and `D` switches between 2D and 3D (a phone has 2D only). It
can be searched as you type, filtered from a panel or in a one-line filter language
(`genre:rpg -theme:horror`), and sorted eleven ways; six smart shelves keep a filter at an
address of their own (`/en/u/sample/shelves/short-ones`). The library can be read as JSON at
`/api/v1`. A game opens over the shelf, its cover growing out of its box, or on a page of its
own. Signed in, an account adds games one at a time or from a pasted list, and edits everything
under "Mine" in place; an assistant can read the library through MCP and, once its account
says yes, add and change games too. The finished games stand on a trophy wall. The design
foundations from step 1 are at `/en/foundations`, unlisted.

## Credits

Game data and artwork will come from [IGDB.com](https://www.igdb.com).
Fonts: [Archivo](https://fonts.google.com/specimen/Archivo) and
[Martian Mono](https://fonts.google.com/specimen/Martian+Mono), both under the SIL Open Font
License.
