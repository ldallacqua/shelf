# Shelf: the API

Shelf's library can be read by other programs: a script, a spreadsheet, another site, an AI
assistant. Everything here is public and read-only, needs no key, and answers in JSON. The
design is in [the architecture, section 16](architecture.md#16-api-mcp-and-machine-readable-pages);
the filter language is [spec section 5.3](spec.md#53-the-filter-language).

The machine-readable description is the OpenAPI 3.1 document at
[`/api/v1/openapi.json`](#get-openapijson). It is generated from the same Zod schemas every
answer is checked against before it is sent, so it cannot drift from what the API does.

## The basics

| | |
| --- | --- |
| Address | `https://{the site}/api/v1` |
| Sign-in | None. Writing arrives with sign-in, at build step 7. |
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
  [`/library/facets`](#get-libraryfacets) lists.
- `rating` is out of 10; `hours` and `length` (time to beat) are in hours; `igdb` is IGDB's
  rating out of 100; `copies` is how many platforms a game is owned on.
- `owned:` takes a platform (`owned:switch`) or a family (`owned:playstation`). In one group,
  `owned:` and `format:` describe the same copy: `owned:switch format:physical` is a game
  owned on a Switch cartridge.
- Keys are English in both languages, so a filter works for everyone.
- A part that cannot be understood is left out, and the answer says which in `problems`.
  The rest of the filter still applies.

## `GET /library`

The games a filter matches, in order, a page at a time, and the shelves they make.

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
GET /api/v1/library?q=genre:rpg&sort=-rating&group=none&limit=1
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

## `GET /library/facets`

Every value of every list filter, with how many games it would match given the rest of `q`,
and the range each number and date key spans.

| Parameter | | Default |
| --- | --- | --- |
| `q` | A filter | Every game |

```text
GET /api/v1/library/facets?q=genre:rpg
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
  [keywords file](#get-librarykeywordsversion).
- `name` is the name IGDB or the library gives a value, in English. Fixed values (statuses,
  formats, kinds) are named by the value itself; the site translates them, the API does not.
- A key with no values in the library has `null` for its range.

## `GET /games/{slug}`

One game, with everything its page shows a visitor: what is in `GET /library` for it, and
IGDB's summary and storyline, its credits, its first release on each platform, its times to
beat, its key art and screenshots, and my notes when I have made them public. The slug is the
game's address on the site: `/en/game/{slug}`.

```text
GET /api/v1/games/advance-wars
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

(Shortened: every field of a game in `GET /library` is there too.)

- `developers`, `publishers`, `franchises`, `series`, `modes` and `perspectives` give each
  value as its filter key takes it (`developer:intelligent-systems`) and by its name.
- `releases` are the first release on each platform, oldest first, across every version
  folded into the game: a port released years later gives its platform its own date. `date`
  is `YYYY` when IGDB knows only the year.
- `timesToBeat` is in hours: `hastily` (the main story), `normally` (with the extras) and
  `completely`. `timeToBeat` is the normal one, as `GET /library` gives it.
- `notes` is `null` unless I made my notes public for this game. Private notes are never sent.
- A slug that is no game's answers 404, as `GET /shelves/{slug}` does. A version folded into
  another game has no address of its own.

## `GET /shelves`

The smart shelves: named filters, each with a sort and a grouping, at an address of their own
on the site.

```json
{
  "shelves": [
    {
      "slug": "short-ones",
      "name": "Short ones",
      "query": "status:backlog length:<10",
      "sort": "length",
      "group": "none",
      "path": "/shelves/short-ones"
    }
  ]
}
```

A shelf's games are `GET /library` with its `query`, `sort` and `group`. Its page is `path`
after the language: `/en/shelves/short-ones`.

## `GET /shelves/{slug}`

One shelf, as above. A shelf that is not there answers 404:

```json
{ "error": { "code": "not-found", "message": "There is no shelf called not-a-shelf" } }
```

## `GET /library/snapshot/{version}`

The whole library in one compact file, as the site's own pages use it to filter in the
browser. It is made for Shelf and its layout may change between versions of the site
(`format` says which); use `/library` for anything else. An address with an old version is
sent on to the current one (307).

## `GET /library/keywords/{version}`

Every keyword the library's games have, and which games have each, by slug. The site fetches
it the first time a keyword filter is used. Like the snapshot, it is kept for a year, moves
when the library does, and an old version is sent on to the current one.

## `GET /openapi.json`

The OpenAPI 3.1 description of everything above, with a schema for each answer (`Library`,
`Facets`, `SmartShelves`, `SmartShelf`, `Game`, `GamePage`, `ShelfOutline`, `Error`).

## Still to come

| | Build step |
| --- | --- |
| Writing: adding and changing games, saving shelves | 7, with sign-in |
| The MCP endpoints, for AI assistants | 7 |
