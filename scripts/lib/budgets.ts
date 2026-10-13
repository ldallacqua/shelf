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
  // Step 1: measured 204.8 KB. Shell, plus the foundations demos.
  { path: '/en', name: 'Home', kilobytes: 215 },
  // Step 1: measured 198.4 KB. Shell only.
  { path: '/en/library', name: 'Library', kilobytes: 208 },
  // Step 1: measured 198.4 KB. Shell only.
  { path: '/en/trophies', name: 'Trophies', kilobytes: 208 },
]

/**
 * Lighthouse, mobile profile, with its throttling really applied (a slow 4G
 * connection and a processor four times slower), so the paint times are
 * measured. Its default mode estimates them from an unthrottled run instead,
 * and against a local server that estimate assumes the page's text waits for
 * all of its JavaScript, which it does not.
 */
export const lighthouseBudgets = {
  paths: ['/en', '/en/library'],
  performance: 90,
  accessibility: 100,
  largestContentfulPaintMs: 2500,
  cumulativeLayoutShift: 0.1,
}

/** Text that only appears in three.js. It must not be in any page's first load. */
export const THREE_MARKERS = ['THREE.WebGLRenderer', 'WebGLRenderer: ']
