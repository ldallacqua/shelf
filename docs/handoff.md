# Handoff: 14 October 2026

Work moved from the Mac mini to another computer partway through the review pass after
step 3. This note is what the next session needs and cannot get from the code. Read
`AGENTS.md` first, then this.

## Step 4: built, waiting at the ⏸ (branch `build-step-4-3d-shelf`, pull request open)

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
  Tablets keep 3D as a choice; in portrait the wall is small and sits low with empty space
  above, worth a look at step 9.
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
- **Waiting on the owner:** the review at the ⏸, then merging the pull request.
- **Raised by the owner, not scheduled:** syncing owned games from Steam, PlayStation, Xbox
  and Nintendo, each matched to the right IGDB record. The reference app did Steam and
  PlayStation through IGDB's store ids, not Xbox or Nintendo. Sync is out of scope in spec
  section 18, and ADR 001 left room for it on copies. What the fixtures show: of the 232
  sample games, IGDB carries a Steam id on 121, a Microsoft Store id on 106 and a PlayStation
  Store id on 102; no Nintendo store id at all. Proposed: an ADR on sync and matching before
  step 7, so adding games and sync share one way to resolve a store's id to an entry.

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
