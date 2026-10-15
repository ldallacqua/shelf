import { fromHex, toHsl } from '@/domain/color/palette'
import type { LibraryGame } from '@/domain/library/library'
import { statuses } from '@/domain/library/values'

/**
 * Ordering games (spec, section 6). Every order starts from title order, so
 * games with the same value stay in title order. Games with no value for
 * the key come last, whichever way it runs.
 */

export const sortKeys = [
  'title',
  'added',
  'released',
  'rating',
  'igdb',
  'hours',
  'completed',
  'status',
  'length',
  'color',
  'random',
] as const
export type SortKey = (typeof sortKeys)[number]

/** A sort key and its direction. In the address, `-` in front means descending: `sort=-rating`. */
export type Sort = { key: SortKey; descending: boolean }

export const DEFAULT_SORT: Sort = { key: 'title', descending: false }

export const isSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && (sortKeys as readonly string[]).includes(value)

/** Reads `title`, `-rating` and so on. Anything else is the default. */
export const parseSort = (text: string | undefined): Sort => {
  if (!text) return DEFAULT_SORT
  const descending = text.startsWith('-')
  const key = descending ? text.slice(1) : text
  if (!isSortKey(key)) return DEFAULT_SORT
  // A shuffle has no direction.
  return { key, descending: key === 'random' ? false : descending }
}

export const writeSort = (sort: Sort): string => `${sort.descending ? '-' : ''}${sort.key}`

export const sameSort = (a: Sort, b: Sort): boolean =>
  a.key === b.key && a.descending === b.descending

/**
 * The way each key runs when it is first picked: the way a person usually
 * wants it. Newest, highest and longest first; titles, statuses and time to
 * beat from the start, since shortest first is how a backlog is worked.
 */
export const naturalSort = (key: SortKey): Sort => ({
  key,
  descending: ['added', 'released', 'rating', 'igdb', 'hours', 'completed'].includes(key),
})

/** A leading article is ignored: "The Witcher 3" files under W. */
const ARTICLE = /^(the|an|a)\s+/i

/** The text a title is filed under. */
export const titleKey = (title: string): string => title.trim().replace(ARTICLE, '')

const collators = new Map<string, Intl.Collator>()

/** Follows the language's alphabet, ignores case and accents, and reads "2" before "10". */
const collatorFor = (locale: string): Intl.Collator => {
  let collator = collators.get(locale)
  if (!collator) {
    collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
    collators.set(locale, collator)
  }
  return collator
}

/**
 * Games in title order. Same-titled games (Resident Evil 4, twice) go oldest
 * first, and the slug settles anything still tied, so the order never
 * depends on the order the games arrived in.
 */
export const sortByTitle = <Game extends Pick<LibraryGame, 'title' | 'slug' | 'year'>>(
  games: readonly Game[],
  locale: string,
): Game[] => {
  const collator = collatorFor(locale)
  return games
    .map((game) => ({ game, key: titleKey(game.title) }))
    .sort(
      (a, b) =>
        collator.compare(a.key, b.key) ||
        (a.game.year ?? Infinity) - (b.game.year ?? Infinity) ||
        (a.game.slug < b.game.slug ? -1 : a.game.slug > b.game.slug ? 1 : 0),
    )
    .map((item) => item.game)
}

/** A day as a number that sorts: `2024-03-01` is 20240301. */
const dayValue = (day: string | undefined): number | undefined =>
  day === undefined ? undefined : Number(day.replaceAll('-', ''))

/**
 * Where a cover's main color falls in a rainbow: by hue, red first. Grays,
 * which have no hue to speak of, follow every color, dark to light.
 */
export const colorValue = (game: Pick<LibraryGame, 'colors'>): number | undefined => {
  const accent = game.colors?.[0]
  if (!accent) return undefined
  const rgb = fromHex(accent)
  const [hue, , lightness] = toHsl(rgb)
  // Chroma, not saturation: a near-black can be fully "saturated" and still read as gray.
  const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255
  return chroma < 0.12 ? 360 + lightness : hue
}

/** A well-mixed 32-bit number from text (FNV-1a, then MurmurHash3's finish). */
const hash = (text: string): number => {
  let value = 0x811c9dc5
  for (let at = 0; at < text.length; at += 1) {
    value ^= text.charCodeAt(at)
    value = Math.imul(value, 0x01000193)
  }
  value ^= value >>> 16
  value = Math.imul(value, 0x85ebca6b)
  value ^= value >>> 13
  value = Math.imul(value, 0xc2b2ae35)
  value ^= value >>> 16
  return value >>> 0
}

type Valued = (game: LibraryGame, seed: string) => number | undefined

const VALUES: Record<Exclude<SortKey, 'title'>, Valued> = {
  added: (game) => dayValue(game.addedOn),
  released: (game) => dayValue(game.releasedOn),
  rating: (game) => game.rating,
  igdb: (game) => game.igdbRating,
  // Never played is no playtime, not the least of it.
  hours: (game) => (game.minutes > 0 ? game.minutes : undefined),
  completed: (game) => dayValue(game.completedOn),
  status: (game) => statuses.indexOf(game.status),
  length: (game) => game.length,
  color: colorValue,
  // The same seed and the same game always land in the same place, whatever else is on the shelf.
  random: (game, seed) => hash(`${seed}:${game.slug}`),
}

/**
 * Games in the order a sort asks for. `seed` keeps a shuffle the same for
 * everyone who opens the same address.
 */
export const sortGames = (
  games: readonly LibraryGame[],
  sort: Sort,
  locale: string,
  seed = '',
): LibraryGame[] => {
  const byTitle = sortByTitle(games, locale)
  if (sort.key === 'title') return sort.descending ? byTitle.reverse() : byTitle

  const value = VALUES[sort.key]
  const direction = sort.descending ? -1 : 1
  return byTitle
    .map((game) => ({ game, value: value(game, seed) }))
    .sort((a, b) => {
      if (a.value === undefined) return b.value === undefined ? 0 : 1
      if (b.value === undefined) return -1
      return (a.value - b.value) * direction
    })
    .map((item) => item.game)
}
