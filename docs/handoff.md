# Handoff: 27 October 2026

Work moved from the Mac mini to another computer partway through the review pass after
step 3. This note is what the next session needs and cannot get from the code. Read
`AGENTS.md` first, then this.

## Now: the owner's issues, highest priority first (27 Oct 2026)

The owner: "look at shelf issues and start by the highest priority items". The issues are
[on GitHub](https://github.com/ldallacqua/shelf/issues), labelled P0 (most urgent) to P3.

- **#62 (P0), the filters beside the library on a wide screen, is built** (architecture section 25,
  row "Filters beside"). From 1536px; the library's page widens with it, to 2560px. The
  library's script is 277.7 KB of its 279: the budget was raised with its reason. After it, the
  owner asked for a quieter scroll in the column and for the title over the search, so the
  column is whole from the first screen (row "Filters' column, whole"). Then: only the
  library widens (other pages had gone wide after a click from it), the status row steps aside
  beside the column, and the column is a little wider (row "Library width only").
- **The age rating filter** (row "Age rating"): `age:esrb-ao`, `age:pegi-18`. The owner makes
  any shelf of it themself: "dont add for everyone a nsfw filter or shelf". Only the sample
  set's fixtures have ratings; the stress set's would come with a whole `pnpm fixtures:fetch`.
- **`pnpm desktop:check` no longer times out on a library page** (row "Desktop check, idle"):
  Chromium's refresh of a cached Trophies prefetch is never reported finished, so the check's
  browsers now have their HTTP cache off. Production was never affected. The browser tests'
  security spec waits for idle the same way, so it needs the same change when those tests
  return after the MVP.
- **#63, 3D and compact behind Experimental views,** off by default, on the account page
  (architecture section 25, row "Experimental views"). Every device now starts in 2D with
  covers. The browser tests that use 3D or compact store the setting on first (`e2e/fixtures.ts`);
  they have not been run, as no Playwright runs until the MVP.
- **#66, the wall's and the trophies' labels on a darker band,** is fixed (architecture section
  25, row "Wall labels, banded only when pinned"). The band shows only while a label is pinned,
  and a phone's wall labels no longer stand on their first row of covers. Its browser test, in
  `e2e/library.spec.ts`, has not been run.
