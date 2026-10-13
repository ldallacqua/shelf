# domain

Rules and types: what an entry is, what a filter means, how a shelf is sorted and grouped.

Nothing here may import React, Next.js, the database or anything from `server/`, `features/`,
`ui/` or `app/`. Zod is the only dependency. That keeps the rules usable from the browser, the
server, the API and the MCP server alike, and makes them fast to test.

It is empty until build step 2.
