# Working on Shelf

Shelf is a game library: add games from IGDB, then browse them on a lit shelf with strong
filters and sorting. Anyone can sign up for a shelf of their own, at `/u/{handle}`, public or
private ([ADR 004](docs/adr/004-one-library-per-account.md)). This file is for anyone, human or
AI, about to change the code.

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
3. **Never generate game cover art.** Covers and screenshots come from IGDB, or from Steam's
   store for a game IGDB does not have ([ADR 006](docs/adr/006-games-from-steam.md)). A placeholder
   is a blur of color, never a drawing of a cover. Prompts for every generated image go in
   [`design/assets/PROMPTS.md`](design/assets/PROMPTS.md).
4. **It must read as games, not books.** Covers face out. No serif type. See
   [ADR 002](docs/adr/002-visual-direction.md) for what went wrong the first time.
5. **Tests never talk to the real IGDB, Steam or Nintendo.** They use fixtures.
6. **No bot commits.** Vercel's free plan only deploys commits authored by the owner's
   account.

## Commands

| Command                                 | Does                                                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                              | The app at http://localhost:3300                                                                                                           |
| `pnpm build` then `pnpm start`          | A production build, same port                                                                                                              |
| `pnpm check`                            | Format, lint, types, translations, unit and component tests                                                                                |
| `pnpm verify`                           | Every check, as CI used to run them: build, browsers, Linux pass in Docker, Lighthouse. Run before merging.                                |
| `pnpm test`                             | Unit and component tests (Vitest)                                                                                                          |
| `pnpm e2e`                              | Browser tests (Playwright) against a production build. Add `--project=chromium-desktop` to run one of the nine.                            |
| `pnpm serve:test`                       | The build as the browser tests use it: test doubles on, serving a migrated copy of the database (`.data/e2e.db`)                           |
| `pnpm perf:js`                          | Each page's first-load JavaScript against its budget. Needs a running server.                                                              |
| `pnpm perf:lighthouse`                  | Lighthouse, mobile profile. Needs a running server.                                                                                        |
| `pnpm perf:3d`                          | The 3D shelf's frame time, draw calls and textures on this machine's graphics card. Needs a running server.                                |
| `pnpm storybook`                        | The component workshop at http://localhost:6300                                                                                            |
| `pnpm i18n:check`                       | Fails if the two languages disagree                                                                                                        |
| `pnpm seed [set]`                       | Migrates `.data/shelf.db` and fills the sample shelf, `/u/sample`: `default` (230 games), `empty` or `stress` (1,280)                      |
| `pnpm account:password <handle>`        | A new random password for that account, printed once, every session ended. No email resets yet                                             |
| `pnpm account:moderator <handle> [off]` | Lets that account add a game IGDB does not have, from its Steam link, to the catalog every shelf shares (ADR 006). Nothing on the site can |
| `pnpm db:generate`                      | After changing `src/server/db/schema.ts`: writes the difference as a SQL migration into `drizzle/`                                         |
| `pnpm db:migrate`                       | Applies migrations without touching the data                                                                                               |
| `pnpm fixtures:fetch`                   | Re-fetches `fixtures/` from the real IGDB. The only command that reaches IGDB; run by hand, review the diff                                |
| `pnpm desktop:dev`                      | Shelf for Windows against the local server ([the desktop guide](docs/desktop.md)). Needs Rust                                              |
| `pnpm desktop:build`                    | The desktop app's installer, which opens production                                                                                        |
| `pnpm desktop:test`                     | The desktop app's Rust tests                                                                                                               |
| `pnpm desktop:release`                  | Publishes the desktop app's version in `tauri.conf.json` as a release, signed; from a clean `main` only                                    |
| `pnpm desktop:check`                    | The desktop app against `pnpm serve:test`, its pages read beside a plain Chromium's. Needs a running server                                |