- **#72, Steam achievements,** is built (architecture section 25, row "Achievements from
  Steam"; spec 7.8; ADR 003's "Built: achievements"). Read in steps after each sync, shown on
  each game's page, and added up on the trophy page (#68's third phase).
  Reading was then batched: Steam counts a hundred games' unlocks in one question, a step
  reads for 15 seconds, and a game is asked about on its own only for a list not read yet or
  new unlocks (ADR 003's "Counted first").
  **Still to do, by the owner:** press Sync now on production once and look at a few games'
  achievements, since production is real data and no check here may write to it. Existing
  links need no new sign-in: the next sync, or the daily one, reads them.
- **Steam's "did not answer" on the owner's card was ours** (architecture section 25, row
  "Achievements from the count"): Steam keeps some games' own lists from the Web API for their
  content, and Shelf did not read their unlocks from the count, which has them. The next sync
  reads them.
- **Hiding adult games is on the account page now,** a switch after Experimental views, as the
  owner asked (architecture section 25, row "Adult games in settings"). The library's button and
  `H` are gone.
- **#68's first phase is built** (architecture section 25, row "Trophy page, phase 1"; spec 3.9):
  the headline, year by year, month by month, what is finished, records, and a year and a
  filter in the address. Phases 2 to 4 are still the issue's: taste and ratings, franchises,
  the timeline, insights; achievements; the backlog.
- **A game's achievements open as their icons** (architecture section 25, row "Achievements as
  icons"; spec 7.8), as the owner asked: the list was too long before its Show all.
- **A completed game is finished on its last play** (architecture section 25, row "Finished on
  the last play"; spec 7.3), as the owner asked: the next sync dates those still without a day.
- **#68's second phase is built** (architecture section 25, row "Trophy page, phase 2"; spec
  3.9): what the figures say, rankings by finished, hours, rating or share, modes,
  perspectives, developers, publishers and decades, my ratings against IGDB's, series progress
  and my years with their milestones.
- **#68's third phase is built** (architecture section 25, row "Trophy page, phase 3"; spec
  3.9): the achievements (unlocked, perfect games, rarity and its score, year by year, by
  genre, records and milestones) and the trophy vault (rarities that keep it, the rarest and
  latest unlocks, perfect games and the nearly perfect), then its card to share (row "Trophy
  card"): of all time or a year's recap, what a link to the page shows.
- **The trophy page loads well** (architecture section 25, rows "Trophy page loads" and "Steam
  artwork moved"): its walls are in Vercel's runtime cache (`'use cache: remote'`), where plain
  `'use cache'` was one instance's memory and each visit worked them out again; its skeleton is
  its first screen; achievements' artwork comes from Steam's newer image host, and migration
  0022 moved the addresses stored before.
- **#68's fourth phase is built** (architecture section 25, row "Trophy page, phase 4"; spec
  3.9, Still to play): the backlog and Someday, the hours left by IGDB's estimate, the months
  to clear it at my own pace, the quickest, best rated and oldest games waiting, and what is
  waiting by genre and platform. Not built: how the backlog grew, since a game's day on the
  shelf is the day it came to Shelf; it waits for shelves with that history.
- **Next:** what the owner asks for after #68.
- **Checking the library in this app's browser pane does not work while the pane is hidden:** the
  streamed library is never revealed and the skeleton stays. A headless Chromium script against
  `pnpm dev` or a production build sees it.

## Just before: Shelf for Windows, the desktop app that plays the games (25 Oct 2026)

The owner asked for an app on their computer that starts their games, "tipo o hydra", from a
file they point at or through Steam. Shown the research, they chose Tauri: "vamos usar tauri
mesmo, Desde que o projeto continue mostrando todos os meus dados corretamente na versão
baixada ta tudo certo. Escreva a documentação e passos para serem seguidos. Depois inicie".

- **The decision is [ADR 005](adr/005-desktop-app.md);** what Play does is spec 7.7; how to
  build, run and install it, and the seven steps it is built in, are
  [the desktop guide](desktop.md). Decisions 32 to 38 in spec section 19 are mine; the owner's
  one condition is that the app shows all their data correctly, which the app meets by opening
  the hosted Shelf rather than a copy of it.
- **The order:** Play on Steam on the site, then the app that opens Shelf, then choosing a file
  and Play, then releases (the owner chooses where installers live), then hours for games
  started from a file. One pull request each.
- **Step 1, Play on Steam on the site, is built** (architecture section 25, row "Play on Steam"):
  `OwnerGame.steam` and the button on Mine's own line. To see it on `serve:test`, link the
  made-up Steam account first (`/api/v1/me/platforms/steam/connect`, then sync): the sample
  shelf has no Steam items until then.
- **Step 2, the app that opens Shelf, is built** (architecture section 25, row "Desktop app"). The
  installer is `desktop/target/release/bundle/nsis/Shelf_0.1.0_x64-setup.exe` after
  `pnpm desktop:build`. **The owner's PATH has a stray quote** after `C:\Program Files\dotnet`,
  which hides cargo from cmd and from Rust itself: run the desktop tools through their `pnpm
  desktop:` scripts, which tidy PATH, and tell the owner rather than edit Windows' settings.
- **Step 3, choosing a file and Play, is built** (architecture section 25, row "Play in the app").
- **Then the owner installed it and asked four things** (ADR 005, sections 8 to 10): Shelf's
  header as the window's bar, Ready to play, automatic updates and an installer that asks
  nothing. Asked where installers live, the repository being private, they chose to make it
  public. These are the guide's steps 4 to 6; hours moved to step 7.
- **Step 4, Shelf's header as the window's bar, is built** (architecture section 25, row "Title
  bar"). It shows only in an app that says its window has no bar, so the installed 0.1.0, with
  Windows' bar, is unchanged until it is replaced. A development build no longer takes the
  single-instance lock: with the owner's installed app open, it used to close itself and bring
  theirs forward.
- **Step 5, Ready to play, is built** (architecture section 25, row "Ready to play"). The
  library's script is at 276.9 KB of its 277: the next change to the library will need room
  made or the budget raised, with its reason in `scripts/lib/budgets.ts`.
- **Step 6, updates and the installer in one step, is built** (architecture section 25, row
  "Updates"). **The key updates are signed with is in `.env.local`
  (`TAURI_SIGNING_PRIVATE_KEY`), and nowhere else but the owner's copy:** lose it and installed
  apps take no more updates. A release is `pnpm desktop:release`, by hand, from `main`, after a
  pull request that raises the version in `tauri.conf.json` and `Cargo.toml`. The repository is
  public since the owner chose it on 25 Oct 2026; nothing secret was in its history.
- **The installer's template is ours** (`desktop/installer/installer.nsi`): Tauri 2.12.4's with
  changes marked "Shelf:". Upgrading the Tauri CLI means starting again from its template.
  `SetCtlColors` takes colors only as written in the script; a variable reads as black.
- **Never in a check:** a real game started, a real Steam opened, or production signed in to by
  a script. The app is checked against `pnpm serve:test`, its web view driven through WebView2's
  debugging port.

## Before: building the five changes in the spec, one pull request each (25 Oct 2026)

The owner, after the add search was fixed: "vai pros proximos items da lista", the five
sections written into the spec. In this order, each merged before the next starts: Someday
and Retired (3.12), wishing on one platform (7.5), archiving (7.4), a game only I see (11.1),
hiding adult games (3.13), last because it needs IGDB's age ratings fetched. Section 19's
decisions 15 to 24 are built as written; the owner did not change them.

- **Someday and Retired are built** (3.12; architecture section 25, row "Statuses"). Statuses have
  two orders now: `statuses`, as shown, and `statusCodes`, as the library file numbers them.
  Add a status at the end of `statusCodes`, never in its middle. The sample shelf has none in
  either, so the browser tests' counts stand.
- **Wishing on one platform is built** (7.5; architecture section 25, row "Wishlist"). A build here
  reads `.data/shelf.db`, so after pulling a migration that adds a column, run `pnpm db:migrate`
  first; Vercel's build migrates by itself.
- **Hiding adult games is built** (3.13; architecture section 25, row "Adult games"), and with it the
  five sections of 25 Oct are all built. Adults Only fills in for the games already cached as
  the daily refresh reaches them; Erotic works from the start. To try it here, mark a game in
  `.data/shelf.db` (`games.adults_only = 1`, and raise its library's version), build, and put
  the database back.
- **The owner's whole shelf is refreshed every day** (architecture section 25, row "Refresh all"):
  `users.refresh_all`, set by migration 0019 for the owner's address only. Every other account
  keeps its turn in the daily hundred, as the owner asked.
- **A synced title IGDB punctuates otherwise is found** (architecture section 25, row "Title
  rung"): asked last by its words, compared as before. The owner declined matching a name with
  words missing ("Vampire Crawlers"): a wrong match is worse than asking.
- **Separating a version is built** (7.6; architecture section 25, row "Separating"): the owner's
  answer to Dark Souls II and Scholar of the First Sin standing as one. ADR 001's default that
  joins them stays (section 19, decision 27).
- **A game only I see is built** (11.1; architecture section 25, row "Privacy"). On a public
  shelf its own account now reads its own files (`/api/v1/me/…`), never the public ones.
- **Archiving is built** (7.4; architecture section 25, row "Archive"), and with it two fixes for
  every edit: a library file older than the version asked for is asked for again, and a
  closing panel keeps its version. Checking a flow end to end here: a headless Chromium script
  against `pnpm serve:test` (the made-up owner), since the app's pane, hidden, does not draw.
  Wait for the panel's opening animation before clicking in it: its view transition takes
  the clicks until it ends.
- **The game panel stays on its game** when a change moves it off the shelf (architecture
  section 25, row "Game panel"). To check the library's own behaviour in a browser, the app's pane
  must be showing: hidden, it does not draw, and the new library file is never applied.
- **Dark Souls II and Scholar of the First Sin are one entry** because IGDB makes Scholar an
  expanded game (type 10) of Dark Souls II, and the sync, which cannot ask, takes ADR 001's
  default for one: the same entry. Changing that rule would split Skyrim and its Special
  Edition too, so a way to split one version into a game of its own was offered instead; it
  waits for the owner.

## Earlier: five changes written into the spec, and the add search finds half a word (25 Oct 2026)

- **The add search finds a word still being typed** (the owner: "astral cha -> não acha nada na
  busca. Astral Chain -> acha o jogo correto."). IGDB's `search` matches whole words only;
  beside it a second query asks for names holding every word as typed, and its games follow.
  The IGDB double now matches whole words too, so a test would catch it. Architecture
  section 25 has the rest.
The owner asked, in Portuguese, what status a game with no end gets (Path of Exile, 200 hours,
no longer played), where games they may play one day go, apart from the backlog, and how to
hide a gift from the shelf without deleting it. Then, written down and not built: "sim
escreve no spec", and "Escreve tudo essas coisas no spec, mas não constroi nada ainda", adding
a button that hides every Erotic and Adults Only game, remembered, and a game only they see,
as Steam's private games; and, of Tsukihime on their wishlist, to say they want it on Switch,
not PS4.

- **In the spec, each marked "Not built yet",** with the owner's words: Someday and Retired
  (3.12), hiding adult games (3.13), archiving a game (7.4), wishing for a game on one
  platform (7.5), and a game only I see (11.1). Section 8 says what the data gains, and
  section 19's decisions 15 to 24 are the defaults I chose for them: confirm those with the
  owner before building.
- **The other sections still say what is built.** The status lists in 3.2, 3.7, 4.5, 5.1 and 6,
  the add form in 4.1, the access table in 11 and the shortcuts in 3.11 change when each is
  built; the new sections say how.
- **For whoever builds them:** ESRB's Adults Only needs IGDB's age ratings, which are not
  fetched or cached yet (`src/server/igdb`, then `pnpm fixtures:fetch` by hand for fixtures that
  have one). Hiding adult games is a device choice, so it goes through `preferences.ts` and is
  on `<html>` before the first paint, as 2D or 3D is. A private game must be absent from the
  public library file and every public answer, and reach its own account by `/api/v1/me/…`,
  as a private shelf does.

## Earlier: stores and consoles are named in words, with a few pictures where words are slow (25 Oct 2026)

The owner asked (in Portuguese) for Steam, Nintendo, PlayStation and Xbox icons where they
apply, and pictures where they help, "without going over the top", researched first. The
research ([architecture section 25](architecture.md#25-changes-since-approval)'s first row)
found that none of the four allows its logo here: Nintendo declines every use, Microsoft
forbids its logos and icons without a licence, Sony grants nothing, and Valve only its sign-in
button. Proposed with that, and approved: "Sim, pode construir os cinco itens como proposto,
sem os logos das marcas."

- **Built:** Nintendo's second linking step drawn (`features/platforms/copy-link-picture.tsx`);
  a cartridge icon (`ui/icons.tsx`) and lucide's download arrow on Cartridge and Download, one
  game or all at once; Steam's privacy step and its "not showing your games" problem link to
  Steam's own settings (`STEAM_PRIVACY_SETTINGS`, a tab of its own); `/privacy` ends with
  "Trademarks"; the list says Physical, not Disc (`Library.formatShort` is gone).
- **Deliberately not:** a logo anywhere, a mark beside a platform shelf's name, its tab, a box,
  a list row or a filter value (the case's shape and plastic already say the platform, and the
  library's script has 0.3 KB left), a picture on the landing page.
- **For PlayStation and Xbox, when they are built:** name them in words, as Steam and Nintendo
  are; `AGENTS.md`, "Icons".
- **`serve:test` takes its port from `BASE_URL`** (3300 unless set), so a worktree can be
  served and verified beside a checkout that holds 3300: `BASE_URL=http://localhost:3311 pnpm
  verify --skip-browser`.

## Earlier: every browser test passes, and the library is back to 90 (24 Oct 2026)

The owner, of the library at 89 on Lighthouse: "yes look into it. but apart from that. run
all the browser tests too to see if these changes broke anything."

- **Every browser test, in all nine projects,** with `pnpm verify --skip-linux` (Docker is not
  installed on this computer, so no Linux pass): 63 failed, all one check, every control at
  least 24 by 24 pixels, on every page. It was the footer's link to /privacy, added with the
  Steam sync after the last full run; it is now 24 pixels tall, as the account link beside it.
  Then 2,571 passed and none failed, the tests that change the library among them (they wait
  for the reading ones, so 225 had not run). #34 to #36 broke nothing.
- **The library at 8 times:** 88 to 90, the wall 91 to 93. Architecture section 25's first
  row says what was changed and how it was found. The library is at its edge still.
- **To profile it again:** build once with `productionBrowserSourceMaps: true` for names, or
  with `next build --profile` for React's own tracks (render, commit and cascading updates,
  per lane) in a Chrome trace, and load the page with Lighthouse's phone user agent: the
  server sends a phone 12 boxes, not 48. Put the config back before committing.
- **The placing page's intro is one sentence,** what the page is for: it explained all of its
  behaviour, which using it shows (the owner: "So explica pra que serve e ponto"; spec 4.5).
- **Icons for the stores and consoles** were a session of their own: it researched the brands'
  rules (none lets its logo be used here but Valve's sign-in button) and proposed five small
  changes without logos, approved and built since (above).
- **Next,** as ADR 003 lays out: PlayStation and Xbox, then step 10, the final review, ⏸.

## Earlier still: "Not this game" fixes a game the sync matched wrong (24 Oct 2026)

The owner: "Yes, build 'Não é este jogo' on the placing page, to fix games the sync matched
wrong while keeping the copy and the hours." [Spec 4.5](spec.md#45-placing-what-a-sync-brought-in)
says what it does; architecture section 25's first row, why it is built so.

- **On the placing page,** a row still waiting has "Not this game": the sync lists' `FindIt`
  (now `features/platforms/find-it.tsx`, shared) searches IGDB for its title, and the pick
  is `PUT /api/v1/entries/{id}/game`. The page then reads the list again, keeping the rows
  given a status on this visit.
- **On the server,** `rematch` in `services/adding.ts` fetches the record and asks
  `proposeGrouping` where it goes, leaving the entry's own (wrong) records out; `rematchEntry`
  in the store does it in one transaction: the entry takes the record as its primary, or
  folds into the game already on the shelf (copies joined or fed, hours recomputed, the
  manual hours, tags, status, rating and notes it lacks moved over). The sync's items name the
  new record, so a sync keeps it. It spends the hour's IGDB allowance as an add does.
- **Seen with the test doubles** (headless Chromium, `serve:test`): see the pull request.
- **Not seen:** the owner's own list on production; the click is theirs.

## Before that: a placed game stays on the placing page (24 Oct 2026)

The owner, having used the placing page: "não quero que o jogo desapareça depois de eu colocar
um status nele imediatamente [...] Se eu atualizar a pagina e voltar pro organize seus jogos ai
beleza". [Spec 4.5](spec.md#45-placing-what-a-sync-brought-in) says what it does now.

- **In `place-games.tsx` only:** the statuses given on this visit are kept beside the list
  (`given`), each row's statuses are `ToggleChip`s (pressed, with a tick), another status is
  one tap, and the pressed one tapped again writes `unsorted`. The server's answer is the same:
  opening the page again lists only what is still unsorted. One game's status no longer
  says anything in a notice (it is in sight); many at once still do, with Undo, which writes
  each game's earlier status back, one `PATCH /entries` per status. "Select all" and "under an
  hour" count only the games still waiting.
- **Lighthouse from #34 still to measure on a quiet machine:** verify read the library at 89
  while the machine was busy; main, measured right after, read 84, and the branch again 86.

## Done: a new shelf is set up on a page of its own (24 Oct 2026)

The owner asked for an onboarding page, and for something saying how many games have no
status, "mas não quero que vc fique adicionando botões a torto e a direito". Researched first
(Nielsen Norman Group on tutorials and indicators, Shopify's setup guide, GitHub's Primer),
proposed with a sketch, and approved: "Sim, pode começar como proposto." What it does is
[spec 4.6](spec.md#46-setting-a-new-shelf-up); why it is built so, architecture section 25's
first row.

- **`/account/start`, "Set up your shelf"**, where sign-up now leads (it used to open the
  empty shelf), and where the empty shelf's second button goes ("Bring your games from a
  platform", which went to the account page). Two steps, each checked off by what is true:
  the platform cards, then the way to placing. "See my shelf" ends it.
- **The cards are the account page's** (`PlatformCards`, split out of `Platforms`). On this
  page a card leaves "N games to place" to step 2. Steam's sign-in started here comes back
  here: `back=start` rides in the return address Steam signs (`server/sync/connect.ts`), and
  anything else there means the account page.
- **`GET /api/v1/me/tally`** (`readStanding`): the count per status and the version, no games.
  Read again whenever a card's counts move.
- **On the shelf, one line under the status row**, "Place the 180 games with no status"
  (`PlaceWaiting`), whenever any game is unsorted, whatever the filter, in place of the
  button that showed only while Unsorted was pressed. On a phone Unsorted is past the row's
  edge, which is why the owner could not find the way. Counted by `unsortedOnShelf` in
  `domain/library/view.ts`.
- **Deliberately not added:** a badge in the header (leaving games unsorted is allowed, so it
  would never go), a banner on the shelf, a menu item for the page, a tour.
- **Fixed on the way:** a card said "Last synced in 2 seconds" when the server's clock ran
  ahead; it is clamped to now.
- **Seen with the test doubles** (headless Chromium, a new account made through the real
  sign-up on `serve:test`): sign-up lands here; the empty shelf leads here; Steam linked from
  here comes back here and its first sync fills step 1 (1 game left waiting for an answer
  keeps it open); step 2 led to placing, one game placed, and the count here moved to "24 of
  your 25"; the shelf's line, with and without a filter, leads to placing. Both themes, both
  languages, a desktop and a phone, no sideways scroll, no console error. JavaScript budgets
  unchanged: library 274.7 of 275 KB.
- **Not seen:** on production, nobody's sign-up (an assistant makes no accounts there), and
  the owner's shelf line with their real count. Browser tests: `accounts.writes.spec.ts`
  now expects the new landing, but no Playwright test runs until the MVP.
- **Not built, and asked about:** fixing a game a sync matched to the wrong IGDB record
  ("Não é este jogo" on the placing page, keeping the copy and its hours). Today the way is to
  remove it and add the right one by hand, which loses the source's hours.
- **Lighthouse was not measured on a quiet machine:** see the section above.

## Done: the page for placing a sync's games is built (24 Oct 2026)

The owner's ask from 23 Oct 2026 (below, "Next: the review of unsorted games"), started with
"Usa o de 0-10 que a gente já tem. Pode começar": the rating is the editor's, out of ten, not
Minimap's stars. What it does is [spec 4.5](spec.md#45-placing-what-a-sync-brought-in); why it
is built so, architecture section 25's first row.

- **`/account/unsorted`**, drawn in the browser for the account signed in, as the account
  page is. Each platform's card links to it ("240 games to place": that source's games still
  unsorted, `counts.unsorted`), and so does the shelf while Unsorted is pressed in the status
  row ("Place these games"; since replaced by a line under the row, above).
- **Its reads and writes:** `GET /api/v1/me/unsorted` (`readUnsorted` in
  `server/library/read.ts`: the unsorted games with each source's minutes and last play, and
  the tally, in one batch); one game's status or rating through the editor's own `PATCH
  /entries/{id}`; many at once through the new `PATCH /entries` (`setStatuses` in the store,
  one transaction, one version). No new table, no migration.
- **Shared with the editor:** `SavedRating` moved to `features/owner/fields.tsx`, and the
  rating's slider takes a `tabIndex` (a row not in focus keeps its controls out of the Tab
  order). Passing `tabIndex={undefined}` to Radix's thumb would have taken away its own stop:
  only a value given replaces it.
- **Seen with the test doubles** (headless Chromium; the sample owner, Steam linked, 31 games
  put back to Unsorted through the API, since the sample shelf already had every Steam game
  and a sync never changes a status): both themes, both languages, a desktop and a phone (no
  sideways scroll at 390 px), one game placed and taken back with Undo, the three under an
  hour selected, the arrows and Tab through the list, the card's and the shelf's links. No
  console error. JavaScript budgets: library 274.7 of 275 KB (from 274.5: the shelf's link),
  home 209.6, trophies 207.8, game page 215.9.
- **Not seen:** the owner's own list on production (the click is theirs, as on the Nintendo
  card). Browser tests for the page are not written: they wait for the MVP, as every
  Playwright test does.
- **Next,** as ADR 003 lays out: PlayStation and Xbox, then step 10, the final review, ⏸.

## Done: Nintendo is built ([#29](https://github.com/ldallacqua/shelf/pull/29)) and linked on production

After the review of #26 below, the owner chose the route for Nintendo: "Build Nintendo from
the Store app's play history: I sign in on Nintendo's own page and Shelf keeps the session
token, encrypted. Fix the #26 findings first." Not the friend code (Exophase's way: it needs
a Nintendo account of Shelf's own on the phone app's private API, sees only the capped,
recent play activity, and is no sign-in). What was built and why is ADR 003, "Built:
Nintendo"; how it looks and behaves is spec 4.4.

- **The first real link worked (24 Oct 2026).** The owner pasted `PLATFORM_TOKEN_KEY` into
  Vercel, production was redeployed with it, and the owner linked their Nintendo account. The
  real play history listed 38 games; 24 matched. The owner expected games on the shelf: none
  go there before Cartridge or Download, and the card said "Up to date" with 38 waiting, and
  mixed the matched games with the unmatched ones. [#30](https://github.com/ldallacqua/shelf/pull/30)
  fixed what that showed:
  - Nintendo's spellings (ADR 003, "Nintendo's names, as IGDB writes them"): an en dash where
    IGDB has a hyphen or a colon, and "Nintendo Switch 2 Edition" or "for Nintendo Switch" at
    the end. Six more should match at the next sync (migration 0011 has it look again).
    **A Switch 2 Edition is its own record where IGDB keeps one**, the owner's choice: "como o
    shelf é uma estante e vc pode ter o jogo tanto do switch 2 quanto no pc".
  - The owner's ask for the list: "Mostre tudo o que preciso escolher cartucho ou download
    primeiro. Depois as opções que ele não achou". The matched games come first; the rest
    follow under "Shelf could not find these N games". The card says how many wait.
  - Left for the owner's answers: YouTube and the two "Nintendo Classics" apps (Not a game);
    Devil May Cry 3 Special Edition, DEAD OR ALIVE Xtreme 3 Scarlet, This War of Mine:
    Complete Edition, Vampire Crawlers and one more, which need Find it. Resident Evil 4 (2011)
    and Devil May Cry 1 and 2 (2012) are IGDB's records of the HD versions Switch has.
  - After #30 deployed, the owner's list matched 30 of 38, the six expected. Warframe came
    twice, under two title ids; [#31](https://github.com/ldallacqua/shelf/pull/31) shows such
    a game as one row, answered once, and counts it once.
  - The owner then saw a row's buttons come back for a second before it left the list;
    [#32](https://github.com/ldallacqua/shelf/pull/32) takes it off the list the moment it is
    answered, and puts it back only if the answer fails.
- **`PLATFORM_TOKEN_KEY`** ([setup F](setup.md#f-nintendo-sync)) seals Nintendo's session.
  Never change it now that the owner has linked Nintendo.
- **An assistant never signs in to Nintendo.** The sign-in, the token exchange and the play
  history follow ns-play-history (read 24 Oct 2026, last changed 7 Oct 2026), and the tests
  answer with a double. The first real link confirmed the code exchange, the nickname on the
  card ("Conectado a Dall'Acqua") and the play history. Still unconfirmed: the console codes
  `WUP`, `CTR` and `KTR` (guesses; a game on an unknown code is matched on all of Nintendo's
  consoles), and a session Nintendo ends (`signed-out`). If the card says Nintendo did not
  answer, `server/sync/nintendo.ts` is the place to look.
- **Locally,** with the test doubles on (`pnpm serve:test`), "Sign in on Nintendo's page" opens
  a stand-in page whose "Select this account" button links to the made-up account
  (`fixtures/nintendo/play-history.json`): copy its link and paste it into the card.
- **Lighthouse on #30, with #29 in it** (the computer quiet this time; on #29 itself it was
  busy with a game and every page read low): home 91, library 85, wall 86, game page 95, the
  near misses of step 9 (91, 83, 85, 95). Nintendo cost the pages nothing. The JavaScript
  budgets did not move (library 274.5 of 275 KB).
- **Then: the review of unsorted games** (below), built since (above).

## Done: #26 reviewed (24 Oct 2026)

[#26](https://github.com/ldallacqua/shelf/pull/26) was merged without its last checks; they
were run on 24 Oct 2026. `pnpm check` passed on `main`; with the test doubles, in both themes,
both languages and on a phone, "Left out" says Wallpaper Engine is software on Steam, Unsorted
is in the status row only on a shelf with unsorted games, wall tiles and list rows carry the
Inbox mark (a box on the shelf carries no mark for any status; its name says it), the editor
offers and saves Unsorted, and 3D draws it as backlog; no console error. Lighthouse at 8×:
home 91, library 83, wall 85, game page 95, as at step 9. On production, 500 of 518 games
were unsorted, the software was off the shelf, FreshWomen: Season 2 had matched, and eight
add-ons sold as games (Kane's Wrath, Zero Hour, Portal with RTX…) were games.

Fixed after it ([#28](https://github.com/ldallacqua/shelf/pull/28)): the
store was asked again at every step while it was down (now once a read); Unsorted left the
status row under a filter that matched none of them, and sat past a phone's edge when pressed;
Black Ops II's zombies, whose store page names no game, did not join Black Ops II (it now
joins the game whose title starts its own; migration 0009 asks the store again about Steam
games nothing matched). Seen and not from #26: in headless Chromium the phone's wall draws
the shelf's title over the top of its first row, for any filter; look on a real phone.

Still the owner's: on the account page, nothing left unclassified and Modern Warfare 2's
multiplayer hours on its copy (an assistant cannot read Turso); and the two choices below.

### What the review was asked to do (the owner's ask, 23 Oct 2026)

[#26](https://github.com/ldallacqua/shelf/pull/26) (Unsorted, and Steam's store leaving out
what is not a game) was merged and deployed without the last checks, because the assistant
that built it was running out of room: "just merge everything to main ... another AI will
take the work of reviewing this". Do these before anything below, and fix what they find:

- **Read the diff** (`git show 30d2bf8`) against ADR 003's "Built: Steam" and spec 4.4.
- **Look at it** with the test doubles (`pnpm serve:test`, port 3300): sign in as the
  made-up owner, link Steam from the account page, and check, in both themes, both languages
  and on a phone:
  - "Left out" lists Wallpaper Engine as "Software on Steam";
  - the status row shows Unsorted with a count only while there are unsorted games;
  - an unsorted game's box, wall tile and list row carry the Inbox mark;
  - the editor offers Unsorted among the statuses;
  - the 3D shelf draws unsorted games as it draws backlog ones.

  Pictures come from a headless Chromium script (the desktop app's browser pane pauses
  while hidden; see "Things learned" below).
- **Measure Lighthouse at 8×** (`LIGHTHOUSE_SLOWDOWN=8 pnpm perf:lighthouse`), step 9's
  measure. It was stopped before it finished; the 19× run missed as on main.
- **On production, after the owner's next sync** (Sync now, or the daily job at 07:00 UTC):
  - the store was asked about every app (no item left with `kind` null);
  - software, demos and playtests moved to "left out";
  - Modern Warfare 2's multiplayer and Black Ops II's zombies matched their games, and
    their hours joined those copies;
  - FreshWomen – Season 2 matched.

  An assistant cannot read Turso; the owner's account page and the public
  `/api/v1/u/lucas/library` show it. Right after the migration, the first page of that
  answer was 49 unsorted games and 1 playing, of 471.
- **Two choices to confirm with the owner:**
  - A game played on Steam in the last two weeks still starts as Playing, not Unsorted.
  - The add-game forms and the editor offer Unsorted, since every list of statuses does.

## The review of unsorted games (the owner's ask, 23 Oct 2026; built 24 Oct 2026, above)

After the owner's first real Steam sync: "Recently imported games
from a platform should not be assigned to backlog. They are actually in a waiting state, or
unassigned state, we will in a next step, add a review experience where we will allow the
user to assign a score to the game and which status they have. Like what minimap does
(document this so the other AI won't forget to do it)".

- **Done already** (the pull request after #25): the waiting state. `unsorted` is a sixth
  status, last in `statuses` so the data files' numbers for the others did not move. A sync
  puts a new game there (or in Playing, if played these two weeks), never in the backlog.
  Migration 0008 moved the owner's synced games that were still in the backlog the sync had
  put them in, untouched since, to it. It has the Inbox icon, shows in the status row only
  while a shelf has some, draws like a backlog game in 3D, and is `status:unsorted` in the
  filter language. Every place that lists statuses lists it, the editors included, so a game
  can be put back to Unsorted.
- **The review page, built since** (above): [spec 4.5](spec.md#45-placing-what-a-sync-brought-in).
  The model is Minimap's "Rate my games" (`minimap.net/rating/rateLibrary`, the owner's
  screenshot): a list of the library's games, longest played first, each a card with its
  cover, title, hours on the platform, five stars for a rating and one button per status;
  beside it, a tally per status and the unplaced count. Shelf's own version: one row per
  unsorted game, my rating and a status one tap each, saved at once; a placed game leaves the
  list, with Undo; select many and give them one status; reached from the Steam card and
  from Unsorted in the status row. The editor's rating and status controls, the existing
  `PATCH /entries/{id}` write and `useAccount()` are what it needs; no new table.
- **Then Nintendo:** built since, above.

## Steam is done and in use; Nintendo was parked, then built (above)

**If you are picking this up to do Nintendo, read this section, then ADR 003 whole (its last
part, "Built: Steam", is how a source is added), then `src/server/services/sync.ts`.**

- **The owner asked for sync after step 9** (23 Oct 2026): "start with steam. deploy, then
  let's do nintendo", built so that every platform fits, Steam and Nintendo first "since they
  are the platforms I use". Step 10, the final review, waits until sync is done.
- **Steam is built and deployed** ([#24](https://github.com/ldallacqua/shelf/pull/24), then
  this pull request: Valve's button, and Steam offered on an empty shelf). [ADR
  003](adr/003-platform-sync.md), "Built: Steam"; spec 4.4. Linked on the account page
  (Platforms) through Steam's own sign-in; a first sync puts every matched game on the shelf
  as a PC digital copy with Steam's hours; a list of what needs an answer; Sync now and a
  daily job (`/api/cron/sync`, 07:00 UTC); `/privacy`, which Steam's terms ask for; the
  landing page's part 5 and a question in its FAQ.
- **The owner uses it.** Production has `STEAM_API_KEY` and `CRON_SECRET` (both set 23 Oct
  2026, and deployed), so the daily refresh and the daily sync run. The owner linked their
  own Steam account; an assistant never signs in to Steam. Locally, with the test doubles on,
  "Sign in through Steam" comes straight back with a made-up account (`MOCK_STEAM`), whose
  games are `fixtures/steam/owned-games.json`, and the store's word on each is
  `fixtures/steam/store-items.json`.
- **What the first real sync taught** (the owner's list of what needed an answer, 23 Oct
  2026). Being an adult game was never the reason: IGDB serves those (HuniePop matches by
  its Steam id). What was left was, in order of size: games IGDB does not have at all
  (FlipWitch, Scarlet Maiden, Sin Spire and others: nothing to match, so Find it cannot find
  them either; adding a game IGDB lacks is not built); software (Wallpaper Engine, ShareX,
  Lossless Scaling); demos and playtests; modes Steam sells as their own app (Modern Warfare
  2's multiplayer, Black Ops II's zombies); and one season IGDB files as a DLC. The pull
  request after #25 answers all but the first: Steam's store (`IStoreBrowseService/GetItems`,
  public) says each app's type, so software, demos, playtests and media are left out by
  themselves, a mode joins its game, and an add-on IGDB alone holds a store id for is taken
  as the game (ADR 003, "Built: Steam").
- **The button is Valve's own** (`public/platforms/sign-in-through-steam.png`, `sits_01.png`
  from steamcommunity.com/dev, downloaded with the owner's yes, 23 Oct 2026): Valve asks for
  it where its sign-in is used, and it says the site is not associated with Valve.
- **Things learned on the way, worth knowing for the next source:**
  - A route handler that reads nothing from its request is built ahead by Next.js, once:
    `GET /me/platforms` would have answered every visitor as signed out. It calls
    `connection()` first; a test that calls it outside a request mocks that.
  - next-intl's `relativeTime` needs a "now" in a client component (`useNow`), or it logs an
    error on every draw.
  - The browser pane in the desktop app pauses animation frames, idle callbacks and
    scroll-driven reveals while it is hidden: the game editor and the landing parts then
    never appear. Pictures were taken with Chromium from a script instead (headless pages
    count as visible).
  - Python writing files on this computer can leave Windows line endings: `pnpm check`'s
    Prettier step finds them; `prettier --write` fixes them.

### Nintendo, parked (the owner, 23 Oct 2026), as it stood before it was built

"let's park nintendo, we need to review how other places does it because I know for example
that exophase.com allows connecting nintendo just by passing the friend code." The owner
resumes it with another assistant. What is known so far:

- **Exophase** links a Nintendo account by its **friend code** alone (the owner's profile
  there lists it under Nintendo) and shows the owner's Switch and Switch 2 games with hours
  played and the day last played, for 38 games (screenshots the owner sent, 23 Oct 2026).
  How it gets that from a friend code is the first thing to find out: it is the lead the
  owner wants followed. Whatever it is, check what it asks of the person (a friend request
  to a bot account? settings on the console?), whether it gives hours and last played for
  every game or only recent ones, and how often it updates.
- **Nintendo's own play history.** Since late 2025 the Nintendo Store app shows play history
  for every game: first and last played and time played, back to 3DS and Wii U ([Seth
  Larson](https://sethmlarson.dev/nintendo-switch-play-activity-ocr)). A community script,
  [ns-play-history](https://github.com/sibylsea-hub/ns-play-history), reads it: the person
  signs in on Nintendo's own page with the Store app's client id, copies the "Select this
  account" link, and the script exchanges it at `accounts.nintendo.com` for a session token
  (about two years) and access tokens (15 minutes), then reads
  `app-api.znej.nintendo.com/api/v2.0/users/me/play_histories`. Unofficial; Shelf would keep
  that session token, encrypted.
- **The Switch's own "20 most recent" list** (console and Nintendo Switch app) and the
  Parental Controls app's daily reports are too partial to sync from.
- **The fallback** ADR 003 planned: an import of pasted titles, every match confirmed.
- **Whichever it is,** a Nintendo source is "played", not "owned": a cartridge and a download
  look the same, so each game asks once (cartridge, download, not mine) before its copy is
  made (ADR 003, decision 2). IGDB holds no Nintendo store ids, so matching is the title rung
  on the Switch platforms, and ADR 003 asks for every Nintendo match to be confirmed. What
  is already in place for it: `nintendo` in `domain/sync/sources.ts` (not ready, evidence
  `listed`: change it to `played` if the source reports play), the `format` column and the
  `pending` decision in `source_items`, and the `answer` service. Still to build: the format
  question in the lists (answerable for many at once), the adapter, and its link.
- **Then PlayStation and Xbox,** as ADR 003 lays out.

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
