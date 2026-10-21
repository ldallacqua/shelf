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
| Step 7 | Sign-in, adding one game or a pasted list, editing in place, the write API, and MCP for assistants | Built; on a deployment once sign-in is set up ([setup](docs/setup.md), parts B and C) |
| Sync | Steam, PlayStation and Xbox sync, and a Nintendo import: [`docs/adr/003-platform-sync.md`](docs/adr/003-platform-sync.md) | Not started; after step 7 |
| Step 8 | Landing page | Not started |
| Step 9 | Phone and tablet, accessibility and speed passes | Not started |
| Step 10 | Final review | Not started |

What is on screen today: the library, with a sample of 230 real games, as a lit shelf, a wall
of covers or a list, grouped by platform, status or year. On a desktop the shelf is a lit
wall in 3D, walked sideways, and `D` switches between 2D and 3D (a phone has 2D only). It
can be searched as you type, filtered from a panel or in a one-line filter language
(`genre:rpg -theme:horror`), and sorted eleven ways; six smart shelves keep a filter at an
address of their own (`/en/shelves/short-ones`). The library can be read as JSON at
`/api/v1`. A game opens over the shelf, its cover growing out of its box, or on a page of its
own. Signed in with GitHub, the owner (one account only) adds games one at a time or from a
pasted list, and edits everything under "Mine" in place; an assistant can read the library
through MCP and, once the owner says yes, add and change games too. On a deployment that waits
for sign-in to be set up ([setup](docs/setup.md), parts B and C). The home page is still the
foundations page from step 1 (light, color, type, motion, controls) until the landing page
replaces it at step 8.

## Credits

Game data and artwork will come from [IGDB.com](https://www.igdb.com).
Fonts: [Archivo](https://fonts.google.com/specimen/Archivo) and
[Martian Mono](https://fonts.google.com/specimen/Martian+Mono), both under the SIL Open Font
License.
