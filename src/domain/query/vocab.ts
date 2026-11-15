import type { ListKey } from './keys'

/**
 * IGDB's fixed vocabularies, by the word a filter uses for each (its short form, or IGDB's
 * slug): the genres, themes, game modes and perspectives, which IGDB names in English only.
 * Shelf says them in the page's language (`Filters.vocab` in `messages/`), as a Brazilian site
 * would: "Corrida", not "Racing" (step 10's review, 01, finding 17). Keywords, franchises,
 * series and companies are names, and stay IGDB's. A word IGDB adds later, and Shelf has no
 * words for yet, is shown as IGDB names it.
 */
export const fixedVocab = {
  genre: [
    'point-and-click',
    'fighting',
    'shooter',
    'music',
    'platform',
    'puzzle',
    'racing',
    'rts',
    'rpg',
    'simulator',
    'sport',
    'strategy',
    'tbs',
    'tactical',
    'hack-and-slash',
    'trivia',
    'pinball',
    'adventure',
    'indie',
    'arcade',
    'visual-novel',
    'card-and-board',
    'moba',
  ],
  theme: [
    'action',
    'fantasy',
    'science-fiction',
    'horror',
    'thriller',
    'survival',
    'historical',
    'stealth',
    'comedy',
    'business',
    'drama',
    'non-fiction',
    'sandbox',
    'educational',
    'kids',
    'open-world',
    'warfare',
    'party',
    '4x',
    'erotic',
    'mystery',
    'romance',
  ],
  mode: ['single-player', 'multiplayer', 'co-op', 'split-screen', 'mmo', 'battle-royale'],
  perspective: ['first-person', 'third-person', 'isometric', 'side-view', 'text', 'auditory', 'vr'],
} as const satisfies Partial<Record<ListKey, readonly string[]>>

export type FixedKey = keyof typeof fixedVocab

/** The message key of a word Shelf has its own words for, or undefined for IGDB's own name. */
export const vocabKey = (key: ListKey, word: string): `vocab.${string}.${string}` | undefined =>
  key in fixedVocab && (fixedVocab[key as FixedKey] as readonly string[]).includes(word)
    ? `vocab.${key}.${word}`
    : undefined

/**
 * Words the Portuguese keeps in English, not loan words a Brazilian reads as Portuguese: marked
 * `lang="en"` as IGDB's own names are, so a voice says them in English (WCAG 3.1.2; step 10's
 * review, 01, finding 40).
 */
const keptInEnglish: ReadonlySet<string> = new Set([
  'point-and-click',
  'hack-and-slash',
  'visual-novel',
  'battle-royale',
  'sandbox',
  'pinball',
])

/** Whether a word of IGDB's fixed vocabularies stays English in every language. */
export const staysEnglish = (word: string): boolean => keptInEnglish.has(word)
