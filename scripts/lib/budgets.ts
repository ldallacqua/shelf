/**
 * Performance budgets. Sizes are kilobytes as sent over the network (compressed).
 *
 * The JavaScript numbers are a ratchet, not a target picked in advance: each
 * is what the page measured when it was last changed on purpose, plus a
 * little room. A page that grows past its number fails the build, and raising
 * a number is a change someone has to make and explain here.
 *
 * For scale, measured at build step 1: React and Next.js themselves are about
 * 125 KB of every page, and the Radix menu and button-group primitives the
 * header uses are about 45 KB.
 */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3300'

export const javascriptBudgets: { path: string; name: string; kilobytes: number }[] = [
  // Step 3: measured 198.0 KB. Shell, plus the foundations demos. (Messages
  // compiled at build time took 9 KB of message parser off every page.)
  { path: '/en', name: 'Home', kilobytes: 205 },
  // Step 3: measured 228.9 KB. The shell (191 KB), plus 38 KB for the library
  // itself: the shelf, the wall and the list, the sheet a game opens in, the
  // address state, and the decoder for the blurred cover previews.
  // Step 4: measured 233.3 KB, 4.4 KB more: the 2D and 3D buttons, the stage
  // that switches between them, and the loader that fetches the 3D shelf. The
  // 3D shelf itself is not in this number; it has its own budget below.
  // Step 5: measured 256.2 KB, 23 KB more: the filter language (parser, writer,
  // the index of bitmaps, counts), the search field, the status row, the chips,
  // the sort, the filter panel and the smart shelves. Fetching the panel, the
  // shortcuts list and the save sheet only when first opened saved 2.7 KB, not
  // worth a wait on a phone's first open; the rest is needed on arrival.
  { path: '/en/library', name: 'Library', kilobytes: 262 },
  // Step 3: measured 191.3 KB. Shell only.
  { path: '/en/trophies', name: 'Trophies', kilobytes: 198 },
]

/**
 * The 3D shelf's own bundle: what a desktop downloads when 3D opens, on top
 * of the library page. A target set in advance (architecture, section 14),
 * not a ratchet: three.js alone is about 130 KB of it.
 */
export const threeDBudget = { path: '/en/library', kilobytes: 300 }

/**
 * Lighthouse, mobile profile, with its throttling really applied (a slow 4G
 * connection and a slowed processor), so the paint times are measured. Its
 * default mode estimates them from an unthrottled run instead, and against a
 * local server that estimate assumes the page's text waits for all of its
 * JavaScript, which it does not.
 */
export const lighthouseBudgets = {
  paths: ['/en', '/en/library', '/en/library?view=wall'],
  performance: 90,
  accessibility: 100,
  largestContentfulPaintMs: 2500,
  cumulativeLayoutShift: 0.1,
}

/**
 * How many times to slow this machine's processor so that it stands in for
 * the mid-range phone Lighthouse scores against.
 *
 * Lighthouse's default, four times, assumes a fast desktop. It measures the
 * machine on every run (the "benchmark index") and says to slow a weaker
 * machine less: docs/throttling.md in its repository, "Calibrating
 * multipliers". The same four times on a CI runner, which is about a third as
 * fast as a desktop, emulates a much slower phone than the one the targets
 * are written for: this library scored 96 on a desktop and 72 on CI from the
 * same build.
 *
 * The steps are those of the Lighthouse team's own calculator
 * (lighthouse-cpu-throttling-calculator.vercel.app), read from its source in
 * October 2026. A machine below 150 cannot stand in for that phone at all.
 *
 * The benchmark times one core doing one thing. That describes a desktop
 * with cores to spare. It overstates a CI runner, whose two cores are shared
 * by the server, the browser and Lighthouse itself: by its benchmark (2480)
 * a runner should be slowed 8 times, and the home page then blocks for
 * 468 ms, against 177 ms on a desktop slowed by its own benchmark. At
 * Lighthouse's stock 4 times the runner gives 180 ms. So CI sets
 * LIGHTHOUSE_SLOWDOWN=4, and the home page's blocked time, about 180 ms,
 * is the check that the two still agree.
 */
export const cpuSlowdownFor = (benchmarkIndex: number): number | undefined => {
  if (!Number.isFinite(benchmarkIndex) || benchmarkIndex < 150) return undefined
  if (benchmarkIndex >= 1300) return 3 + (benchmarkIndex - 1300) / 233
  if (benchmarkIndex >= 800) return 2 + (benchmarkIndex - 800) / 500
  return 1 + (benchmarkIndex - 150) / 650
}

/** Text that only appears in three.js. It must not be in any page's first load. */
export const THREE_MARKERS = ['THREE.WebGLRenderer', 'WebGLRenderer: ']