Node 24 and pnpm 10 are pinned (`.nvmrc`, `packageManager`). **CI runs nothing by itself**
(Actions minutes are limited). **Run every test once, before merging a pull request**, not
at each commit or push: the full run is long, and the owner asked that it not hold work up
(21 Oct 2026). While working, run what helps: the tests for what you are changing, a type
check. Before merging, `pnpm verify` must pass on the branch's last commit, and the pull
request says what it ran. A build step is done when its pull request merges that way. Never
start the workflow on GitHub unless the owner asks. **Until the MVP is done, no Playwright
browser tests run** (the owner's rule, 23 Oct 2026): verify runs as `pnpm verify
--skip-browser`, and the pull request says the browser tests were skipped. Unit tests,
Lighthouse and the rest still run.

A fresh clone needs `pnpm seed` once before `pnpm dev` or `pnpm build`: the app reads its
libraries from `.data/shelf.db`, which is not committed. A database seeded before accounts
(ADR 004) has no sample account: seed it again.

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
desktop/        Shelf for Windows, a Tauri program in Rust (ADR 005): it opens the hosted site
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
IGDB record belongs to one entry per library. ADR 004 adds the library: each account's id is
its library's, every row that is someone's carries it (`user_id`), and the IGDB cache (`games`,
`vocab`, `platforms`) is shared. Every store function takes the library id after the
database, and every query on someone's rows is scoped by it: an id from another library
answers "not found". Every write goes through `src/server/library/store.ts`, in one
transaction that ends by raising that library's version. The one exception is smart shelves:
they are not in the library file, so a shelf write leaves the version alone and expires the
`shelves:{id}` tag instead. Everything read from outside
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
before the first paint, and the shelves folded away go through `collapsed.ts`, which the same head
script hides before the first paint; a choice that belongs to the address (view, grouping, filter, sort,
seed) goes through `parseLibraryQuery`. Nothing on the shelf fades in: a cover that starts transparent is
counted as painted late.

**A game's page.** `src/features/game-detail` draws it both as a page of its own
(`/u/{handle}/game/{slug}`, built on its first visit and kept: a page built ahead answers a browser's move
to it with a 404 once its tag expires) and as the panel a game opens in over the library. The panel is
the library's own, not a route: opening a game adds its address to history with the
library's query string kept (`game-address.ts`), and Back closes it. What the library file
lacks (summary, screenshots, art, releases) comes from `buildGamePage`; the panel fetches it
as the game's facts, by library version, and keeps the facts it has while a newer version's
are fetched, so a change never takes them back to ghosts. While the editor is on its way to
the shelf's own account, `mine-skeleton.tsx` holds its place in the editor's exact shape: change
`mine-editor.tsx` and change the skeleton with it (a test in `e2e/game.spec.ts` fails when
they differ). The cover grows from the box through `morph.ts`,
which names the two ends for that one view transition only. Past `GAME_CENTERED`, on a very wide
window, the panel stands centered with the page's two columns. That is style alone (the
`game-centered` variant, and a container query inside it), so resizing past the line moves the same
elements and loses nothing; keep it out of React. A private note never leaves the
server except to its own account, in `GET /api/v1/entries/{id}`, which the editor reads.

**Filters.** The filter language is `src/domain/query/`: `parse.ts` turns text into a tree
and never throws (what it cannot read becomes a problem with a position), `write.ts` turns a
tree back into canonical text, `evaluate.ts` runs a tree over one index of bitmaps per library
(`indexOnce`), `facets.ts` counts, and `panel.ts` is every edit the panel and the chips make.
The search field and the panel are two views of one tree: change the tree, never the text by
hand. A new filter key goes in `keys.ts` and gets a test in `parse.test.ts` and
`evaluate.test.ts` first. The public API (`src/server/api/`) parses every answer with its own
Zod schema before sending it, and the OpenAPI document is built from those schemas: change
the schema and the document follows.

**Accounts.** Anyone signs up (`/sign-up`) with a name, a handle, an email address and a
password; nothing is emailed, so there is no confirming and no reset but
`pnpm account:password` (`src/server/auth/auth.ts`, ADR 004). The handle is the shelf's
address, `/u/{handle}`; its rules are `src/domain/accounts/handle.ts`. The lock is
`requireAccount()`, inside `forAccount()`, at the top of every service a route, an action or an
MCP tool calls to change or privately read anything: it hands the service the session's own
account, and the service works on that library and no other. A write never names a library.
`signed-out.test.ts` asks each service as nobody, and the store tests ask with another
library's ids. The browser learns who is here from `/api/v1/me` (`useAccount`), and only asks
when the `shelf_signed_in` cookie is there, so a visitor costs nothing. Edit controls and Add
appear only on one's own shelf (`useIsMine`), after that answer. An assistant on
`/api/mcp/owner` has no cookie: the route checks its token and runs the tools inside
`asAccount()`. Never call `asAccount()` anywhere else. Test accounts in the browser tests are
made through the real sign-up, with handles no other run can have.

**A private shelf.** Its pages are frames with no data, built ahead like any other. For its
own account the browser fills them from `/api/v1/me/…`, answered `private, no-store`; anyone
else is told it is private. It never has a file under `/api/v1/libraries/{key}/…`, and is in no
public API or MCP answer. Going private gives the library a new key, so the old files'
addresses lead nowhere.

**Changing the library from the page.** Adding one game and saving shelves are server actions
(`updateTag`). Editing, adding from a list and Undo of a removal go through the API
(`edit-client.ts`, `list-client.ts`): a server action that expires the library draws the
current address again, and with a game's panel open that is the game's own page, which then
replaces the shelf. After a change, call `announceChange()` with the new version: the
library fetches its new file and moves to the game. Every write to the library answers with
its new version for that.

**The landing page.** `/` is where people learn what Shelf does (`src/features/landing`, spec
15), so it grows with the product: a feature a visitor would choose Shelf for gets its part
there, in the same change, shown working on the example shelf, with its question in the FAQ
if it raises one. A change to something a part shows (a filter key, a view, how copies or
privacy work) changes that part too, and a feature that is taken away leaves the page. The
example shelf is `pnpm landing:demo`; a part that needs a game it lacks adds the game there.
What a link to Shelf shows is a picture of the hero (`public/share/`): after changing the
hero, run `pnpm landing:share` against `pnpm serve:test` and look at both pictures.

**Syncing.** A store or console fills a shelf through one matcher and one memory
([ADR 003](docs/adr/003-platform-sync.md)). What a source can tell (owned, played, or nothing)
is `src/domain/sync/sources.ts`; how to ask it is its adapter in `src/server/sync/` (Steam's
is `steam.ts`, Nintendo's `nintendo.ts`, each the only code that knows its addresses); the ladder, the steps and the
answers are `src/server/services/sync.ts`, the same for every source. What a source listed and
what was decided about it are `source_items`, the sync's own rows, written by
`server/sync/memory.ts`; a game onto the shelf, or hours onto a copy, go through the store
(`addFromSource`, `feedCopies`) like every other write. A sync never changes what I set, never
deletes, and never puts back a game I took off (`removed`). A game it adds starts `unsorted`
(or playing, if played these two weeks), never in the backlog: owning a game says nothing of
where it stands with me. Before matching, the store says what each item is (`kind`), and
demos, playtests and software are left out by themselves. A source that lists what was
played (Nintendo) puts nothing on the shelf by itself: each match waits for me to say how I
own it (`confirm`, one at a time or many at once). A platform account is linked only through
the platform's own sign-in; Nintendo's page cannot come back, so its button's link is pasted
into the account page (`server/sync/connect.ts`). What a sign-in gives Shelf to keep (Nintendo's
session) is stored sealed (`server/sync/sealed.ts`, `PLATFORM_TOKEN_KEY`), opened only to
read the source, and never sent to a browser. Tests never talk to Steam or Nintendo:
`fixtures/steam/`, `fixtures/nintendo/` and the doubles in `server/mocks/` answer; with the
test doubles on, "Sign in through Steam" comes straight back with the made-up account, and
"Sign in on Nintendo's page" opens a stand-in whose button links to the made-up one.

**IGDB.** Only `src/server/igdb` knows IGDB's address. It owns the token, the rate limit and
the checking. Nothing a visitor can reach may call it. Covers and screenshots are used
straight from IGDB's image servers, through `src/domain/igdb/images.ts`.

**A game IGDB does not have.** A sync reads one Steam lists for an account from its store, by itself
(ADR 006, decision 13). For any other, a moderator (`users.moderator`, set only by `pnpm account:moderator`)
pastes its Steam link in Add a game ([ADR 006](docs/adr/006-games-from-steam.md)). Only the app's
number leaves the pasted text (`steamAppIdIn`): the address is never fetched. Everything else is read
from Steam on the server, by `src/domain/steam/store-game.ts` and `steam.storeGame`, and stored as a
`games` row with no `igdb_id`, a `steam_app_id`, and images whose id is their path on Steam's servers,
which `imageUrl` reads like any other. Services that only a moderator may reach go through
`forModerator`. A game IGDB has is never added this way: the link sends it to the search. A sync
recognizes these games by their app, before IGDB's rungs (`recognize`). A screenshot marked `mature` is
drawn blurred (`screenshots.tsx`), a game for adults' art marked so stands dimmed behind its cover, and
neither goes anywhere a page's rules don't reach: filter them out of anything new
that reads a game's screenshots.

**Stores.** `src/domain/library/stores.ts` knows them and where a download on a PC is from
(`copies.stores`, `entries.wanted_stores`); every shelf loads it, so it stays small and free of Zod. A
store's position in `storeNames` is in the library file, so a new one goes at the end.
`store-choices.ts` is what the forms offer. `store-links.ts` chooses a game's links (`games.store_links`, read from IGDB by `toGameData`), only ever
to the store's own servers. Spec 7.9.

**Icons.** lucide's, and `src/ui/icons.tsx` for what it lacks, drawn as lucide draws. Never a
store's or console's logo: Nintendo, Microsoft and Sony allow none, and Valve only its sign-in
button (architecture, section 11). Name them in words. An icon beside words is `aria-hidden`.

**Loading.** Everywhere something loads, the page draws a skeleton, and never says "Loading" in
words or spins (spec 3.10; lint refuses both). Ghosts come from `src/ui/ghost.tsx`: `Loading` wraps
them and gives the words to assistive technology alone, `Ghost` takes the size and shape of what
replaces it, and `GhostText` a line of the type around it; `Ghosts`, in `ghosts.tsx`, is a paragraph.
What every page draws, such as the header, uses the `.ghost` class on a plain element, to keep the
module out of every page's script. Words that do not
depend on the answer (a heading, a label, an intro) are drawn for real around the ghosts, so only
what is unknown changes. Share the layout's classes between a thing and its ghost, so the content
arrives where its ghosts stood; a ghost must not outlive a failed read. A page only for an account
asks `useAccount('checking')`, so it is built ahead as its ghosts and tells nobody signed in to
sign in, and a public page's header answers the `hinted:` variant, on where the browser has signed
in. Two things are not a load and keep their words: a button saying what it is doing because
I pressed it (Saving…, Signing in…), and the count of a long job (Adding 3 of 40…). Nothing is
drawn for what may never come, as the owner's Add button is to a visitor.

**Comments** say why, in plain words. They do not restate the code.

## Done means

- `pnpm check` passes, and the browser tests for what you touched pass.
- No error in the browser console.
- Both themes and both languages were looked at, at phone and desktop width.
- New behavior has a test. A bug fix has a test that failed before it.
- The landing page shows the feature, and still tells the truth about the ones it changed.
- Reference screenshots are updated if the look changed on purpose
  ([how](docs/testing.md#reference-screenshots)).
- One commit per build step, with a message that says what changed and why.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
