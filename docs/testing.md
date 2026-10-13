# Shelf: testing

How Shelf is tested, how to run each kind of test, and what to do when one fails. The
reasoning behind the layers is in [the architecture, section 17](architecture.md#17-testing).

## The layers

| Layer | Where | Run with | Covers |
| --- | --- | --- | --- |
| Unit | `src/**/*.test.ts`, `scripts/**/*.test.ts` | `pnpm test` | Rules with no browser: the data model's rules (grouping, the library file, platforms, cover colors), the store against a real SQLite, the IGDB client against test doubles, the seeds, the theme rules, the design tokens, the list of pages, the translation check |
| Component | `src/**/*.test.tsx` | `pnpm test` | Components in a simulated browser, in both languages: keyboard paths, labels, state |
| End to end | `e2e/*.spec.ts` | `pnpm e2e` | The built app in real browsers: language, theme, layout, accessibility, the lit shelf, the library file |
| Reference screenshots | `e2e/visual.spec.ts` | CI only | Every page, both themes, both languages, phone and desktop |
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

## Running the browser tests

They run against a production build, never the development server.

```sh
pnpm build
pnpm e2e --project=chromium-desktop            # one of the nine projects
pnpm e2e e2e/theme.spec.ts --project=webkit-phone
pnpm e2e --grep @smoke                         # the short list CI runs on every push
```

The nine projects are three engines (Chromium, Firefox, WebKit) at three widths (phone 390,
tablet 820, desktop 1440). Playwright starts the server itself; if one is already running on
port 3300 it uses that.

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

Text renders differently on a Mac and on Linux, so reference screenshots are made in CI on
Linux and `e2e/visual.spec.ts` is skipped everywhere else. They are taken with the wall's
grain switched off: it is noise by design, and it makes each image three times larger.

**When the look changes on purpose:**

1. Push the change.
2. Add the `update-screenshots` label to the pull request (or run the CI workflow by hand
   with "Make new reference screenshots" ticked).
3. When the job finishes, download its `reference-screenshots` file:
   `gh run download <run-id> --name reference-screenshots --dir e2e/__screenshots__`
4. Look at the new images, then commit them.

The job never commits by itself. On Vercel's free plan a commit made by a bot does not
deploy.

**When a screenshot test fails and nothing was meant to change,** the failed run's
`full-report-chromium` file holds the expected image, the actual one and the difference.

## Continuous integration

`.github/workflows/ci.yml` has two tiers, because a private repository gets 2,000 free minutes
a month.

| Tier | Runs | When |
| --- | --- | --- |
| Quick | Format, lint, types, translations, unit and component tests, build, JavaScript budgets, the `@smoke` browser tests in Chromium | Every push to a pull request |
| Full | All nine browser projects, reference screenshots, Lighthouse, the Storybook build | When a pull request is marked ready for review, on every push to `main`, on the `full-ci` label, or by hand |

A build step is done when the full tier is green on its last commit.

## Speed

`pnpm perf:js` opens each page in a browser and adds up the JavaScript that page downloads.
The budgets in `scripts/lib/budgets.ts` are a ratchet: a page that grows past its number
fails, and raising a number is a change that has to be explained there.

`pnpm perf:lighthouse` runs Lighthouse with its mobile profile and its throttling applied
for real. The targets are a performance score of 90, largest paint within 2.5 seconds and a
layout shift under 0.1.

Both need the server running: `pnpm build && pnpm start`.
