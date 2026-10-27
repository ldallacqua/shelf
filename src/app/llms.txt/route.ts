import { siteUrl } from '@/server/site-url'

/**
 * `/llms.txt`: what Shelf is, for AI tools (architecture, section 16): the
 * site, the API, both MCP endpoints and the filter language, in the
 * format llmstxt.org proposes. It describes the site, not anyone's shelf,
 * so it is built ahead whole. It is for programs, in English, as the
 * filter language's keys are.
 */
export function GET() {
  const site = siteUrl()
  const text = `# Shelf

> Shelf keeps every game a person owns on one lit shelf: physical and digital, every console. Each account has one shelf at ${site}/en/u/{handle}, public or private. Game information comes from IGDB.com.

Shelves are read by their handle. A public shelf can be read by anyone, with no key; a private one answers 404, as a shelf no account has does. Writing acts on one's own shelf and needs that account's sign-in.

## Pages

- [Landing page](${site}/en): what Shelf is, with an example shelf
- [Create a shelf](${site}/en/sign-up)
- ${site}/en/u/{handle}: a shelf. The query string holds its filter (q), sort, grouping (group) and view (shelf, wall or list)
- ${site}/en/u/{handle}/game/{slug}: a game on a shelf
- ${site}/en/u/{handle}/trophies: the shelf's trophy wall: every game finished, by the year it was finished, with stats
- ${site}/en/account: one's account, where a Steam library is linked through Steam's own sign-in, and a Nintendo play history through Nintendo's, each synced once a day
- [Privacy](${site}/en/privacy): what Shelf keeps, and how to remove it
- Every page is also in Brazilian Portuguese, under /pt-BR instead of /en

## API

- [OpenAPI 3.1 description](${site}/api/v1/openapi.json): every route, with a schema for each body and answer
- GET ${site}/api/v1/u/{handle}/library?q=&sort=&group=: a public shelf's games, filtered, sorted and grouped
- GET ${site}/api/v1/u/{handle}/facets: the values each filter takes on that shelf, with counts
- GET ${site}/api/v1/u/{handle}/games/{slug}: one game, with everything its page shows
- GET ${site}/api/v1/u/{handle}/shelves: the shelf's saved smart shelves

## MCP, for AI assistants

- ${site}/api/mcp: no sign-in. Tools search_library, get_game, list_filter_values and list_shelves, each taking shelf, a public shelf's handle
- ${site}/api/mcp/owner: an account, through OAuth. The same tools on that account's own shelf, public or private, and search_igdb, add_game, update_entry and set_status

## The filter language

One line describes any filter: what a shelf's address stores (q), what a smart shelf stores, and what the API and MCP tools take. Keys are English in every language.

- zelda, "breath of the wild": in the title; quotes make a phrase
- genre:rpg: genre is RPG. genre:rpg,strategy: RPG or strategy. genre:rpg genre:strategy: both
- -theme:horror: not horror
- status:playing OR status:backlog: either. Brackets group: (owned:ps5 format:physical) OR rating:>=9
- year:2015..2020, rating:>=8 (out of 10), hours:<10 (played), length:<10 (hours to beat): ranges and comparisons
- completed:2025, added:2025-06: a year, a month or a day stands for all of it
- The owner's own keys: status, owned, wanted (platforms a wishlist game is wanted on), format, copies, rating, hours, completed, added, tag, has, is
- IGDB's keys: genre, theme, age (an age rating, board first: age:esrb-ao, age:pegi-18), keyword, mode, perspective, kind, platform, franchise, series, developer, publisher, year, igdb, length
- Values are lower case with hyphens: developer:eidos-montreal. A part that cannot be understood is left out, and the answer says which.
`
  return new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
