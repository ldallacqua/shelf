# Shelf: the API

Shelf's public shelves can be read by other programs: a script, a spreadsheet, another site,
an AI assistant. Each is read by its handle, as in its address `/u/{handle}`. Reading is
public, needs no key, and answers in JSON; a private shelf answers 404, as a shelf no account
has does. Writing acts on one's own shelf, signed in ([below](#writing-to-ones-own-shelf)),
and an assistant can do both through
[MCP](#mcp-for-ai-assistants). The design is in
[the architecture, section 16](architecture.md#16-api-mcp-and-machine-readable-pages); the
filter language is [spec section 5.3](spec.md#53-the-filter-language).

The machine-readable description is the OpenAPI 3.1 document at
[`/api/v1/openapi.json`](#get-openapijson). It is generated from the same Zod schemas every
answer is checked against before it is sent, so it cannot drift from what the API does.

## The basics

| | |
| --- | --- |
| Address | `https://{the site}/api/v1` |
| Sign-in | None to read a public shelf. A write takes the session cookie signing in on the site sets, acts on that account's own shelf, and answers 401 without it. |
| Format | JSON, UTF-8 |
| Other sites | Allowed: every answer carries `Access-Control-Allow-Origin: *` |
| Caching | `s-maxage=60, stale-while-revalidate=600`: the edge keeps an answer for a minute. The library and keyword files are kept for a year, because their address changes when they do. |
| Bad parameters | Taken as their default, never an error, as the site's own addresses are |
| Errors | A status and `{ "error": { "code": "not-found", "message": "…" } }` |

**`version`.** Every answer about the library says which version of it it describes. The
number goes up with every change to the library, so two answers with the same version
describe the same library.

## The filter language, in short

The parameter `q` is a filter, exactly as the library's address and a smart shelf store it.

| Write | Means |
| --- | --- |
| `zelda`, `"breath of the wild"` | In the title; quotes make a phrase |
| `genre:rpg` | Genre is RPG |
| `genre:rpg,strategy` | RPG or strategy |
| `genre:rpg genre:strategy` | RPG and strategy |
| `-theme:horror` | Not horror |
| `status:playing OR status:backlog` | Either |
| `(owned:ps5 format:physical) OR rating:>=9` | Either group |
| `year:2015..2020`, `rating:>=8`, `hours:<10` | A range or a comparison |
| `completed:2025`, `added:2025-06` | A year, a month or a day stands for all of it |

| Kind | Keys |
| --- | --- |
| Mine | `status`, `owned`, `format`, `copies`, `rating`, `hours`, `completed`, `added`, `tag`, `has`, `is` |
| From IGDB | `genre`, `theme`, `keyword`, `mode`, `perspective`, `kind`, `platform`, `franchise`, `series`, `developer`, `publisher`, `year`, `igdb`, `length` |

- Values are lower case with hyphens: `developer:eidos-montreal`, `tag:couch-co-op`. The
  values a key takes, with how many games each would match, are what
  [`/u/{handle}/facets`](#get-uhandlefacets) lists.
- `rating` is out of 10; `hours` and `length` (time to beat) are in hours; `igdb` is IGDB's
  rating out of 100; `copies` is how many platforms a game is owned on.
- `owned:` takes a platform (`owned:switch`) or a family (`owned:playstation`). In one group,
  `owned:` and `format:` describe the same copy: `owned:switch format:physical` is a game
  owned on a Switch cartridge.
- Keys are English in both languages, so a filter works for everyone.
- A part that cannot be understood is left out, and the answer says which in `problems`.
  The rest of the filter still applies.

## `GET /u/{handle}/library`

The games of a public shelf a filter matches, in order, a page at a time, and the shelves
they make.

| Parameter | | Default |
| --- | --- | --- |
| `q` | A filter, up to 1,000 characters | Every game |
| `sort` | `title`, `added`, `released`, `rating`, `igdb`, `hours`, `completed`, `status`, `length`, `color` or `random`. A leading `-` reverses it: `-rating` is highest first. Missing values come last either way; ties go by title. | `title` |
| `seed` | For `random`: up to 16 letters and digits. The same seed shuffles the same way. | None |
| `group` | `platform`, `status`, `year` or `none` | `platform` |
| `limit` | Games per page, 1 to 200 | `50` |
| `cursor` | Where to start: the `next` of the page before | The first game |
| `lang` | `en` or `pt-BR`: how titles are put in order | `en` |

```text
GET /api/v1/u/sample/library?q=genre:rpg&sort=-rating&group=none&limit=1
```

```json
{
  "version": 1791997483,
  "query": { "q": "genre:rpg", "sort": "-rating", "group": "none", "seed": "" },
  "problems": [],
  "stats": { "games": 86, "finished": 32, "hours": 2366 },
  "shelves": [{ "key": "all", "count": 86 }],
  "games": [
    {
      "slug": "chrono-trigger",
      "title": "Chrono Trigger",
      "status": "completed",
      "rating": 10,
      "year": 1995,
      "releasedOn": "1995-03-11",
      "igdbRating": 92,
      "hoursPlayed": 36.4,
      "timeToBeat": 29.2,
      "addedOn": "2021-09-22",
      "completedOn": "2022-02-25",
      "kind": "main",
      "featured": true,
      "owned": [{ "platform": "wii", "name": "Wii", "format": "physical" }],
      "platforms": ["satellaview", "snes", "wii", "super-famicom"],
      "genres": ["rpg"],
      "themes": ["fantasy", "science-fiction", "open-world"],
      "tags": ["replay-someday"],
      "cover": "https://images.igdb.com/igdb/image/upload/t_cover_big/co3plw.webp"
    }
  ],
  "next": "1"
}
```

(The sample library's first answer, with `limit=1`.)

- `stats` counts each matching game once. `shelves` are the shelves the grouping makes, in
  order: `platform:167`, `status:playing`, `year:2018` or `all`. A game owned on two
  platforms stands on both, so shelf counts can add up to more than `stats.games`.
- `games` are in sort order across the whole result, not shelf by shelf. `owned` is the
  copies, one per platform; `platforms` is every platform the game was released on.
- `next` is `null` on the last page.
- `problems` lists the parts of `q` that were left out: the text, why (`unknown-key`,
  `bad-value`, `missing-value`, `unclosed-bracket`, `stray-bracket`, `empty-brackets`,
  `dangling-or`, `nothing-to-negate`), and where it stands in `q`.

## `GET /u/{handle}/facets`

Every value of every list filter, with how many games it would match given the rest of `q`,
and the range each number and date key spans.

| Parameter | | Default |
| --- | --- | --- |
| `q` | A filter | Every game |

```text
GET /api/v1/u/sample/facets?q=genre:rpg
```

```json
{
  "version": 1791997483,
  "q": "genre:rpg",
  "total": 86,
  "facets": {
    "status": [{ "value": "playing", "name": "playing", "count": 3 }],
    "genre": [{ "value": "rpg", "name": "Role-playing (RPG)", "count": 86 }]
  },
  "ranges": { "rating": { "min": 3, "max": 10 }, "year": { "min": 1986, "max": 2025 } },
  "dates": { "completed": { "min": "2020-12-30", "max": "2026-09-30" } }
}
```

(Shortened: every list key is there, with every value.)

- A value's count leaves out the conditions `q` already puts on that key, so it says what
  picking that value would give. Above, with `genre:rpg`, each genre's count is its count in
  the whole library, and `status` counts split the 86 RPGs.
- `keyword` is left out: a library has thousands. They are in the
  [keywords file](#get-librarieskeykeywordsversion).
- `name` is the name IGDB or the library gives a value, in English. Fixed values (statuses,
  formats, kinds) are named by the value itself; the site translates them, the API does not.
- A key with no values in the library has `null` for its range.

## `GET /u/{handle}/games/{slug}`

One game on a public shelf, with everything its page shows a visitor: what is in
`GET /u/{handle}/library` for it, and IGDB's summary and storyline, its credits, its first
release on each platform, its times to beat, its key art and screenshots, and the shelf's
notes when they were made public. The slug is the game's address on the site:
`/en/u/{handle}/game/{slug}`.

```text
GET /api/v1/u/sample/games/advance-wars
```

```json
{
  "slug": "advance-wars",
  "title": "Advance Wars",
  "status": "wishlist",
  "year": 2001,
  "genres": ["simulator", "strategy", "tbs", "tactical"],
  "summary": "Just because this battle fits in the palm of your hand doesn't mean the stakes are small. …",
  "developers": [{ "value": "intelligent-systems", "name": "Intelligent Systems" }],
  "publishers": [
    { "value": "nintendo", "name": "Nintendo" },
    { "value": "ique", "name": "iQue" }
  ],
  "series": [{ "value": "advance-wars", "name": "Advance Wars" }],
  "releases": [
    { "platform": "gba", "name": "Game Boy Advance", "date": "2001-09-10" },
    { "platform": "wii-u", "name": "Wii U", "date": "2014-04-03" }
  ],
  "timesToBeat": null,
  "igdbRatingCount": 141,
  "igdbUrl": "https://www.igdb.com/games/advance-wars",
  "notes": null,
  "backdrop": "https://images.igdb.com/igdb/image/upload/t_screenshot_huge/ar1ksu.webp",
  "screenshots": ["https://images.igdb.com/igdb/image/upload/t_screenshot_huge/xhhyrgwo9z1ebf0qy9gs.webp"]
}
```

(Shortened: every field of a game in `GET /u/{handle}/library` is there too.)

- `developers`, `publishers`, `franchises`, `series`, `modes` and `perspectives` give each
  value as its filter key takes it (`developer:intelligent-systems`) and by its name.
- `releases` are the first release on each platform, oldest first, across every version
  folded into the game: a port released years later gives its platform its own date. `date`
  is `YYYY` when IGDB knows only the year.
- `timesToBeat` is in hours: `hastily` (the main story), `normally` (with the extras) and
  `completely`. `timeToBeat` is the normal one, as `GET /u/{handle}/library` gives it.
- `notes` is `null` unless the notes for this game were made public. Private notes are never
  sent.
- A slug that is no game's answers 404, as `GET /u/{handle}/shelves/{slug}` does. A version
  folded into another game has no address of its own.

## `GET /u/{handle}/shelves`

A public shelf's smart shelves: named filters, each with a sort and a grouping, at an address
of their own on the site.

```json
{
  "shelves": [
    {
      "slug": "short-ones",
      "name": "Short ones",
      "query": "status:backlog length:<10",
      "sort": "length",
      "group": "none",
      "path": "/u/sample/shelves/short-ones"
    }
  ]
}
```

A shelf's games are `GET /u/{handle}/library` with its `query`, `sort` and `group`. Its page
is `path` after the language: `/en/u/sample/shelves/short-ones`.

## `GET /u/{handle}/shelves/{slug}`

One shelf, as above. A shelf that is not there answers 404:

```json
{ "error": { "code": "not-found", "message": "There is no shelf called not-a-shelf" } }
```

## `GET /libraries/{key}/snapshot/{version}`

A public library whole, in one compact file, as the site's own pages use it to filter in the
browser. `{key}` is the library's own, random, and changes when its shelf goes private; the
site's pages know it. The file is made for Shelf and its layout may change between versions
of the site (`format` says which); use `/u/{handle}/library` for anything else. An address
with an old version is sent on to the current one (307).

## `GET /libraries/{key}/keywords/{version}`

Every keyword the library's games have, and which games have each, by slug. The site fetches
it the first time a keyword filter is used. Like the snapshot, it is kept for a year, moves
when the library does, and an old version is sent on to the current one.

## `GET /handles/{handle}`

Whether a shelf could have this handle: `{ "available": true }`, or `{ "available": false,
"problem": "taken" }`, with `short`, `long`, `shape` or `reserved` for a handle that cannot
be. The sign-up page asks as a handle is typed.

## Writing to one's own shelf

Everything the site's Add sheet and "Mine" do, with the session cookie that signing in sets,
on that account's own shelf: a write never names a shelf, and another shelf's games answer
`not-found`. A write is kept by nothing between the server and the account
(`Cache-Control: private, no-store`), and every page and file built from the library is made
again on its next visit. Ratings are out of ten and time is in hours, as the reads give them.

| Method and path | Does |
| --- | --- |
| `GET /me` | Who is signed in: `{ "signedIn": true, "handle", "name", "shelfPublic" }`, or `{ "signedIn": false }` |
| `PATCH /me` | Changes the name, the handle or whether the shelf is public: `{ "name"?, "handle"?, "shelfPublic"? }`. A taken handle answers 409 `handle-taken`; one that cannot be, 400 `handle-short`, `handle-long`, `handle-shape` or `handle-reserved`. |
| `GET /me/library`, `GET /me/games/{slug}`, `GET /me/keywords`, `GET /me/tags`, `GET /me/shelves` | One's own library, as the public files and reads give a public one, read fresh: what a private shelf's pages are filled from |
| `GET /igdb/search?q=` | Up to eight games on IGDB, editions left out, ports folded in, each marked when one's own library has it |
| `POST /igdb/match` | Up to twenty pasted lines (`{ "lines": ["Hollow Knight (2017) [Switch]"] }`), each with its match, how sure it is (`exact`, `close`, `none`) and up to five alternatives |
| `POST /entries` | Adds a game: `{ "igdbId": 231, "status": "backlog", "copies": [{ "platform": 6, "format": "digital" }] }` (Half-Life, on PC). A game related to one in the library is folded into it as [ADR 001](adr/001-game-entry-model.md) proposes, unless `grouping` says `separate`. A game already there gets only the copies it lacked. |
| `POST /additions` | Up to fifty games at once, `{ "games": [ … ] }`, each as `POST /entries` takes it. One result a game; one that fails leaves the rest. Each added game's `undo` is what `POST /additions/undo` takes back. |
| `GET /entries/{id}` | A game as its account keeps it: private notes, the ids of its copies and versions |
| `PATCH /entries/{id}` | Changes what is one's own about it, in one step: `status`, `rating`, `completedOn`, `notes`, `notesPublic`, `tags` (replaces them all), `hoursPlayed`, `mainVersion`. Absent is unchanged; `null` clears. |
| `DELETE /entries/{id}` | Removes a game and everything added with it. The answer's `undo` is kept a day. |
| `POST /removed/{undo}` | Puts a removed game back exactly as it was |
| `POST /entries/{id}/copies`, `PATCH` and `DELETE /entries/{id}/copies/{copy}` | A copy: add one (`{ "platform", "format" }`), switch it between physical and digital, remove it |
| `PUT /shelves/{slug}`, `DELETE /shelves/{slug}` | Saves or removes a smart shelf |

**Syncing from a store or console** ([ADR 003](adr/003-platform-sync.md)), on one's own shelf,
uncached. `{source}` is `steam` or `nintendo`; PlayStation and Xbox come later and answer
`invalid` until then. Steam lists what is owned, so a matched game goes on the shelf at once;
Nintendo lists what was played, so each game waits for an answer saying how it is owned.

| Method and path | Does |
| --- | --- |
| `GET /me/platforms` | Every source, whether it is built, and one's link to each: the account there, when it was synced, what went wrong (`private`, `unreachable`, `unset`, `signed-out`: Nintendo ended Shelf's session, sign in again), and how many of its games are on the shelf, need an answer, were left out, or are no longer listed |
| `GET /me/platforms/{source}/connect?locale=` | Off to the source's own sign-in. A browser link, not a call: the source's page must be seen. Steam's comes back to `…/return` and then the account page. Nintendo's never comes back: its "Select this account" button links to an address only Nintendo's app opens, which is pasted into `…/link`. |
| `POST /me/platforms/nintendo/link` | `{ "link" }`, the link copied from Nintendo's button, in the browser that started the sign-in. Answers `{ "outcome" }`: `linked`, `not-the-link`, `another-sign-in`, `code-refused` (each link works once, for a few minutes), `unset` or `unreachable`. Linking keeps Nintendo's session sealed; it is never sent back. |
| `POST /me/platforms/{source}/sync` | One step: `{ "read": true }` asks the source for its list first. At most twenty games go on the shelf a step; ask again while `remaining` is above 0. Answers the link, `added` and the library's `version`. |
| `GET /me/platforms/{source}/items?list=` | The games it listed that need an answer (`needs-you`), were left out (`hidden`) or are no longer listed (`not-seen`), with their hours there and what the store says each is (`kind`: `game`, `demo`, `software`, `media`, `part`, `unknown`, or null until asked). A demo, software or media is left out by itself. A game Nintendo saw played that Shelf matched comes with its `match`: the IGDB game, title, year and cover, waiting to be confirmed. |
| `POST /me/platforms/{source}/items/{id}` | An answer, carried out at once: `{ "kind": "pick", "igdbId" }` puts that game on the shelf (for Nintendo, with `"format": "physical"` or `"digital"`; without, the pick becomes the match, waiting); `{ "kind": "confirm", "format" }` takes the match as the game, owned that way; `{ "kind": "dismiss", "as": "not_a_game" }` or `"not_mine"`; `{ "kind": "again" }` undoes either, and puts back a game taken off the shelf |
| `POST /me/platforms/{source}/answers` | One answer for many matches: `{ "ids", "answer": { "kind": "confirm", "format" } }`, up to 200 items. Items with no match are left as they are. Answers a step, as `…/sync` does; ask for more while `remaining` is above 0. |
| `PATCH /me/platforms/{source}` | `{ "daily": false }`: no sync once a day |
| `DELETE /me/platforms/{source}` | Disconnects: forgets what it listed and the answers. Its games stay on the shelf, with their hours. |

`GET /entries/{id}` gives each copy the hours a sync reports on it, by source (`synced`). A
game's `hoursPlayed` in the library is the larger of what was typed and what its sources
report together.

`{id}` is a game's address (its slug) or its entry id. A refusal is an error as above:
`not-signed-in` (401), `invalid` (400), `not-found` (404), `conflict` (409), `too-many` (429,
past an account's hourly share of IGDB: 600 searches, 100 matched lists, 300 games added),
`not-kept` (503, on a deployment with no database), `igdb` (502).

## MCP, for AI assistants

Two endpoints, on the Model Context Protocol's 2026-07-28 revision and the 2025 one:

| Endpoint | Sign-in | Tools |
| --- | --- | --- |
| `/api/mcp` | None | `search_library` (a filter in the filter language, sorted and grouped, a page at a time), `get_game`, `list_filter_values`, `list_shelves`, each taking `shelf`: a public shelf's handle |
| `/api/mcp/owner` | An account, through OAuth | The four above on that account's own shelf, public or private, and `search_igdb`, `add_game`, `update_entry`, `set_status` |

The tools answer with the same shapes as the routes above. To use one's own endpoint, add it
to an assistant: the assistant is answered 401 and told where to sign in (RFC 9728), the
account signs in with its email address or handle and password, says yes on the consent page,
and the assistant is given a token for that endpoint. Assistants are known by their Client ID
Metadata Document, so none needs registering first.

## `GET /openapi.json`

The OpenAPI 3.1 description of everything above, with a schema for each body and answer.
The writes are marked with the `session` cookie as their security scheme.

## `/llms.txt`

The site, the API, both MCP endpoints and the filter language, in plain text for
assistants, at the site's root rather than under `/api/v1`. Built ahead, in English.
