# Shelf: testing

How Shelf is tested, how to run each kind of test, and what to do when one fails. The
reasoning behind the layers is in [the architecture, section 17](architecture.md#17-testing).

## The layers

| Layer | Where | Run with | Covers |
| --- | --- | --- | --- |
| Unit | `src/**/*.test.ts`, `scripts/**/*.test.ts` | `pnpm test` | Rules with no browser: the data model's rules (grouping, sorting, the library file, platforms, cover colors), the filter language (parsing, writing back, every filter alone and combined, counts, the panel's edits), the API's answers, the store and smart shelves against a real SQLite, the IGDB client against test doubles, the seeds, the theme rules, the design tokens, the list of pages, the translation check, and the filter speed budget |
| Component | `src/**/*.test.tsx` | `pnpm test` | Components in a simulated browser, in both languages: keyboard paths, labels, state |
| End to end | `e2e/*.spec.ts` | `pnpm e2e` | The built app in real browsers: language, theme, layout, accessibility, the lit shelf, the library file, the 3D shelf and its switch, search, filters, sorting, smart shelves and the API |
| Reference screenshots | `e2e/visual.spec.ts` | `pnpm verify` (its Linux pass) | Every page, both themes, both languages, phone and desktop |
| Speed | `scripts/measure-js.ts`, `scripts/lighthouse.ts`, `scripts/perf-3d.ts` | `pnpm perf:js`, `pnpm perf:lighthouse`, `pnpm perf:3d` | First-load JavaScript per page and the 3D bundle, Lighthouse on the mobile profile, and the 3D shelf's frame time on this machine's graphics card |

## Data in tests

**No test reaches IGDB, or any network.**

- **Fixtures.** `fixtures/` holds real IGDB records, fetched once by `pnpm fixtures:fetch`
  and committed ([what each file is](../fixtures/README.md)).
- **A real database.** Tests of the store and the seeds run on SQLite in memory, migrated
  with the real migrations: `createTestDatabase()` in `src/test/database.ts`. Pass it
  `'default'`, `'empty'` or `'stress'` to start from a data set.
- **A closed network.** Every unit test shares one MSW server (`src/test/network.ts`) that
  refuses any request with no test double, so a forgotten double fails the test instead of
  reaching the internet. A test that needs IGDB adds the doubles for that test:
  `network.use(...createHandlers(loadFixtures()))`.
- **The IGDB double** (`src/server/mocks`) answers from the fixtures and understands the
  queries Shelf sends: ids, name matches, search, sort, limit, multi-queries. A query it does
  not understand gets a 400, as IGDB would give, so a query cannot pass against the double
  and fail against the real thing for being malformed.
- **In the browser tests** the built app is started with `SHELF_MOCKS=1`, which installs the
  same doubles inside the server (`src/instrumentation.ts`): IGDB and Twitch, and a test
  assistant's metadata document. It also makes up the owner's account (`MOCK_OWNER` in
  `src/server/mocks/start.ts`). They refuse to start on Vercel.
- **Covers are flat colors.** In the browser tests every request to IGDB's image servers is
  answered with a color made from the image's id (`e2e/fixtures.ts`). No test depends on
  those servers, and the repository holds no cover art. Lighthouse is the exception: it
  loads the real covers, because their weight is what it measures.
- **The same library every time.** `pnpm seed` builds the sample library from the fixtures,
  and invents each game's status, copies and dates from the game's own id. Two seeds give the
  same shelf, so reference screenshots stay stable.

## The library in browser tests

`openLibrary(page)` opens the library and waits until all of it has arrived: the page comes
with its first boxes, the rest follow as the library file, and the first boxes take a moment
to drop onto the shelf. Use it instead of `page.goto` for anything that reads the shelves.

A box is found by its name, which says what it shows: `getByRole('button', { name: /^Astro
Bot/ })` has the accessible name "Astro Bot (2024), PS5, Physical, Completed". Only the rows
near the window are in the page, so a game far down a shelf is not found until it is scrolled
or stepped to.

To see the page before the rest of the library arrives, hold the library file with
`page.route('**/library/snapshot/**', ...)` and let it go later, as the "while the library
arrives" test does. Meanwhile the places still to fill hold ghosts (`[data-ghost]`), which
assistive technology does not see. The part of the page built ahead of time, before the first
boxes, is checked by serving it alone, with script off: `layout.spec.ts` cuts the page where
the streamed part begins. `LibrarySkeleton` also has component tests and a story.

## Filters and smart shelves in browser tests

**Counts come from the API.** Where a test checks how many games a filter matches, it asks
`/api/v1/library` for the number rather than writing it down, so the page and the API are
checked against each other and a change to the sample library does not break the test.

