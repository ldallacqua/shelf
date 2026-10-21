# Working on Shelf

Shelf is a personal game library: add games from IGDB, then browse them on a lit shelf with
strong filters and sorting. One owner, public to read. This file is for anyone, human or AI,
about to change the code.

**Picking up from another computer?** Read [the handoff note](docs/handoff.md) first: where
the build stands, what is still unchecked, and the owner's rules that are not written
anywhere else.

Read first, in this order: [the spec](docs/spec.md) (what it does),
[the architecture](docs/architecture.md) (how it is built), and the decision records in
[`docs/adr/`](docs/adr/). The build runs in ten steps; the README says which one is current.

## Rules that are not negotiable

1. **`~/platform` is read-only.** It is the owner's older app, kept as a reference. Never
   change it, install into it, or run a migration against it.
2. **No secret leaves `.env.local`.** Never print one, commit one, or paste one into a
   message. `.env.example` holds names only. Production values are pasted into Vercel by the
   owner.
3. **Never generate game cover art.** Covers and screenshots come from IGDB. A placeholder is
   a blur of color, never a drawing of a cover. Prompts for every generated image go in
   [`design/assets/PROMPTS.md`](design/assets/PROMPTS.md).
4. **It must read as games, not books.** Covers face out. No serif type. See
   [ADR 002](docs/adr/002-visual-direction.md) for what went wrong the first time.
5. **Tests never talk to the real IGDB.** They use fixtures.
6. **No bot commits.** Vercel's free plan only deploys commits authored by the owner's
   account.

## Commands

| Command                        | Does                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | The app at http://localhost:3300                                                                                 |
| `pnpm build` then `pnpm start` | A production build, same port                                                                                    |
| `pnpm check`                   | Format, lint, types, translations, unit and component tests                                                      |
| `pnpm verify`                  | Every check, as CI used to run them: build, browsers, Linux pass in Docker, Lighthouse. Run before merging.      |
| `pnpm test`                    | Unit and component tests (Vitest)                                                                                |
| `pnpm e2e`                     | Browser tests (Playwright) against a production build. Add `--project=chromium-desktop` to run one of the nine.  |
| `pnpm serve:test`              | The build as the browser tests use it: test doubles on, serving a migrated copy of the database (`.data/e2e.db`) |
| `pnpm perf:js`                 | Each page's first-load JavaScript against its budget. Needs a running server.                                    |
| `pnpm perf:lighthouse`         | Lighthouse, mobile profile. Needs a running server.                                                              |
| `pnpm perf:3d`                 | The 3D shelf's frame time, draw calls and textures on this machine's graphics card. Needs a running server.      |
| `pnpm storybook`               | The component workshop at http://localhost:6300                                                                  |
| `pnpm i18n:check`              | Fails if the two languages disagree                                                                              |
| `pnpm seed [set]`              | Migrates `.data/shelf.db` and fills it with a data set: `default` (230 games), `empty` or `stress` (1,280)       |
| `pnpm db:generate`             | After changing `src/server/db/schema.ts`: writes the difference as a SQL migration into `drizzle/`               |
| `pnpm db:migrate`              | Applies migrations without touching the data                                                                     |
| `pnpm fixtures:fetch`          | Re-fetches `fixtures/` from the real IGDB. The only command that reaches IGDB; run by hand, review the diff      |

Node 24 and pnpm 10 are pinned (`.nvmrc`, `packageManager`). **CI runs nothing by itself**
(Actions minutes are limited). **Run every test once, before merging a pull request**, not
at each commit or push: the full run is long, and the owner asked that it not hold work up
(21 Oct 2026). While working, run what helps: the tests for what you are changing, a type
check. Before merging, `pnpm verify` must pass on the branch's last commit, and the pull
request says what it ran. A build step is done when its pull request merges that way. Never
start the workflow on GitHub unless the owner asks.

A fresh clone needs `pnpm seed` once before `pnpm dev` or `pnpm build`: the app reads its
library from `.data/shelf.db`, which is not committed.

## Where code goes

