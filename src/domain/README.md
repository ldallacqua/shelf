# domain

Rules and types: what an entry is, how IGDB's records become ours, which games belong
together, what the library file holds. Later steps add what a filter means and how a shelf is
sorted and grouped.

Nothing here may import React, Next.js, the database or anything from `server/`, `features/`,
`ui/` or `app/`. Zod is the only dependency, and only the modules that check outside data use
it. That keeps the rules usable from the browser, the server, the API and the MCP server
alike, and makes them fast to test.

| Folder | Holds |
| --- | --- |
| `library/` | Statuses and formats; the library as views read it; the library file; the grouping rule from ADR 001 |
| `igdb/` | The shape of IGDB's answers (Zod); turning a record into `GameData`; folding search results; image addresses |
| `platforms/` | Family, case shape, plastic color and filter key for each platform |
| `color/` | Three colors from a cover's pixels, and the light a game gives its shelf |

`library/snapshot.ts` and `library/library.ts` are read by the browser and import no Zod.