**While the filter panel is open the page behind it is out of reach** of `getByRole`, as it
is of a screen reader. Read the filter from the address instead (`address(page)` in
`e2e/filters.spec.ts`). Status and genre start open in the panel; the other sections are
opened by their summary. With a mouse a value's row cycles off, included, excluded; on touch
it has two buttons. `pick()` does whichever the browser has.

**The owner signs in.** A test that needs me writes `test.use({ signedIn: true })`. The first
such test in a worker signs in for real (`signIn()` in `e2e/fixtures.ts`): it fills in the
sign-in form with the made-up owner's email address and password (`OWNER`), and the session
is saved to a file the worker's other tests load. The nine
projects run at once against one database, so a test that saves a shelf names it after its
project and removes it again in a `finally`. A run stopped half-way can leave a shelf called
`Test …` behind; `pnpm seed` puts the database back.

**The API is checked in one project** (Chromium at desktop width): it answers every browser
the same. So are the MCP endpoints, through the official MCP client, on both revisions of the
protocol.

## Adding and editing in browser tests

**Tests that change the library are `*.writes.spec.ts`,** and run in nine projects of their
own (`chromium-desktop-writes` and so on), which start only once the nine that read have
finished: the reading tests compare what they see with the sample library. To run them
alone, pass `--no-deps`:

```sh
pnpm e2e e2e/editing.writes.spec.ts --project=firefox-phone-writes --no-deps
```

**The server serves a copy of the database.** `pnpm serve:test` copies `.data/shelf.db` to
`.data/e2e.db`, migrates the copy, and serves it with the test doubles on; Playwright and
`pnpm verify` both start it. Nothing a test adds reaches `shelf.db`. A server left running
keeps its copy, with what earlier runs added, so tests clean up after themselves.

**Each test adds a game no other test touches.** Nine projects add games at once, so
`gameToAdd(info, slot)` and `listToAdd(info)` in `e2e/games-to-add.ts` give each test in each
project a fixture game of its own, one no sample game is related to. A test that adds a
game takes it away again, through the API.

**An assistant signs in** in `e2e/mcp.writes.spec.ts`, once, in Chromium: MSW serves a test
assistant's metadata document (`MOCK_ASSISTANT`), the browser says no and then yes on the
consent page, and the test trades the code for a token and calls the owner's tools. Three
things learned there:

- Ask with `prompt=consent` when a test needs the consent page. A yes from an earlier run
  is remembered, and the server then sends the browser straight on.
- A route set with `page.route()` does not catch where a server's own redirect lands. Read
  such a redirect from the response (`maxRedirects: 0`).
- A request context the test makes carries the test's cookies unless it is given an empty
  `storageState`. With a cookie, Better Auth asks for an `Origin`, which an assistant never
  sends.

## A game's page in browser tests

**The address changes before the panel shows.** Opening a game adds its address at once and
draws the panel a moment later, once its code is in (it is fetched when a game is first
reached for). Wait for the panel, or for its Close button to have focus, before pressing a
key in it; `e2e/game.spec.ts` does.

**A phone is tapped, not clicked.** On a phone the shelves beside the one in view wait for the
first touch (`first-touch.ts`). Playwright's `click()` sends no touch even where the project
has one, so a test that needs those shelves filled uses `tap()`. The "while the library
arrives" test failed about one run in three on WebKit at phone width until it did.

**The cover's flight is counted, not watched.** A test wraps `document.startViewTransition`
in an init script and counts its calls: one for a game opened, none under reduced motion,
and nothing left named once the cover has landed. Where a browser has no view transitions
the count is not checked.

**A private note is checked where it could leak:** the page's HTML, the API and the game's
facts file. The sample library gives Donkey Kong Country a private note.

## The 3D shelf in browser tests

**Every test starts in 2D**, whatever the device would choose: the `dimension` option in
`e2e/fixtures.ts` stores 2D before the page loads. A test about 3D asks for it with
`test.use({ dimension: '3d' })`, or for the device's own default with `'device'`.

**`shelfSettled(page)` waits for the shelf to finish deciding.** It reads the pair of buttons:
if 3D is pressed, it waits until the 3D shelf has taken over (`[data-shelf-phase="3d"]`) or
said why it could not, and returns `'3d'`, `'fallback'` or `'2d'`. `openLibrary` calls it.

**Where a browser cannot draw 3D, the test is skipped, not failed.** Test browsers draw WebGL
in software, and some cannot make a context at all. Then the app's own fallback runs, and
the fallback has tests of its own (no WebGL 2, a lost context). The tests about the scene
itself run at desktop width, where 3D is the default; a phone is checked for having no 3D.