```text
src/domain/     Rules and types. Imports nothing but Zod.
src/server/     Runs only on the server. Imports domain.
src/ui/         The design system: tokens, fonts, buttons, menus, the shelf, the game case.
                Imports nothing of ours and takes its text as props.
src/features/   The interface, by feature. Imports domain and ui.
src/app/        Routes. Thin: they compose features. Imports anything.
src/i18n/       Language setup and the list of pages.
messages/       en.json and pt-BR.json
fixtures/       Real IGDB records for seeds and tests. See fixtures/README.md.
drizzle/        Database migrations, as SQL. Generated; reviewed; never edited after merging.
e2e/            Browser tests and reference screenshots
scripts/        Seeds, checks and measurements
```

Lint enforces these imports, and that three.js is imported only inside
`src/features/shelf-3d`. A broken rule is an error, not a warning.

## How things are done here

**Text.** Every word a visitor reads comes from `messages/`. English is the source; add the
key to both files or `pnpm i18n:check` fails. A literal string inside a component is a lint
error. Filter keys stay English in both languages.

**A new page.** Add the folder under `src/app/[locale]/`, then add its address to `pathnames`
in `src/i18n/routing.ts`. Links are type-checked against that list, the proxy answers 404
for anything not on it, and a test fails if the list and the folders disagree.

**Color.** Use the meaning tokens (`bg-wall`, `text-muted`, `bg-accent`), never a palette
color and never a raw hex in a component. Tailwind's stock palette is switched off. The
exception is a game's own colors, which are data. A new text-on-background pair must be added
to the contrast test in `src/ui/tokens/tokens.test.ts`.

**Light.** A theme is a lighting state: room lights on, or off with the LEDs carrying the
room. Draw with the lighting tokens (`--led`, `--led-strength`, `--glow`, `--shadow-depth`)
so one component serves both themes. Set `--led` on a shelf to light it in a game's color.
No text may sit in the bright band right behind the games.

**Motion.** Five lengths (`duration-instant` to `duration-cinematic`) and three curves
(`ease-glide`, `ease-settle`, `ease-leave`). Nothing bounces. Anything that moves does so
under `motion-safe:`, and has a calm version that does not move. Color and opacity may still
change under reduced motion.

**Accessibility.** WCAG 2.2 AA. Focus is always a 2px accent ring. Targets are at least
24 by 24 pixels. State is never shown by color alone. Anything a pointer can do, the keyboard
can do.

**Pages are built ahead of time.** Reading a cookie, a header or the address on the server
makes a page slower for everyone. A component that needs the address (`usePathname`,
`useSearchParams`) goes inside `<Suspense>` with a plainer version of itself as the fallback.

**Data.** ADR 001 is the model: one entry per game, a copy per platform and format, and an
IGDB record belongs to one entry only. Every write goes through `src/server/library/store.ts`,
in one transaction that ends by raising the library's version. The one exception is smart
shelves: they are not in the library file, so a shelf write leaves the version alone and
expires the `shelves` tag instead. Everything read from outside
(IGDB, settings, fixtures) passes a Zod schema first. Change the schema in
`src/server/db/schema.ts`, run `pnpm db:generate`, and commit the SQL it writes. A migration
must be safe for the code already deployed: add first, remove in a later release.

**The library's views.** The shelf, the wall and the list draw the same shelves
(`arrangeLibrary` in `src/domain/library/view.ts`) and are given the same props. CSS decides
how many boxes fit on a row; `useRowWindow` keeps rows that are far from the window out of
the page. On a phone the shelves beside the one in view keep only the box Tab stops at
until the page is first touched (`first-touch.ts`). Before a shelf has measured itself it
draws only its share of the first screen (`shareFirstBoxes`): 48 boxes, or 12 for a phone (`isPhone` reads the request; use it only
for guesses that are harmless when wrong). A box, a wall cover and a shelf's section are
memoized; give them props that stay the same from one drawing to the next (one handler per
shelf, never one per box), and do work that is the same for every redraw in a component of
its own, not in a `.map()`. `pnpm perf:lighthouse` slows the processor by an amount worked out from the machine, so a fast Mac stands in for a mid-range phone; it has read a few points kinder than GitHub's runners, so aim above 90. Messages are compiled at build time (`next.config.ts`): `t.raw` does not work. Blurred glass (`backdrop-filter`) is for one or two
bars a page, never for something repeated per shelf: the Linux build of WebKit hangs on a
dozen. A box is a button whose name says in words everything it shows by shape
(`describeBox`). A cover is always drawn by `Cover`. A choice that belongs to the device
(covers or compact, cover size, 2D or 3D) goes through `preferences.ts`, which mirrors it on `<html>`
before the first paint; a choice that belongs to the address (view, grouping, filter, sort,
seed) goes through `parseLibraryQuery`. Nothing on the shelf fades in: a cover that starts transparent is
counted as painted late.

