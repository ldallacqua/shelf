# Shelf: testing

How Shelf is tested, how to run each kind of test, and what to do when one fails. The
reasoning behind the layers is in [the architecture, section 17](architecture.md#17-testing).

## The layers

| Layer | Where | Run with | Covers |
| --- | --- | --- | --- |
| Unit | `src/**/*.test.ts`, `scripts/**/*.test.ts` | `pnpm test` | Rules with no browser: the data model's rules (grouping, the library file, platforms, cover colors), the store against a real SQLite, the IGDB client against test doubles, the seeds, the theme rules, the design tokens, the list of pages, the translation check |
| Component | `src/**/*.test.tsx` | `pnpm test` | Components in a simulated browser, in both languages: keyboard paths, labels, state |
| End to end | `e2e/*.spec.ts` | `pnpm e2e` | The built app in real browsers: language, theme, layout, accessibility, the lit shelf, the library file |
| Reference screenshots | `e2e/visual.spec.ts` | `pnpm verify` (its Linux pass) | Every page, both themes, both languages, phone and desktop |
| Speed | `scripts/measure-js.ts`, `scripts/lighthouse.ts` | `pnpm perf:js`, `pnpm perf:lighthouse` | First-load JavaScript per page, and Lighthouse on the mobile profile |

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
  same doubles inside the server (`src/instrumentation.ts`). They refuse to start on Vercel.
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
tablet 820, desktop 1440). Playwright starts the server itself; if one is already running on
port 3300 it uses that.

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
about 180 ms on the Mac and on CI. On Windows that is about 5.5 times, so run
`LIGHTHOUSE_SLOWDOWN=5.5 pnpm verify` there and check the home page's blocked time in the
output before reading the scores.

Both need the server running: `pnpm build && pnpm start`.