**The scene's numbers** (draw calls, texture memory, which box is pulled, where the camera
is) are read through `window.__shelf3dProbe`. Set it to `{}` in an init script and the scene
writes its numbers there after each frame:

```ts
await page.addInitScript(() => {
  window.__shelf3dProbe = {}
})
```

The scene's lists beside the canvas are what a test drives: the same names and order as the
2D boxes, as buttons with `data-box`. The canvas itself is hidden from assistive technology.

## Before a push: `pnpm verify`

**CI on GitHub runs nothing by itself.** Actions minutes on a private repository are
limited, and the full set of checks took about 75 of the month's 2,000 each time, so every
check runs on this Mac instead. A build step is done when `pnpm verify` passes on its last
commit.

```sh
pnpm verify                       # everything; about 20 minutes
pnpm verify --quick               # format to unit tests, build, JavaScript budgets, smoke tests
pnpm verify --skip-linux          # everything but the Docker pass (say so in the summary)
pnpm verify --update-screenshots  # the Linux pass makes new reference screenshots
```

In order, stopping at the first failure: `pnpm check` (format, lint, types, translations,
unit and component tests); a production build, served on port 3300 with the IGDB test
doubles; the JavaScript budgets; the browser tests in all nine projects; the Linux pass;
Lighthouse; the Storybook build. It builds and serves its own copy, so it refuses to start
while something else answers on port 3300.

**The Linux pass** runs in Playwright's Docker image, against the server on the Mac: WebKit at
all three widths (Linux WebKit is not Safari, see below) and the reference screenshots. Docker
has to be running.

**On Windows** `pnpm verify` runs the same steps. Two things differ: the browser projects'
WebKit is Playwright's Windows build, which is neither Safari nor Linux WebKit, so the Linux
pass is still the one that counts for WebKit; and a test that needs a folder Node cannot write
to is skipped, because Windows ignores a folder's mode bits. Line endings are pinned to LF in
`.gitattributes`, since Git for Windows otherwise checks files out with CRLF and every file
fails the format check.

The workflow in `.github/workflows/ci.yml` is still there, for the odd time a check is wanted
on GitHub's own machines: Actions → CI → Run workflow, or
`gh workflow run ci.yml --ref <branch>` (add `-f only=lighthouse` for Lighthouse alone).

## Running the browser tests

They run against a production build, never the development server.

```sh
pnpm build
pnpm e2e --project=chromium-desktop            # one of the nine projects
pnpm e2e e2e/theme.spec.ts --project=webkit-phone
pnpm e2e --grep @smoke                         # the short list `pnpm verify --quick` runs
```

The nine projects are three engines (Chromium, Firefox, WebKit) at three widths (phone 390,
tablet 820, desktop 1440), and each has a twin that runs the tests that write (above).
Playwright starts the server itself (`pnpm serve:test`); if one is already running on port
3300 it uses that. On Windows, run Playwright from PowerShell with
`PLAYWRIGHT_BROWSERS_PATH` set to where its browsers are.

**WebKit on Linux is not Safari.** The Linux build of WebKit paints with different code from
the one on a Mac. A test can pass in WebKit on a Mac and hang on Linux: the wall's shelf
labels once had a blurred-glass background each, and a dozen of those made the Linux build
stop answering and fill CI's disk. `pnpm verify` runs it in its Linux pass. To run one file
there by hand, use Playwright's own image against a server on the Mac:

```sh
pnpm build && SHELF_MOCKS=1 pnpm start &
docker run --rm --ipc=host -e BASE_URL=http://host.docker.internal:3300 \
  -v "$PWD":/work:ro mcr.microsoft.com/playwright:v1.64.0-noble \
  bash -c 'cd /work && node node_modules/@playwright/test/cli.js test e2e/library.spec.ts \
    --project=webkit-desktop --grep-invert @visual --output=/tmp/results'
```

The image's version must match `@playwright/test` in `package.json`.

Every test fails if the page logs an error to the console. A test that causes an error on
purpose, such as opening an address that answers 404, opts out with
`test.use({ allowConsoleErrors: true })`.

## Accessibility checks

`e2e/a11y.spec.ts` runs axe (WCAG 2.2 A and AA) on every page in both themes and both
languages, and on each menu while it is open. Add a page to the `pages` list in
`e2e/fixtures.ts` and it is covered.

Color contrast is also checked without a browser: `src/ui/tokens/tokens.test.ts` reads the
token files and fails if any allowed text-and-background pair drops below 4.5:1, or any
control edge below 3:1. It also checks the worst case for the shelf's light, which can be
any color.

## Reference screenshots