**A game's page.** `src/features/game-detail` draws it both as a page of its own
(`/game/{slug}`, built on its first visit and kept: a page built ahead answers a browser's move
to it with a 404 once its tag expires) and as the panel a game opens in over the library. The panel is
the library's own, not a route: opening a game adds its address to history with the
library's query string kept (`game-address.ts`), and Back closes it. What the library file
lacks (summary, screenshots, art, releases) comes from `buildGamePage`; the panel fetches it
as the game's facts, by library version, and keeps the facts it has while a newer version's
are fetched, so a change never takes them back to ghosts. While the owner's editor is on its
way, `mine-skeleton.tsx` holds its place in the editor's exact shape: change
`mine-editor.tsx` and change the skeleton with it (a test in `e2e/game.spec.ts` fails when
they differ). The cover grows from the box through `morph.ts`,
which names the two ends for that one view transition only. A private note never leaves the
server except to the owner, in `GET /api/v1/entries/{id}`, which the editor reads.

**Filters.** The filter language is `src/domain/query/`: `parse.ts` turns text into a tree
and never throws (what it cannot read becomes a problem with a position), `write.ts` turns a
tree back into canonical text, `evaluate.ts` runs a tree over one index of bitmaps per library
(`indexOnce`), `facets.ts` counts, and `panel.ts` is every edit the panel and the chips make.
The search field and the panel are two views of one tree: change the tree, never the text by
hand. A new filter key goes in `keys.ts` and gets a test in `parse.test.ts` and
`evaluate.test.ts` first. The public API (`src/server/api/`) parses every answer with its own
Zod schema before sending it, and the OpenAPI document is built from those schemas: change
the schema and the document follows.

**The owner.** There is one account, signed into with an email address and password: it is
made from `OWNER_EMAIL` and `OWNER_PASSWORD` on the first sign-in (`src/server/auth/auth.ts`),
its password follows the setting, and nobody can make another. Never print, log or test
against a real value of either. The lock is `requireOwner()`, inside `forOwner()`, which
compares the session's email address with `OWNER_EMAIL`, at the top of every service a route, an action
or an MCP tool calls to change or privately read anything; `owner-only.test.ts` asks each one
as a stranger. The browser learns it is the owner from `/api/v1/me` (`useOwner`), and only
asks when the `shelf_owner_hint` cookie is there, so a visitor costs nothing. Edit controls
appear only after that answer. An assistant on `/api/mcp/owner` has no cookie: the route
checks its token and runs the tools inside `asOwner()`. Never call `asOwner()` anywhere else.

**Changing the library from the page.** Adding one game and saving shelves are server actions
(`updateTag`). Editing, adding from a list and Undo of a removal go through the API
(`edit-client.ts`, `list-client.ts`): a server action that expires the library draws the
current address again, and with a game's panel open that is the game's own page, which then
replaces the shelf. After a change, call `announceChange()` with the new version: the
library fetches its new file and moves to the game. Every write to the library answers with
its new version for that.

**IGDB.** Only `src/server/igdb` knows IGDB's address. It owns the token, the rate limit and
the checking. Nothing a visitor can reach may call it. Covers and screenshots are used
straight from IGDB's image servers, through `src/domain/igdb/images.ts`.

**Comments** say why, in plain words. They do not restate the code.

## Done means

- `pnpm check` passes, and the browser tests for what you touched pass.
- No error in the browser console.
- Both themes and both languages were looked at, at phone and desktop width.
- New behavior has a test. A bug fix has a test that failed before it.
- Reference screenshots are updated if the look changed on purpose
  ([how](docs/testing.md#reference-screenshots)).
- One commit per build step, with a message that says what changed and why.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
