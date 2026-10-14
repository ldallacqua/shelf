# server

Code that runs only on the server: the database, the IGDB client, the services that every
read goes through, and (from build step 7) sign-in and the services for writes.

It may import `domain/` and nothing else of ours. Each module starts with
`import 'server-only'`, so pulling one into the browser bundle is a build error.

| Folder | Holds |
| --- | --- |
| `env.ts` | Settings, checked before use. Decides which database to open. |
| `db/` | The Drizzle schema, the client, and applying migrations |
| `library/` | `store.ts`: every write, each in one transaction that raises the library's version. `read.ts`: the whole library in a few queries. |
| `services/` | What routes and pages call. Reads are cached and tagged `library`. |
| `igdb/` | The only code that knows IGDB's address: token, rate limit, checked answers, the questions Shelf asks, and reading a cover's colors |
| `seed/` | The three data sets, built from `fixtures/` |
| `mocks/` | Test doubles for IGDB and Twitch, started only with `SHELF_MOCKS=1` and never on Vercel |

**Nothing a visitor can reach calls IGDB or writes.** Until sign-in exists (step 7) there is
no route for either: the write functions and the IGDB client are used by scripts and tests.
