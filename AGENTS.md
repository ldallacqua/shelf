# Working on Shelf

Shelf is a personal game library: add games from IGDB, then browse them on a lit shelf with
strong filters and sorting. One owner, public to read. This file is for anyone, human or AI,
about to change the code.

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

| Command                        | Does                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                     | The app at http://localhost:3300                                                                                |
| `pnpm build` then `pnpm start` | A production build, same port                                                                                   |
| `pnpm check`                   | Format, lint, types, translations, unit and component tests                                                     |
| `pnpm test`                    | Unit and component tests (Vitest)                                                                               |
| `pnpm e2e`                     | Browser tests (Playwright) against a production build. Add `--project=chromium-desktop` to run one of the nine. |
| `pnpm perf:js`                 | Each page's first-load JavaScript against its budget. Needs a running server.                                   |
| `pnpm perf:lighthouse`         | Lighthouse, mobile profile. Needs a running server.                                                             |
| `pnpm storybook`               | The component workshop at http://localhost:6300                                                                 |
| `pnpm i18n:check`              | Fails if the two languages disagree                                                                             |
| `pnpm seed [set]`              | Migrates `.data/shelf.db` and fills it with a data set: `default` (230 games), `empty` or `stress` (1,280)      |
| `pnpm db:generate`             | After changing `src/server/db/schema.ts`: writes the difference as a SQL migration into `drizzle/`              |
| `pnpm db:migrate`              | Applies migrations without touching the data                                                                    |
| `pnpm fixtures:fetch`          | Re-fetches `fixtures/` from the real IGDB. The only command that reaches IGDB; run by hand, review the diff     |

Node 24 and pnpm 10 are pinned (`.nvmrc`, `packageManager`). On this Mac, run only the
browser tests your change touches; CI runs all nine projects.

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
in one transaction that ends by raising the library's version. Everything read from outside
(IGDB, settings, fixtures) passes a Zod schema first. Change the schema in
`src/server/db/schema.ts`, run `pnpm db:generate`, and commit the SQL it writes. A migration
must be safe for the code already deployed: add first, remove in a later release.

**The library's views.** The shelf, the wall and the list draw the same shelves
(`arrangeLibrary` in `src/domain/library/view.ts`) and are given the same props. CSS decides
how many boxes fit on a row; `useRowWindow` keeps rows that are far from the window out of
the page. A box is a button whose name says in words everything it shows by shape
(`describeBox`). A cover is always drawn by `Cover`. A choice that belongs to the device
(covers or compact, cover size) goes through `preferences.ts`, which mirrors it on `<html>`
before the first paint; a choice that belongs to the address (view, grouping) goes through
`parseLibraryQuery`. Nothing on the shelf fades in: a cover that starts transparent is
counted as painted late.

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
