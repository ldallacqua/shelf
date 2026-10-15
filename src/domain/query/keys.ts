import { families } from '@/domain/platforms/platforms'
import { formats, kinds, statuses } from '@/domain/library/values'

/**
 * What can be filtered (spec 5.1), by the key the filter language uses.
 * Keys are English in both languages, so a link works for everyone; the
 * panel's labels are translated.
 *
 * A key is one of three kinds:
 * - a **list**: the values are words (`genre:rpg,adventure`);
 * - a **number**: compared as the interface shows it, so `rating:>=8` is
 *   out of ten and `hours:<10` is in hours (`year:2015..2020`);
 * - a **date**: a year, a month or a day, each standing for the whole of it
 *   (`completed:2025-06..2025-08` is June to August).
 */

export const listKeys = [
  'status',
  'owned',
  'format',
  'tag',
  'has',
  'is',
  'genre',
  'theme',
  'keyword',
  'mode',
  'perspective',
  'platform',
  'kind',
  'franchise',
  'series',
  'developer',
  'publisher',
] as const
export type ListKey = (typeof listKeys)[number]

export const numberKeys = ['rating', 'hours', 'copies', 'year', 'igdb', 'length'] as const
export type NumberKey = (typeof numberKeys)[number]

export const dateKeys = ['completed', 'added'] as const
export type DateKey = (typeof dateKeys)[number]

export type FilterKey = ListKey | NumberKey | DateKey

export const filterKeys: readonly FilterKey[] = [...listKeys, ...numberKeys, ...dateKeys]

export const isListKey = (key: string): key is ListKey =>
  (listKeys as readonly string[]).includes(key)
export const isNumberKey = (key: string): key is NumberKey =>
  (numberKeys as readonly string[]).includes(key)
export const isDateKey = (key: string): key is DateKey =>
  (dateKeys as readonly string[]).includes(key)
export const isFilterKey = (key: string): key is FilterKey =>
  isListKey(key) || isNumberKey(key) || isDateKey(key)

/** Whose the information is: mine, or IGDB's. The panel shows mine first. */
export const mineKeys: readonly FilterKey[] = [
  'status',
  'owned',
  'format',
  'copies',
  'rating',
  'hours',
  'completed',
  'added',
  'tag',
  'has',
  'is',
]

export const hasValues = ['notes', 'rating', 'playtime', 'cover'] as const
export type HasValue = (typeof hasValues)[number]

export const isValues = ['featured'] as const

/**
 * The keys whose values are a fixed list Shelf itself defines. Any other
 * value for them cannot be understood. Every other list key takes names from
 * the library, and a name nothing carries simply matches nothing.
 */
export const closedValues: Partial<Record<ListKey, readonly string[]>> = {
  status: statuses,
  format: formats,
  kind: kinds,
  has: hasValues,
  is: isValues,
}

/** Platform families, which `owned:` and `platform:` take as well as a platform's own key. */
export const platformFamilies: readonly string[] = families

/**
 * Shorter words for IGDB's longest names, by IGDB id, so a filter reads as a
 * person would write it: `genre:rpg`, not `genre:role-playing-rpg`. IGDB's
 * own word is still understood, and is written back as the short one.
 */
export const shortNames: Partial<Record<ListKey, Readonly<Record<number, string>>>> = {
  genre: {
    11: 'rts',
    12: 'rpg',
    16: 'tbs',
    25: 'hack-and-slash',
    26: 'trivia',
    35: 'card-and-board',
  },
  theme: { 41: '4x' },
  mode: { 3: 'co-op', 5: 'mmo' },
  perspective: { 3: 'isometric', 7: 'vr' },
}

/** IGDB's own words for the short ones above, so an address written either way is understood. */
export const longNames: Partial<Record<ListKey, Readonly<Record<string, string>>>> = {
  genre: {
    'real-time-strategy-rts': 'rts',
    'role-playing-rpg': 'rpg',
    'turn-based-strategy-tbs': 'tbs',
    'hack-and-slash-beat-em-up': 'hack-and-slash',
    'quiz-trivia': 'trivia',
    'card-and-board-game': 'card-and-board',
  },
  theme: { '4x-explore-expand-exploit-and-exterminate': '4x' },
  mode: { 'co-operative': 'co-op', 'massively-multiplayer-online-mmo': 'mmo' },
  perspective: { 'bird-view-slash-isometric': 'isometric', 'virtual-reality': 'vr' },
}

/** The word a filter uses for an IGDB name: its short form, or IGDB's slug. */
export const filterWord = (key: ListKey, id: number, slug: string): string =>
  shortNames[key]?.[id] ?? slug