Text renders differently on a Mac and on Linux, so reference screenshots are made on Linux,
in the Linux pass of `pnpm verify`, and `e2e/visual.spec.ts` is skipped everywhere else. They are taken with the wall's
grain switched off: it is noise by design, and it makes each image three times larger.

**When the look changes on purpose:**

1. Run `pnpm verify --update-screenshots`. Its Linux pass writes the new images into
   `e2e/__screenshots__/`.
2. Look at them (`git diff --stat e2e/__screenshots__` shows which changed), then commit them.

**When a screenshot test fails and nothing was meant to change,** the report in
`playwright-report/` holds the expected image, the actual one and the difference. The Linux
pass writes its own inside the container and throws it away; rerun the failing file by hand
(the `docker run` above) with `-v "$PWD/playwright-report":/work/playwright-report` to keep it.

## Continuous integration

`.github/workflows/ci.yml` runs only by hand (Actions → CI → Run workflow). Nothing runs on a
push or a pull request: see [Before a push](#before-a-push-pnpm-verify). By hand it can run
everything (about 75 minutes of the month's 2,000), Lighthouse and the Storybook build alone,
or make new reference screenshots and offer them as a download. It never commits: on
Vercel's free plan a commit made by a bot does not deploy.

## Speed

`pnpm perf:js` opens each page in a browser and adds up the JavaScript that page downloads.
The budgets in `scripts/lib/budgets.ts` are a ratchet: a page that grows past its number
fails, and raising a number is a change that has to be explained there.

`pnpm perf:lighthouse` runs Lighthouse with its mobile profile and its throttling applied
for real. The targets are a performance score of 90, largest paint within 2.5 seconds and a
layout shift under 0.1. Each page runs three times and is judged by the middle run. The
processor is slowed by an amount worked out from Lighthouse's benchmark of the machine (about
15.7 times on the Mac mini), so that it stands in for a mid-range phone.

The Mac and GitHub's runners do not quite agree. The last time both measured the same build
(step 3), the Mac gave the shelf 91 and a runner, at Lighthouse's stock four times, 87. A
score within a few points of 90 on the Mac is a near miss, not a pass to lean on.

**On Windows the slowdown worked out from the benchmark is wrong.** Chrome slows a Windows
processor much more coarsely than a Mac's, and the cost grows faster than the number: on
the Windows computer (benchmark about 4,470, so 16.6 times) the home page blocked for
2,262 ms, against about 177 ms on the Mac at 15.7 times. Measured at step 3's last commit
on Windows:

| Slowdown | Home | Library | Wall | Home blocked |
| --- | --- | --- | --- | --- |
| 16.6 (from the benchmark) | 69 | 58 | 58 | 2,262 ms |
| 8 | 85 | 77 | 78 | 557 ms |
| 6 | 95 | 88 | 87 | 216 ms |
| 5.5 | 95 | 89 | 88 | 201 ms |
| 4 (CI's) | 99 | 96 | 95 | 82 ms |

The home page's blocked time is the check that two machines agree (`scripts/lib/budgets.ts`):
about 180 ms on the Mac and on CI. On Windows that was about 5.5 times at step 3, so start
with `LIGHTHOUSE_SLOWDOWN=5.5 pnpm verify` there and check the home page's blocked time in
the output before reading the scores. It drifts with how busy the machine is: at step 4 the
benchmark read 5,140, not 4,470, and the home page blocked 85 ms at 5.5 times, 160 ms at 7.5
and 226 ms at 8. At step 5 it blocked 129 ms at 6.5, 197 ms at 7.1 and 232 ms at 7.7. Raise
or lower the number until it blocks about 180 ms, and read the scores there.

Inside `pnpm verify` Lighthouse runs right after a quarter of an hour of browser tests, and
a machine that has just done that is a slower one. At step 5's review the same 7.1 times
gave the home page 386 ms in verify, and a few minutes later, on its own, 6.5 times gave
about 330 ms, 5.5 times 160 ms and 4 times 80 ms. When verify's Lighthouse step misses,
check the home page's blocked time first, and rerun `pnpm perf:lighthouse` on its own at a
slowdown that gives about 180 ms.

**`pnpm perf:3d`** measures the 3D shelf on this machine's graphics card, since the test
browsers draw WebGL in software. It walks the camera along the wall and back, sweeps the
pointer across the boxes, and reports the middle and 95th-percentile frame times, the draw
calls and the texture memory. The target is a middle frame within 16.7 ms with 500 games on a
mid-range laptop, so measure the stress set:

```sh
pnpm seed stress && pnpm build && pnpm start
pnpm perf:3d
pnpm seed && pnpm build        # back to the sample library
```

All three need the server running: `pnpm build && pnpm start`.
