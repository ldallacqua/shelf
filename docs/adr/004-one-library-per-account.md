# ADR 004: One library per account

- **Status:** accepted, 21 Oct 2026
- **Date:** 21 Oct 2026
- **Decides:** how Shelf goes from one owner's library to a library for anyone who signs up:
  where each person's games live, what is shared, what is public, and how a page knows whose
  shelf it is

## Context

Shelf was built for one person. There was one account, made from `OWNER_EMAIL` on the first
sign-in, one library (`library_meta` had one row), and every page was that library, public to
read. The owner now wants anyone to be able to sign up and keep a shelf of their own, and the
landing page to invite them to.

Four things had to stay true:

1. Pages are built ahead and cached. A visitor's page asks the server nothing about who they
   are (architecture, section 9).
2. The library file is cached for a year by its address, and a return visit downloads nothing
   unless the library changed (architecture, section 6).
3. Every change is checked on the server (spec 11). A server action is an open endpoint.
4. IGDB allows four requests a second, for the whole site.

The owner chose: anyone can sign up; each person picks public or private, with Public picked
for them; no email yet; the owner's own shelf becomes `/u/lucas`.

## Decision

### 1. A library is an account

There is no separate library id: an account's id is its library's. Every row that is
someone's carries a `user_id`: `entries`, `entry_versions`, `tags`, `shelves`,
`removed_entries`. A new `libraries` table holds each library's `version` (which
`library_meta` held) and its `key` (below). `users` gains `username`, the handle, and
`shelf_public`.

The IGDB cache is shared: `games`, `vocab` and `platforms`. Two people with Hades share one
`games` row. A record belongs to one entry **per library** (ADR 001's rule, now unique on
`user_id, game_id`). Removing a game deletes its `games` row only when no library uses it.

### 2. Every store function takes the library

`src/server/library/store.ts` and `read.ts` take the library id right after the database, and
every query on someone's rows is scoped by it. An entry, copy, removal or shelf id from another
library answers "not found", never "forbidden": it does not say the id exists.

### 3. The lock hands the service its library

`forAccount(run)` checks the session first, every time, and passes `run` the account. A
service works on that account's library and no other; no write takes a library from the
request. A write's answer names the library it changed, so the route or action expires that
library's cache tags (`library:{id}`, `shelves:{id}`, `handle:{handle}`, `key:{key}`).

### 4. Addresses carry the handle

| Address | What |
| --- | --- |
| `/u/{handle}` | That account's library |
| `/u/{handle}/game/{slug}`, `/shelves/{slug}`, `/trophies` | As before, on that shelf |
| `/sign-up`, `/account` | New |
| `/library`, `/game/…`, `/shelves/…`, `/trophies` | Permanent redirects to `/u/lucas/…` |

A handle is 3 to 24 lowercase letters, digits and single hyphens, never one of the site's own
words (`src/domain/accounts/handle.ts`). It can be changed; the old address then leads
nowhere, and the account page says so.

Each shelf's pages are built on their first visit and kept, as game pages already were. A
page under `/u/{handle}` tells its client components whose shelf it is through
`ShelfProvider`; links inside a shelf are built from it (`shelf-address.ts`).

### 5. Files are addressed by a key, not a handle

A public library's files live at `/api/v1/libraries/{key}/snapshot/{version}` (and `games`,
`keywords`), cached for a year by address. The key is random, and changes when the shelf goes
private. A handle would have tied a year of cached files to an address that can change hands.

### 6. A private shelf is drawn only in its own browser

The server never draws, caches or files a private shelf's games. Its pages are frames with no
data. For its own account the browser fills them from `/api/v1/me/library`,
`/api/v1/me/games/{slug}` and friends, answered `private, no-store`. Anyone else is told the
shelf is private, in a page marked not to be indexed. It is in no public API or MCP answer.

Going private gives the library a new key and version. A visitor can no longer reach the old
files from the shelf; someone who already had a file, or its address, may still have it in
their browser or the edge's cache for its year. The setting says so.

### 7. Sign-up and sign-in

Better Auth's email and password, with its `username` plugin for the handle and sign-in by
handle. Passwords are 10 to 128 characters. Sign-up is limited to three an hour from one
address, password tries to five a minute, in the database. Nothing is emailed: there is no
confirming an address and no reset by email; `pnpm account:password <handle>` sets a new one
by hand. Deleting an account removes its library in the same request, after its password.

### 8. IGDB fairness

The global limiter in `src/server/igdb` stays. Each account is also limited per hour
(`src/server/services/fair-use.ts`): 600 searches, 100 matched lists, 300 games added. Over the
limit, the answer is `too-many` (429).

### 9. The migration

One migration adds every column as nullable, so the code still serving during a deployment
keeps working. After it, a data step (`settleAccounts` in `src/server/db/migrate.ts`) gives
every row without a `user_id` to the oldest account, with the handle `lucas`, and moves
`library_meta`'s version into that account's `libraries` row. It runs on every migrate, so
rows the old code writes during the deployment are taken on the next one. Making the columns
required is a later migration.

## Consequences

**Good**

- Each person's library is as fast as the one library was: pages built ahead, files cached by
  address, no request asks who the visitor is.
- One IGDB cache serves everyone, so a game the site has seen costs no IGDB request to add.
- A private shelf is private by construction: there is nothing of it on the server to leak.

**Costs**

- A private shelf's first screen waits for the browser, as a page built on request would.
- Every store function and test grew a parameter.
- A changed handle breaks the old links. No redirect is kept, so a handle can be reused.
- The sample library is now an account, `sample`; a database seeded before this has none and
  is seeded again.

## Alternatives considered

| Alternative | Why not |
| --- | --- |
| A database per account | Turso makes it cheap, but every migration then runs N times, and the shared IGDB cache would be copied N times |
| Library files under the handle | A handle can change and be taken by someone else, while the file stays cached for a year at its address |
| A private shelf drawn on the server for its account | Reading the session makes the page per-request for everyone, or needs a second, uncached route for each page |
| Rows without `user_id`, scoped by a session variable | SQLite has no row security; one forgotten condition would show one person's library to another |
| Email confirmation now | No domain to send from yet. Added when there is one, without changing this record |
