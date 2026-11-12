/**
 * The landing page grows with the product (AGENTS.md, "The landing page"; spec 15): a feature a
 * visitor would choose Shelf for gets its part there, in the same change. This is the map that
 * holds the two together. Every numbered section of the spec is named here, by its number and
 * title, with the parts of the landing page that show it, or why none does.
 *
 * `coverage.test.ts` fails when the spec gains a section this map doesn't name, when a section
 * here is no longer in the spec, when a part named here isn't on the page, and when a part on the
 * page is shown for nothing. A new feature is a new section of the spec, so the test is the
 * reminder: map it to the part that shows it, built in the same change. `left` is for what a
 * visitor doesn't choose Shelf for (rules, internals, the owner's tools), never to quiet the test.
 */

/** The parts of the landing page, by their elements' ids, top to bottom. */
export const landingParts = [
  'top',
  'features',
  'how',
  'copies',
  'add',
  'sync',
  'views',
  'look',
  'media',
  'desktop',
  'finished',
  'privacy',
  'assistant',
  'start',
  'closing',
  'faq',
] as const
export type LandingPart = (typeof landingParts)[number]

export type Coverage =
  { title: string; shown: readonly LandingPart[] } | { title: string; left: string }

export const landingCoverage: Record<string, Coverage> = {
  '1': { title: 'What Shelf is', shown: ['top', 'features'] },
  '2': {
    title: 'Pages and addresses',
    left: 'Where each page lives; no visitor chooses Shelf for an address.',
  },
  '2.1': { title: 'Settings', shown: ['look', 'privacy', 'sync'] },
  '3': { title: 'The library', shown: ['views', 'top'] },
  '3.1': { title: 'Layout', shown: ['views'] },
  '3.2': { title: 'Words used below', left: 'Definitions for the spec itself.' },
  '3.3': {
    title: 'Shelf in 3D',
    left: 'Behind Experimental views, off by default (issue 63). Shown once it is on for everyone.',
  },
  '3.4': { title: 'Shelf in 2D', shown: ['top', 'views'] },
  '3.5': { title: 'What both shelf views must do', shown: ['views'] },
  '3.6': { title: 'Switching 2D and 3D', left: 'The 3D shelf is experimental, as 3.3.' },
  '3.7': { title: 'Grouping', shown: ['views'] },
  '3.8': { title: 'Wall and List', shown: ['views'] },
  '3.9': { title: 'Trophy wall and stats', shown: ['finished'] },
  '3.10': {
    title: 'Empty, loading and failure',
    left: 'How every page behaves while it waits, not a feature.',
  },
  '3.11': { title: 'Keyboard', left: 'A quality of every page, not a reason to choose Shelf.' },
  '3.12': {
    title: 'Someday and Retired',
    left: 'Two quieter statuses, in the status row only once a game has one (decision 15).',
  },
  '3.13': {
    title: 'Hiding adult games',
    left: 'A device’s content choice in Settings; not shown to visitors on purpose.',
  },
  '4': { title: 'Adding games', shown: ['add'] },
  '4.1': { title: 'One game', shown: ['add'] },
  '4.2': { title: 'Many games', shown: ['add'] },
  '4.2a': { title: 'A game IGDB does not have', left: 'Moderators only (ADR 006).' },
  '4.3': { title: 'When IGDB misbehaves', left: 'Failure handling.' },
  '4.4': { title: 'From a store or console', shown: ['sync', 'faq'] },
  '4.5': { title: 'Placing what a sync brought in', shown: ['sync'] },
  '4.6': { title: 'Setting a new shelf up', shown: ['start'] },
  '4.7': {
    title: 'Hours a store counted',
    left: 'A correction inside Organize; the FAQ’s hours answer says where hours come from.',
  },
  '5': { title: 'Filters', shown: ['how'] },
  '5.1': { title: 'What can be filtered', shown: ['how'] },
  '5.2': { title: 'Combining them', shown: ['how'] },
  '5.3': { title: 'The filter language', shown: ['how'] },
  '5.4': { title: 'Counts', shown: ['how'] },
  '5.5': { title: 'Smart shelves', shown: ['how'] },
  '5.6': { title: 'Speed', left: 'A target, not a feature.' },
  '6': { title: 'Sorting', shown: ['views'] },
  '7': { title: 'Game detail', shown: ['media'] },
  '7.1': { title: 'What is on it', shown: ['media'] },
  '7.2': { title: 'Opening and going back', shown: ['copies'] },
  '7.3': { title: 'Editing', shown: ['media', 'privacy'] },
  '7.4': { title: 'Archiving a game', left: 'Housekeeping on one’s own shelf.' },
  '7.5': {
    title: 'Wishing for a game on one platform',
    left: 'A detail of the wishlist status, which the filters show.',
  },
  '7.6': { title: 'Separating a version', left: 'A correction for a rare grouping.' },
  '7.7': { title: 'Playing a game', shown: ['desktop', 'faq'] },
  '7.8': { title: 'Achievements', shown: ['sync', 'finished'] },
  '7.9': { title: 'Stores', shown: ['copies'] },
  '7.10': {
    title: 'Download sources',
    left: 'Never on the landing page (AGENTS.md, "Download sources").',
  },
  '7.11': { title: 'Scores', shown: ['media'] },
  '7.12': { title: 'Saves', shown: ['desktop'] },
  '8': { title: 'Data model', left: 'Internals: how the data is kept.' },
  '9': { title: 'Themes', shown: ['look', 'faq'] },
  '10': { title: 'Languages', shown: ['top'] },
  '11': { title: 'Access', shown: ['privacy'] },
  '11.1': { title: 'A game only I see', shown: ['privacy'] },
  '12': { title: 'Screen sizes and touch', left: 'A quality of every page.' },
  '13': { title: 'Accessibility', left: 'A quality of every page.' },
  '14': { title: 'Motion', left: 'A quality of every page.' },
  '15': { title: 'Landing page', left: 'The page itself.' },
  '16': { title: 'Speed targets', left: 'Targets, not features.' },
  '17': { title: 'For AI assistants', shown: ['assistant', 'features'] },
  '17a': { title: 'The admin page', left: 'The owner’s alone.' },
  '18': { title: 'Out of scope', left: 'Not built, so not shown.' },
  '19': { title: 'Decisions I made for you', left: 'Decisions, each shown where its feature is.' },
}

/** The parts that hold the page together rather than show one feature: the close and its questions. */
export const frameParts: readonly LandingPart[] = ['closing']

/**
 * Every numbered section of a spec, by number and title: `## 7. Game detail`, `### 4.2a A game…`.
 * Sections without a number (`### Colors`) belong to the numbered one above them.
 */
export const specSections = (spec: string): Map<string, string> =>
  new Map(
    [...spec.matchAll(/^#{2,3} (\d+[a-z]?(?:\.\d+[a-z]?)?)\.? (.+?)\s*$/gm)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  )
