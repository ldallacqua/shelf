/**
 * The example shelf's choices that the page and `pnpm landing:demo` share.
 */

/**
 * The game the page shows owned many ways: one game, standing once, with a
 * copy on three platforms in both formats. The seed gives it two; the
 * script adds the third, on a platform it came out on.
 */
export const EVERY_COPY = 'the-elder-scrolls-v-skyrim'

/**
 * "Ask it anything": the filters that switch on in turn, each narrowing the
 * one before. Together they ask for something short, not yet started, that
 * plays on a Switch.
 */
export const ASK_STEPS = [
  { key: 'unplayed', query: 'status:backlog' },
  { key: 'short', query: 'length:<10' },
  { key: 'switch', query: 'owned:switch' },
] as const

export type AskStep = (typeof ASK_STEPS)[number]['key']

/** Filters a visitor can try with one click, beside the ones that play in turn. */
export const ASK_TRIES = ['genre:platform year:<2000', 'rating:>=9', 'format:digital']
