# Handoff: 23 October 2026

Work moved from the Mac mini to another computer partway through the review pass after
step 3. This note is what the next session needs and cannot get from the code. Read
`AGENTS.md` first, then this.

## Now: platform sync, Steam first

- **The owner asked for sync after step 9** (23 Oct 2026): "start with steam. deploy, then
  let's do nintendo", built so that every platform fits, Steam and Nintendo first "since they
  are the platforms I use". Step 10, the final review, waits until sync is done.
- **Steam is built** ([ADR 003](adr/003-platform-sync.md), "Built: Steam"; spec 4.4): linked on
  the account page through Steam's own sign-in, a first sync that puts every matched game on
  the shelf as a PC digital copy with Steam's hours, a list of what needs an answer, Sync now
  and a daily job (`/api/cron/sync`, 07:00 UTC), a privacy page Steam's terms ask for, and the
  landing page's part 5 and a question in its FAQ.
- **It needs `STEAM_API_KEY` in Vercel** ([setup E](setup.md#e-steam-sync)), from the owner.
  Without it, production offers Steam and says it is not set up. The daily sync needs
  `CRON_SECRET` too, still to be set ([setup D](setup.md#d-daily-refresh)).
- **Linking on production is the owner's to try**, with their own Steam account: an assistant
  never signs in to Steam. Locally, with the test doubles on, "Sign in through Steam" comes
  straight back with a made-up account (`MOCK_STEAM`), whose games are
  `fixtures/steam/owned-games.json`.
- **Valve asks for its own "Sign in through Steam" button image** where its sign-in is used.
  The button is drawn by `src/ui` for now, in words, until the owner says the image may be
  downloaded into `public/`.
- **Nintendo is next.** ADR 003 found no way to read a Nintendo library (14 Oct 2026) and
  planned an import of pasted titles, every match confirmed. Look again at what exists now
  before planning it: the platform's own apps have grown play history since.
- **Checked:** `pnpm verify --skip-browser` (see the pull request); the whole flow by hand in
  a production build with the test doubles (link, first sync of 27 listed games: 25 on the
  shelf, 2 to answer; Find it, Not a game, the editor's Steam hours), screenshots in both
  themes, both languages and a phone. The browser pane in the app pauses animation frames
  and scroll-driven reveals while hidden: pictures were taken with Chromium from a script.

## Step 9, the trophy wall and the passes

- **Step 8 is merged and deployed** ([#19](https://github.com/ldallacqua/shelf/pull/19),
  22 Oct 2026, the owner's approval: "looks good, go ahead"). Then the owner asked for step 9.
- **Step 9 starts with the trophy wall** (spec 3.9), which section 22 of the architecture
  had left to no step. Then the passes: the daily refresh (it needs `CRON_SECRET`, [setup
  D](setup.md#d-daily-refresh), from the owner), security headers, phone and tablet polish
  with the gestures left from step 3, the accessibility audit, and speed work. Step 10 is the
  final review, ⏸.
- **Done so far at step 9:** the trophy wall ([#20](https://github.com/ldallacqua/shelf/pull/20));
  the daily refresh and the security headers ([#21](https://github.com/ldallacqua/shelf/pull/21));
  the phone's gestures (a game's sheet at two heights, scrubbing a compact ledge), folding a
  shelf away wider than a phone, and the 3D wall on a tablet held upright. From the
  accessibility audit, against spec 12 and 13: a filter or sort change now says what it left
  ("42 games, sorted by My rating, descending"), and a tablet held upright opens a game as a
  sheet from the bottom, at the phone's two heights ([#22](https://github.com/ldallacqua/shelf/pull/22)).
  Speed: the stylesheet is written into each page, a library's page names its first covers
  in its head, and Martian Mono's stand-in no longer moves the shelf when the font arrives
  (architecture, section 25). Step 9 is done; step 10, the final review, is next, ⏸.
- **Lighthouse on this computer:** its benchmark (about 5,100: a Ryzen 9800X3D is among the
  fastest single cores there are) asks for a slowdown of 19.5 times, from the calculator's
  last step carried past where it was read, and every page fails there. At 8 times, the
  measure used for step 9's choices: landing page 92, library 84, wall 87, game 93, every
  largest paint under 2.5 s and no layout shift. What holds the library and the wall under
  90 is blocked time, 500 to 600 ms: React drawing the shelves as the page starts and again
  when the library file arrives. That is the next speed work, with a profile.
- **No browser tests until the MVP is done** (the owner, 23 Oct 2026): merges run
  `pnpm verify --skip-browser`. The last full run passed on the commit that wrote the
  stylesheet into each page (2,571 tests). Since then the cover preloads, the font stand-in
  and the workers setting (`playwright.config.ts`: half the threads, the tests that write
  three at a time, untried) have not met the browser tests.
- **Platform sync ([ADR 003](adr/003-platform-sync.md))** came after step 9, at the owner's
  asking: see the top of this note.
- **The seed's finish days changed at step 9** (architecture, section 25): run `pnpm seed`
  again after pulling, or the browser tests serve the old days.

- **Accounts are merged and deployed** ([#17](https://github.com/ldallacqua/shelf/pull/17),
  22 Oct 2026): `/en/u/lucas` and the old addresses' redirects checked on production. The
  owner went without a Turso backup: the library there held one game. The first account was
  named by its email address, which its shelf's title showed to everyone; settling the
  accounts now gives such an account its handle as its name
  ([#18](https://github.com/ldallacqua/shelf/pull/18)). Its merge started no production
  build, so it was deployed through Vercel's API, as below; production's shelf now reads
  "lucas's shelf".
- **The landing page is a product page** (spec 15), built from an example shelf of 61 sample
  games (`pnpm landing:demo` writes `src/features/landing/demo-library.json`; run it again
  after the fixtures change). The design foundations moved to `/foundations`, unlisted. The
  site is open to search engines from this step: `robots.txt`, `sitemap.xml` (public shelves
  and their games only) and `llms.txt` are new, and the public option at sign-up says search
  engines can list a public shelf.
- **The landing grows with the product** (the owner's rule, 22 Oct 2026, in `AGENTS.md`):
  every later step that adds something a visitor would choose Shelf for adds its part there.
  The trophy wall turned part 6 into a glimpse of the wall.
- **Anyone can sign up for a shelf of their own** ([ADR 004](adr/004-one-library-per-account.md),
  21 Oct 2026, the owner's request and choices: anyone signs up; each picks public or private,
  Public picked for them; no email yet; their own shelf is `/u/lucas`). Every row that is
  someone's carries its account's id; the IGDB cache is shared; a library's files are under a
  random key; a private shelf is drawn only in its own browser. The plan is in two pull
  requests: **A, accounts**, then **B, the landing page** (step 8, ⏸ after it for review).
- **A local database seeded before accounts has no sample account.** Run `pnpm seed` again
  after pulling; the browser tests serve a copy of it.
- **Going to production:** before the accounts deploy, the owner takes a Turso backup (the
  command is in the pull request). The deploy's migration gives every existing row to the
  oldest account, with the handle `lucas`, and the old addresses move to `/u/lucas/…`. Check
  `/en/u/lucas` and a redirect after. **Creating accounts on production is the owner's to
  try:** an assistant may not make accounts there. `OWNER_EMAIL` and `OWNER_PASSWORD` are no
  longer read and can be deleted from Vercel afterwards.
- **A forgotten password** has no email reset: `pnpm account:password <handle>`, with the
  database's settings in the environment, prints a new one once.
- **Step 7 is merged** ([#11](https://github.com/ldallacqua/shelf/pull/11)).
- **Sign-in changed from GitHub to one account with an email address and password** (21 Oct
  2026), at the owner's request after reading what GitHub sign-in asked of them; then to
  accounts for anyone, above.
- **The owner pasted part C's five settings** in [the setup checklist](setup.md) (Production
  only, 21 Oct 2026). B is half done: production's database is in São Paulo, for Production
  only, and the functions moved there with it; previews have no database yet. Never paste or
  print the values, and never enter them for the owner; give them the `vercel env add`
  commands instead. The owner allows deploying to production (21 Oct 2026).
- **Production signs in and adds games.** The owner signed in and searched IGDB there (21 Oct
  2026), so the session settings and the two Twitch ones work. A GitHub incident delayed
  webhooks that day, so that deployment was started through Vercel's API (`vercel api
  /v13/deployments` with a `gitSource` for `main`), not by the merge.
- **The first production build with those settings failed:** the build ran the two discovery
  documents ahead, and Turso's queries were cut off (architecture, section 25). Fixed. Verify
  cannot catch this kind of failure: its build has no sign-in settings, and its SQLite file
  answers without the network. A stand-in for Turso over HTTP reproduced it. **Checked:**
  `pnpm verify --skip-linux` passed the checks, the build, the JavaScript budgets (unchanged)
  and 1,842 browser tests in all nine projects, none failed; Lighthouse ran hot (19.5 times)
  and, on its own at 7.2 times, scored home 98, library 90, wall 92, game page 97. The
  Storybook build passes. Playwright's browsers had gone from this computer and were
  downloaded again.
- **The form's controls were rebuilt** at the owner's review (21 Oct 2026): "an input like
  that is too simple", and the selects looked like the browser's own. Every form control is
  now drawn by `src/ui` (architecture, section 25): a select, my rating as a slider, a
  calendar, a tag field with the tags in use offered, chips with a tick, checkboxes and
  switches. Owner-only code, so visitors load none of it, but sharing Radix's positioning code
  split the pages' files: the library's budget went from 262 to 265 KB, the owner's choice
  over writing that code a second time. **Checked:** `pnpm verify --skip-linux` passed the
  checks (799 unit and component tests), the build, the JavaScript budgets (library 264.1 of
  265 KB, home 203.2 of 205, game page 206.3 of 208, trophies 196.5 of 198) and 1,905
  browser tests in all nine projects, none failed. Lighthouse ran hot (18.8 times). On its
  own at 7.2 times the machine read slower than in the morning, so it was measured side by
  side with the code before: home 93 to 95 both, library 82 to 84 against 83 to 84, wall 85
  to 86 against 87 to 89, game page 93 to 94 against 92 to 95. The change costs nothing
  measurable there; the library and wall misses are the machine's that hour. The Storybook
  build passes. A 3D test that read the 2D shelf before it had drawn failed 1 run in 8 in
  Firefox; it now waits (24 of 24).
- **Tests run once, before merging, not at each commit or push** (the owner, 21 Oct 2026: the
  full run is long and should not hold work up). `pnpm verify` passes on a branch's last
  commit before its pull request merges; while working, run the tests for what changes.
- **A game opened over the shelf keeps its place** (21 Oct 2026, at the owner's review):
  rating no longer sends the key art and words back to ghosts, and for the owner "Mine" is
  the editor's skeleton until the editor is in, so nothing below it jumps. The skeleton
  mirrors `mine-editor.tsx`: change one, change the other.
- **Storybook is deployed** from `main` to https://shelf-storybook.vercel.app, a second Vercel
  project on the same repository (`deploy/storybook/`).
- **This folder is linked to the Vercel project** (`.vercel/`, ignored). `vercel link` also
  wrote a `VERCEL_OIDC_TOKEN` into `.env.local` and added `.env*` to `.gitignore`; both were
  taken out again. Run `vercel env pull` and `vercel link` with care for the same reason.
- **Next.js is 16.4.1,** for critical security fixes in 16.4.0. 16.4.2 is out.
- **The owner allows merging to `main` without asking** while the project is a proof of
  concept (15 Oct 2026). Still stop at every ⏸ (after step 8, and the final review).
- **Next: step 8, the landing page** (⏸ after it): a product page that sells "create your
  shelf", with a live demo shelf, then platform sync ([ADR 003](adr/003-platform-sync.md)).

## Step 7: sign-in, adding, editing, the write API, MCP

- **Built:** sign-in for one account (Better Auth; GitHub at first, an email address and
  password since), `requireOwner()` on every write; the Add sheet (one game: search as you type,
  the keyboard alone, ADR 001's proposal, Undo; and "Paste a list": up to 200 lines matched
  ten at a time with progress and Cancel, a review with a menu of alternatives per line, the
  same choice on every row, Add N games, Undo); "Mine" edited in place on a game's page and
  in its panel (status, rating, completion date, hours, copies, tags, notes and whether they
  are public, the main version, removal with Undo); the write API (`docs/api.md`); both MCP
  endpoints, the owner's with OAuth and a consent page. What changed from the plan, and why,
  is in architecture section 25 (eleven step 7 rows).
- **Found and fixed on the way:** an edit in a game's panel replaced the shelf with the game's
  page (a server action redraws the current address; editing moved to the API); a game page
  built ahead answered 404 to a browser's move once a write expired its tag (pages are now
  built on first visit); the library file could claim a version without its newest game when
  a write landed between its seven queries (one batch now); Firefox reloading during the
  page's own refresh after a save; WebKit's page crashing on Back from a game opened from the
  wall or the list. That one was the cover's flight home, and closing no longer has one. It
  crashed 5 in 64 on this branch and 0 in 64 on `main` in the same test (10 in 64 under load),
  which looked like a step 7 regression. Taking parts of step 7 out did not end it: the Next.js upgrade
  and building game pages on first visit not at all (5 in 64 either way), and the header and
  footer additions only to 2 in 64, which is within noise. Removing the flight ended it.
  Also, since step 5: the library's skeleton ran 184 pixels off a tablet's screen, because
  its toolbar of ghosts did not wrap where the real one does. The layout test checked the
  skeleton at 320 pixels only, and it now checks every project's width too.
- **Checked on the last code commit:** `pnpm verify --skip-linux` passed the checks (767 unit
  and component tests), the build (57 pages), the JavaScript budgets (library 261.3 of 262
  KB, game page 204.5 of 208, home 201.4 of 205) and 1,832 browser tests in all nine
  projects, none failed. Its Lighthouse step ran hot (19.4 times; the home page blocked
  2,009 ms), so it was run on its own after. **At 7.2 times:** home 96 (blocked 183 ms), game
  page 96 (largest paint 2.07 s), wall 88, library 85 (largest paint 2.48 s, blocked 423 ms).
  The wall and library near misses are steps 5 and 6's. The library blocked 423 ms against
  step 6's 385, and the home page 183 against 162, so this machine read about a tenth slower
  today. In the hot run the game page shifted 0.089 (the limit is 0.1); at 7.2 times, 0. The
  library has 0.7 KB of its budget left. The Storybook build passes.
- **Not checked:** signing in on production and a real assistant (both need part C); the
  Linux pass (no Docker); new reference screenshots for the Add sheet and the editor.
- **A cache race, found 21 Oct 2026, not fixed yet.** In full browser runs, a few tests that
  write then read (`editing.writes`, `mcp.writes`) now and then read the library as it was
  before the write: 5 of about 45 in one run, 2 in another; all pass on their own. Next.js
  16.4 shares in-flight work between requests: a page render (the response cache's batchers)
  and a `use cache` fill (cross-request joins). A request that comes after a write can join one
  that began before it. A shared page render is then stored as new, so a game page can stay
  stale until the next write. `getGamePage` calling the cached `getLibrary` inside it widens
  the window. Seen with `NEXT_PRIVATE_DEBUG_CACHE=1`. Reuse no `.next` folder across runs:
  pages regenerated during one run are served by the next server, whatever its database says.
- **Left open:** on a preview, an assistant must use the deployment's own `*.vercel.app`
  address, not the branch's (tokens are for one address). Better Auth is pinned at 1.7.7;
  1.7.10 came out on 15 Oct 2026.

## Step 6 is merged

- [#9](https://github.com/ldallacqua/shelf/pull/9), and after the owner's first look
  ([#10](https://github.com/ldallacqua/shelf/pull/10)): the panel no longer slides in a second
  time as the cover lands, and it has a button to the game's full page.
- **Step 5 is merged** ([#8](https://github.com/ldallacqua/shelf/pull/8)), with the owner's
  first-review fixes: ghosts while the library loads, and the phone's shelf kept to the screen.

## Step 6: the game page

- **Built:** `src/features/game-detail`. A game's own page at `/{language}/game/{slug}`, built
  with the site for every game; the same page as the library's panel over the shelf, at the
  game's address, closed by Back; the cover growing from the box (2D shelf, wall, list) into
  the panel, a crossfade under reduced motion, the pulled box itself in 3D; the screenshot
  viewer; schema.org `VideoGame` data; `GET /api/v1/games/{slug}`. What changed from the
  plan, and why, is in architecture section 25 (nine step 6 rows).
- **Left for step 7, with sign-in:** the editions and ports folded into a game ("Versions",
  spec 7.1), my private notes for me, and editing (spec 7.3). The page shows a visitor's view
  now; a private note never leaves the server.
- **Found and fixed on the way:** WebKit's page crashed when Back came while the cover was
  still flying (from the wall or the list); a move in history now ends the flight first
  (`morph.ts`). The step 5 test "while the library arrives" was flaky on WebKit phones (3 runs
  in 8, on `main` too): it clicked a shelf tab, and a click is no touch, so the shelf beside
  stayed waiting for the first touch. It taps now; 16 of 16 passed.
- **Checked on the last code commit:** `pnpm verify --skip-linux` passed the checks (703 unit
  and component tests), the build (499 pages, 460 of them games), the JavaScript budgets
  (library 260.1 of 262 KB, the new game page 201.6 of 208) and 1,577 browser tests in all
  nine projects, none failed. Its Lighthouse step ran hot, as at step 5 (the benchmark gave
  19.7 times; the home page blocked 1,653 ms), so it was run on its own after: **at 7.2 times**
  the home page blocked 162 ms and scored 97, the game page 95 (largest paint 2.09 s), the
  wall 88 and the library 86. The library's near miss is step 5's: measured side by side with
  `main`, three runs each, twice, both scored 86 to 87 and blocked 370 to 391 ms. This machine
  read faster today than on 14 October (at 5.5 times the home page blocked only 94 ms), so
  calibrate again each time. The Storybook build passes.
- **Not checked:** the Linux pass (no Docker). The reference screenshots now lack the game
  page, and the "game picked up" ones show the old sheet; make them with
  `pnpm verify --update-screenshots` once Docker is here.

## Step 5: filters, sorting, smart shelves, the API

- **Built:** the filter language (`src/domain/query/`, tests first), the search field, the
  status row, chips, the filter panel, eleven sorts and sortable list headings, keyboard
  shortcuts that can be turned off, six starter smart shelves at `/shelves/{slug}`, saving
  a shelf as the owner, and the read API with its OpenAPI document (`docs/api.md`). What
  changed from the plan, and why, is in architecture section 25.
- **The owner is a test cookie** until sign-in at step 7: `shelf-test-owner=1`, read only
  when the server runs with `SHELF_MOCKS=1`. On a preview nobody can save a shelf yet.
- **Found and fixed on the way:** on a phone the shelf grew as tall as its games and the
  page, footer and all, scrolled up through it (since step 4: the 3D stage's two wrappers
  broke the chain of heights that keeps one shelf to the screen); the phone list's title
  column was squeezed to one letter (since step 3: spacer rows spanned nine columns, five of
  them hidden); Back did not
  reach the search field while it had focus; a shelf saved after the build said it was
  missing on its first full load (Next.js serves an unbuilt address from the route's frame
  and the data cached with it, so a shelf is now read by its slug); the status row's counts
  and the panel's empty values fell short of contrast over the lit 3D wall.
- **Left open for the owner:** starter shelf names are data, so "Short ones" stays English
  on the Portuguese site, like tags; the search field sits in the page on the library rather
  than in the header, and the sort comes before the grouping (both in section 25).
- **Checked on the last code commit:** `pnpm verify --skip-linux` passed the checks (671
  unit and component tests), the build, the JavaScript budgets (library 256.2 of 262 KB:
  the budget was raised from 240, with the reason in `scripts/lib/budgets.ts` and section
  25) and 1,306 browser tests in all nine projects, none failed. **Lighthouse is a near miss
  on the library**, as at steps 3 and 4. At 7.7 times the home page blocked 232 ms (too
  harsh that day). At 7.1 times, two runs: home 96 and 97 (blocked 197 and 156 ms), library
  90 and then 87 with its largest paint 2.54 s (limit 2.5), wall 90 and 91. The library
  blocks about 340 to 370 ms, against about 300 after step 3's speed pass: the filters add
  work on arrival (the index, the status counts). The Storybook build passes; it was run on
  its own, since verify stops at Lighthouse.
- **Checked after the review fixes** (commit 084792b): `pnpm verify --skip-linux` passed the
  checks (677 unit and component tests), the build, the budgets (library 257.7 of 262 KB)
  and 1,336 browser tests in all nine projects, none failed. Its Lighthouse step came
  straight after 15 minutes of browser tests and was far too harsh (home blocked 386 ms at
  7.1 times). **Calibrate on a cool machine:** at 5.5 times the home page blocked 153 ms
  and scored 97; the library scored 88 (largest paint 2.48 s, blocked 330 ms) and the wall
  89 (2.45 s, 306 ms), a near miss on the score as before. Measured side by side at 5.5
  times, five runs each, the review fixes cost nothing: library 87 before and 88 after, wall
  89 and 88. The Storybook build passes.
- **Not checked:** the Linux pass (no Docker). The reference screenshots of every library
  page are now out of date (the search, status row and toolbar are new) and there are none
  for the shelf page; make them with `pnpm verify --update-screenshots` once Docker is here.

## Step 4: the 3D shelf, as merged

- **Built:** the 3D shelf in plain three.js (owner's choice over R3F, measured: architecture
  section 2, row 9), the 2D/3D pair and the `D` key, defaults per device, the switch with its
  anchor, fallbacks (no WebGL 2, lost context, slow frames), the lists beside the canvas,
  `pnpm perf:3d`, the 3D bundle budget in `pnpm perf:js`. What changed from the plan, and
  why, is in architecture section 25.
- **The owner's first look (14 October) found two things, both fixed:** covers came in
  blurred and sharpened seconds later, and 3D was unusable on a phone. Covers are now the
  2D shelf's own file, redrawn at the size each box appears, so they are sharp on the first
  frame and come from the cache. A phone, held either way, is never offered 3D (owner's
  call: "if not possible to make a good experience in mobile just not show this view").
  Tablets keep 3D as a choice; in portrait the wall was small and sat low with empty space
  above. Fixed at step 9: the stage is never taller than the wall's 3:2.
- **Checked on the last code commit:** `pnpm verify --skip-linux` passed every step: checks
  (536 unit and component tests), build, JavaScript budgets (library 233.4 of 240 KB, 3D
  147 of 300), 928 browser tests in all nine projects with 0 failed, Lighthouse, Storybook.
  The home page's keyboard test was flaky in WebKit (an arrow pressed before the picker had
  hydrated) and now waits for it. perf:3d on this machine: 60 fps, 13 draw calls, 64 MB.
- **Lighthouse needs a fresh calibration each time on Windows.** At 5.5 times the home page
  blocked only 85 ms this time (the benchmark read 5,140, against 4,470 at step 3), so the
  scores were kinder than the Mac's. Where it blocks about 180 ms, between 7.5 times (160 ms)
  and 8 times (226 ms), the library scores 87 to 91 and the wall 89 to 91: the same near
  miss as step 3. Step 4 did not make the 2D page slower.
- **Not checked:** the Linux pass (no Docker), so there are no 3D reference screenshots; the
  frame rate on a mid-range laptop (this one has an RTX 4090), at step 9.
- **Raised by the owner at the review:** syncing owned games from Steam, PlayStation, Xbox
  and Nintendo, each matched to the right IGDB record. Written up as ADR 003. The reference
  app (`myspot-gg/platform` on GitHub, read only) synced Steam and PlayStation through IGDB's
  store ids and dropped anything unmatched; it never read Xbox or Nintendo. Checked live on
  14 October: IGDB has 22 store sources and none is Nintendo; its Xbox 360 ids end in the
  game's title id.

## Update: 14 October 2026, on the Windows computer

- **PR #5 is merged** (steps 2 and 3). The owner chose to merge with Lighthouse a near miss
  on Windows (library 89, wall 88 at the slowdown that agrees with the Mac; the Mac gave
  92). Speed work continues at step 9.
- **Next:** step 4, the 3D shelf and the 2D/3D switch, on a branch from `main`. It ends
  with a ⏸.
- **The working copy is `C:\dev\shelf`.** Node 24.18 through nvm-windows, pnpm 10.34.7
  through corepack. No Docker yet, so `pnpm verify --skip-linux` until it is installed.
- **`pnpm verify` on Windows** passed every step but Lighthouse at step 3's last commit:
  checks, build, JavaScript budgets, 859 browser tests in all nine projects (0 failed),
  Storybook. Three commits made it run here: LF line endings pinned in `.gitattributes`,
  `verify.ts` taught to start and stop processes on Windows, and the read-only-folder test
  skipped there. See `docs/testing.md`.
- **Lighthouse on Windows:** the slowdown from the benchmark (16.6 times) is far too harsh
  here. At step 3, `LIGHTHOUSE_SLOWDOWN=5.5` made the home page block for about 180 ms as it
  does on the Mac and CI; at step 4 that took about 7.7 (see above). The table is in
  `docs/testing.md`, "Speed".
- **A real bug found by running WebKit here:** the theme picker visibly faded from System
  to the saved theme on every load, because Next.js hydrates a page's content after the
  layout that sets `data-ready`. Segmented controls now hold their own transitions until
  two frames after they mount (`src/ui/segmented.tsx`).
- **For an AI agent on this computer:** the Claude app's Bash tool runs in a sandbox where
  Playwright's Firefox cannot start (`spawn UNKNOWN`); Chromium and WebKit can. Run browser
  tests that include Firefox, and `pnpm verify`, from PowerShell, with
  `PLAYWRIGHT_BROWSERS_PATH` pointing at
  `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\ms-playwright`, where the
  sandbox installed the browsers. `.env.local` holds only the two Twitch values.

## Where things stood on the Mac

- **Branch `build-steps-2-3-library`**, pull request
  [#5](https://github.com/ldallacqua/shelf/pull/5) (open, not draft). It holds build steps 2
  and 3. The last commit is the one that adds this file.
- **The owner approved the look of steps 2 and 3** ("design looks good, I might need to do
  some changes in the future") and asked for the recommended extra speed pass, with all
  checks run locally instead of on GitHub. **PR #5 is not merged yet**: merge it once
  `pnpm verify` passes (the owner allows merging their own PRs with `gh`).
- **Next after merging:** branch from the updated `main` and build **step 4, the 3D shelf
  and the 2D/3D switch**. It ends with a ⏸: stop, summarize, wait for approval.

## What the last commit adds

1. **Messages compiled at build time** (`next.config.ts`, next-intl `precompile`). 9 KB off
   every page; library 238 → 229 KB. `t.raw` no longer works; nothing uses it.
2. **On a phone, the shelves beside the one in view wait for the first touch** before they
   fill (`src/features/library/first-touch.ts`, `waiting` in `use-row-window.ts`, `runsOf`
   in `shelf-layout.ts`). Until then they keep only the box Tab stops at. Checked by hand: a
   tap fills the neighbour shelf from 1 box to 15; a swipe fills the one after.
3. **CI runs only by hand.** `.github/workflows/ci.yml` has no push or pull-request trigger
   any more. The owner's decision: Actions minutes are limited (a full run cost about 75 of
   2,000 a month). **Do not start the workflow on GitHub unless the owner asks.**
4. **`pnpm verify`** (`scripts/verify.ts`) runs every check on the local machine instead:
   `pnpm check`, build, serve with the IGDB doubles, JavaScript budgets, all nine browser
   projects, a Linux pass in Playwright's Docker image (WebKit at three widths, reference
   screenshots), Lighthouse, Storybook. `--quick`, `--skip-linux`, `--update-screenshots`.
   Documented in `docs/testing.md`. Its run times in the docs (4 and 20 minutes) are
   estimates; nobody has timed a complete run yet.
5. JavaScript budgets tightened to the new sizes (205 / 234 / 198 KB); docs updated
   (`AGENTS.md`, `docs/testing.md`, `docs/architecture.md` sections 2, 17, 18, 19, 25,
   `README.md` status).

## Checks on that commit

| Check | Result |
| --- | --- |
| Format, lint, types, translations, 504 unit and component tests | Pass |
| Build; JavaScript budgets (home 198.0, library 228.9, trophies 191.3 KB) | Pass |
| Browser tests on the Mac: Chromium and Firefox at all widths, WebKit partly | 732 passed, 0 failed, then the run was cut off (below) |
| Rest of WebKit on the Mac, Linux pass in Docker, Storybook build | **Not run yet** |
| Lighthouse, shelf, measured on its own at the calibrated slowdown (15.7×) | 92, 92, 92 on warm runs; blocked time about 270 ms (was 90 and 305 ms before this pass) |
| Lighthouse, home and wall, after this pass | **Not re-measured** (before it: 97 and 93 on the Mac) |

**First job on the new computer:** `pnpm verify`. If it passes, merge PR #5.

**Lighthouse on another machine.** `pnpm perf:lighthouse` works its processor slowdown out
from Lighthouse's benchmark of the machine (`cpuSlowdownFor` in `scripts/lib/budgets.ts`).
On a different computer the number will differ; check the slowdown it prints. The Mac and
GitHub's runners disagreed by about four points for the same build (shelf 91 on the Mac,
87 on CI at the stock 4×), so treat a score close to 90 as a near miss.

## Why the run was cut off

At 01:49 the Mac's **WindowServer crashed** (SIGABRT) while the macOS WebKit browser tests
were running. The crash report's stack ends in `WSIOSurfaceDebugTallyAndAbort`, under
`iosurface_create_common` ← `CaptureSurfaceMetal` ← `captureWindowList`: WindowServer
aborted while creating a surface to capture windows. That ended the login session,
including the agent. My reading, unproven: many WebKit pages in parallel (three workers) exhausted
WindowServer's surface tally. If it
happens again, run macOS WebKit with `--workers=1`, or leave WebKit to the Linux pass.

## Step 4 notes (nothing built yet)

- **Versions checked on 14 Oct 2026:** three 0.186.1, @react-three/fiber 9.8.1 (peer React
  `>=19 <19.4`, so React 19.3 is fine), @react-three/drei 10.7.9, @types/three 0.186.0, all
  published 24–25 Sep 2026. drei may not be needed: the camera rig, picking and materials
  are our own (architecture section 14). Check again before installing.
- **What the spec asks** (spec 3.3, 3.5, 3.6, 11, 13, 14, 16; architecture 14): bays left to
  right, black ledges with an LED bar each, a label per shelf; a camera that walks sideways
  (wheel, trackpad, drag, arrows, Page Up/Down, Home/End), eased and clamped; an index of
  ticks, one per shelf; hover or focus brings a box forward and glides its ledge's LED to
  the game's color, with a small label; pull on click or Enter, with the detail beside it;
  covers at the size they appear (color blur until they arrive); fall back to 2D on no WebGL 2, a lost
  context, or a sustained low frame rate, saying so in one line; the canvas hidden from
  assistive technology, with the same labeled lists beside it driving the camera.
- **Defaults:** 3D on a desktop with WebGL 2 and no reduced motion; 2D on phones, tablets and
  under reduced motion; the choice is remembered per device, not in the address. The `D` key
  switches. The 3D code loads only the first time 3D opens; `THREE_MARKERS` in
  `scripts/lib/budgets.ts` already fails any page whose first load contains three.js.
- **Switch:** the anchor (focused game, or the one nearest the middle) stays on screen;
  700 ms tilt and depth, or a 200 ms crossfade under reduced motion.
- **Budgets:** under 40 draw calls for 1,000 games, under 256 MB of textures, 60 frames a
  second with 500 games on a mid-range laptop (`pnpm perf:3d`, to be written), 3D bundle
  under 300 KB compressed.
- **Tests:** the desktop browser projects will default to 3D once it exists. Most existing
  tests read the 2D page, so give the fixtures a way to set the dimension (an init script
  writing the preference) and add parity tests that run the same scenarios in both. Check
  first whether headless Chromium, Firefox and WebKit can create a WebGL 2 context here;
  where one cannot, the test must assert the fallback.
- The server always renders the 2D shelf. 3D replaces it on the client once its first frame
  is drawn, so the first paint and Lighthouse (mobile, so 2D) are unaffected.

## Setting up the new computer

- `git clone git@github.com:ldallacqua/shelf.git`, `git checkout build-steps-2-3-library`,
  Node 24 (`.nvmrc`), `pnpm install`, `pnpm seed`.
- **`.env.local` is not in the repository.** It holds `TWITCH_CLIENT_ID` and
  `TWITCH_CLIENT_SECRET` (the IGDB credentials), which came from the reference app on the
  Mac mini. Copy that file across yourself, or paste the values; never commit them, print
  them, or put them in a summary. Nothing except `pnpm fixtures:fetch` needs them: tests,
  builds and previews run on fixtures and test doubles.
- Docker, for the Linux pass: `mcr.microsoft.com/playwright:v1.64.0-noble` (about 3.5 GB;
  the version must match `@playwright/test`).
- `vercel link` if Vercel commands are needed (the `.vercel` folder is not committed).
  Vercel builds every push to the PR branch on its own; that is not GitHub Actions.

## Rules from the owner's brief worth repeating

The original brief is not in the repository; ask the owner for it if anything below is
unclear.

- Work in phases on a branch per step, a clear commit at the end of each step, and a PR so
  Vercel makes a preview. **Stop at every ⏸** (after steps 4 and 8, then the final review)
  and wait for approval. Remaining order: 4 3D shelf ⏸; 5 filters, sorting, smart shelves;
  6 game detail; 7 sign-in and adding games; 8 landing page ⏸; 9 phone, tablet,
  accessibility and speed passes; 10 final review.
- **Done for a step:** tests pass, lint and types clean, no console errors, and a summary
  with screenshots at desktop and phone, light and dark.
- **Check each library's or service's latest stable version and current docs before using
  it**; don't rely on memory.
- **The reference app ("MySpot Games" / "Save State") is read-only.** Never modify it, install
  into it or run migrations against it.
- **Generated art** comes from the Codex CLI (`codex`), with its prompts saved in
  `design/assets/PROMPTS.md`. Never generate game cover art; covers and screenshots come from
  IGDB.
- The repository stays private. No commits made by a bot (Vercel's free plan would not deploy
  them). Ask before `vercel curl` on a protected preview: it creates a protection-bypass
  secret.
- The visual direction is "Backlit": an RGB game room, covers facing out. Never serif type,
  never green with brass, never spine-only rows by default (`docs/adr/002-visual-direction.md`).

## Traps met on the Mac (zsh)

- `for path in …` in zsh overwrites `PATH`; use another loop variable.
- `git checkout <file>` throws away every uncommitted change in that file, not just the
  experiment you meant to undo.
