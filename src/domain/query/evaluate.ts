import type { Library, LibraryCopy, LibraryGame, Named } from '@/domain/library/library'
import { dayToNumber } from '@/domain/library/snapshot'
import { formats, kinds, statuses } from '@/domain/library/values'

import {
  andBits,
  bitPositions,
  emptyBits,
  fullBits,
  hasBit,
  notBits,
  orBits,
  setBit,
  type Bitmap,
} from './bitmap'
import {
  filterWord,
  hasValues,
  isListKey,
  isNumberKey,
  isValues,
  type DateKey,
  type ListKey,
  type NumberKey,
} from './keys'
import {
  conjuncts,
  type Comparison,
  type DateTerm,
  type ListTerm,
  type NumberTerm,
  type QueryNode,
  type Term,
} from './tree'

/**
 * Which games a filter matches (architecture, section 15). The index is
 * built once per library: for each value of each list filter, the set of
 * games that carry it, and for each number and date, one array with a slot
 * per game. A filter is then and, or and not over whole sets, and a range
 * is one pass over an array.
 *
 * `owned:` and `format:` are about copies, and in one group they describe
 * the same copy: `owned:ps5 format:physical` is a PS5 disc, not any game
 * with a PS5 copy and a disc of something. So those two are also indexed by
 * copy, and the copies that match decide which boxes stand on a platform
 * shelf.
 */

/** One value of a list filter: its word, the name it is shown with, and its games. */
export type IndexValue = { word: string; name: string; bits: Bitmap }

/** The keys that describe a copy. */
export type CopyKey = 'owned' | 'format'

export const isCopyKey = (key: string): key is CopyKey => key === 'owned' || key === 'format'

export type LibraryIndex = {
  library: Library
  size: number
  all: Bitmap
  lists: Record<ListKey, Map<string, IndexValue>>
  numbers: Record<NumberKey, Float64Array>
  dates: Record<DateKey, Float64Array>
  /** Titles folded for matching: lower case, without accents. */
  titles: string[]
  /** Every copy in the library, numbered, with the game it belongs to. */
  copies: {
    size: number
    game: Int32Array
    of: Map<LibraryCopy, number>
    lists: Record<CopyKey, Map<string, Bitmap>>
  }
  /** Keywords arrive in a file of their own, the first time one is asked for. */
  keywords: boolean
}

/**
 * Text as it is compared: lower case, without accents, and with curly
 * apostrophes made straight, so "pokemon" finds Pokémon and "baldur's" finds
 * Baldur’s Gate.
 */
export const fold = (text: string): string =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[‘’ʼ]/g, "'")

const listOf = (): Record<ListKey, Map<string, IndexValue>> => ({
  status: new Map(),
  owned: new Map(),
  wanted: new Map(),
  format: new Map(),
  tag: new Map(),
  has: new Map(),
  is: new Map(),
  genre: new Map(),
  theme: new Map(),
  keyword: new Map(),
  mode: new Map(),
  perspective: new Map(),
  platform: new Map(),
  kind: new Map(),
  franchise: new Map(),
  series: new Map(),
  developer: new Map(),
  publisher: new Map(),
})

const add = (
  list: Map<string, IndexValue>,
  word: string,
  name: string,
  size: number,
  game: number,
) => {
  let value = list.get(word)
  if (!value) {
    value = { word, name, bits: emptyBits(size) }
    list.set(word, value)
  }
  setBit(value.bits, game)
}

const addCopy = (list: Map<string, Bitmap>, word: string, size: number, copy: number) => {
  let bits = list.get(word)
  if (!bits) {
    bits = emptyBits(size)
    list.set(word, bits)
  }
  setBit(bits, copy)
}

/** Every value a closed list can take is listed, even with no games, so the panel shows it. */
const declare = (list: Map<string, IndexValue>, words: readonly string[], size: number) => {
  for (const word of words) list.set(word, { word, name: word, bits: emptyBits(size) })
}

/** The list filters IGDB names, and the field of a game that holds their ids. */
const IGDB_LISTS = [
  ['genre', 'genres'],
  ['theme', 'themes'],
  ['mode', 'modes'],
  ['perspective', 'perspectives'],
  ['franchise', 'franchises'],
  ['series', 'series'],
] as const

const byId = (names: readonly Named[]) => new Map(names.map((item) => [item.id, item]))

/** Distinct platforms a game is owned on: a disc and a download on one platform are one. */
export const platformsOwned = (game: Pick<LibraryGame, 'copies'>): number =>
  new Set(game.copies.map((copy) => copy.platform)).size

export const buildIndex = (library: Library): LibraryIndex => {
  const { games, names } = library
  const size = games.length
  const lists = listOf()
  declare(lists.status, statuses, size)
  declare(lists.format, formats, size)
  declare(lists.kind, kinds, size)
  declare(lists.has, hasValues, size)
  declare(lists.is, isValues, size)

  const igdb = {
    genre: byId(names.genre),
    theme: byId(names.theme),
    mode: byId(names.mode),
    perspective: byId(names.perspective),
    franchise: byId(names.franchise),
    series: byId(names.series),
  } as const
  const companies = byId(names.company)
  const platforms = new Map(names.platform.map((platform) => [platform.id, platform]))

  const copyCount = games.reduce((total, game) => total + game.copies.length, 0)
  const copies: LibraryIndex['copies'] = {
    size: copyCount,
    game: new Int32Array(copyCount),
    of: new Map(),
    lists: { owned: new Map(), format: new Map() },
  }

  const number = () => new Float64Array(size).fill(Number.NaN)
  const numbers: Record<NumberKey, Float64Array> = {
    rating: number(),
    hours: number(),
    copies: number(),
    year: number(),
    igdb: number(),
    length: number(),
  }
  const dates: Record<DateKey, Float64Array> = { completed: number(), added: number() }
  const titles: string[] = []

  let copyAt = 0
  games.forEach((game, at) => {
    titles.push(fold(game.title))
    add(lists.status, game.status, game.status, size, at)
    add(lists.kind, game.kind, game.kind, size, at)
    if (game.hasNotes) add(lists.has, 'notes', 'notes', size, at)
    if (game.rating !== undefined) add(lists.has, 'rating', 'rating', size, at)
    if (game.minutes > 0) add(lists.has, 'playtime', 'playtime', size, at)
    if (game.cover) add(lists.has, 'cover', 'cover', size, at)
    if (game.featured) add(lists.is, 'featured', 'featured', size, at)
    if (game.private) add(lists.is, 'private', 'private', size, at)

    for (const copy of game.copies) {
      copies.game[copyAt] = at
      copies.of.set(copy, copyAt)
      add(lists.format, copy.format, copy.format, size, at)
      addCopy(copies.lists.format, copy.format, copyCount, copyAt)
      const platform = platforms.get(copy.platform)
      if (platform) {
        add(lists.owned, platform.key, platform.name, size, at)
        addCopy(copies.lists.owned, platform.key, copyCount, copyAt)
        // `owned:playstation` is any PlayStation. Where a platform's key is its family's
        // word (the first Xbox, a Windows PC), the word means the family.
        add(lists.owned, platform.family, platform.family, size, at)
        addCopy(copies.lists.owned, platform.family, copyCount, copyAt)
      }
      copyAt += 1
    }
    for (const id of game.platforms) {
      const platform = platforms.get(id)
      if (!platform) continue
      add(lists.platform, platform.key, platform.name, size, at)
      add(lists.platform, platform.family, platform.family, size, at)
    }
    for (const id of game.wanted ?? []) {
      const platform = platforms.get(id)
      if (!platform) continue
      add(lists.wanted, platform.key, platform.name, size, at)
      add(lists.wanted, platform.family, platform.family, size, at)
    }
    for (const [key, field] of IGDB_LISTS) {
      for (const id of game[field]) {
        const named = igdb[key].get(id)
        if (named) add(lists[key], filterWord(key, id, named.slug), named.name, size, at)
      }
    }
    for (const [key, ids] of [
      ['developer', game.developers],
      ['publisher', game.publishers],
    ] as const) {
      for (const id of ids) {
        const company = companies.get(id)
        if (company) add(lists[key], company.slug, company.name, size, at)
      }
    }
    for (const position of game.tags) {
      const tag = names.tag[position]
      if (tag) add(lists.tag, tag.slug, tag.name, size, at)
    }

    if (game.rating !== undefined) numbers.rating[at] = game.rating / 10
    numbers.hours[at] = game.minutes / 60
    numbers.copies[at] = platformsOwned(game)
    if (game.year !== undefined) numbers.year[at] = game.year
    if (game.igdbRating !== undefined) numbers.igdb[at] = game.igdbRating
    if (game.length !== undefined) numbers.length[at] = game.length / 60
    dates.added[at] = dayToNumber(game.addedOn)
    if (game.completedOn) dates.completed[at] = dayToNumber(game.completedOn)
  })

  return {
    library,
    size,
    all: fullBits(size),
    lists,
    numbers,
    dates,
    titles,
    copies,
    keywords: false,
  }
}

/**
 * The keywords file (architecture, section 6): every game's keyword ids, by
 * the game's slug, and the keywords' names. Keywords are many, so they are
 * fetched the first time a filter asks for one, not with the library.
 */
export type GameKeywords = {
  names: readonly Named[]
  games: Readonly<Record<string, readonly number[]>>
}

export const withKeywords = (index: LibraryIndex, keywords: GameKeywords): LibraryIndex => {
  const list = new Map<string, IndexValue>()
  const named = byId(keywords.names)
  index.library.games.forEach((game, at) => {
    for (const id of keywords.games[game.slug] ?? []) {
      const keyword = named.get(id)
      if (keyword) add(list, keyword.slug, keyword.name, index.size, at)
    }
  })
  return { ...index, lists: { ...index.lists, keyword: list }, keywords: true }
}

const DAY_MS = 86_400_000

/** The first and last day a date stands for: a year, a month or a day. */
export const daySpan = (text: string): [number, number] => {
  const [year, month, day] = text.split('-').map(Number) as [number, number?, number?]
  if (month === undefined) {
    return [dayToNumber(`${year}-01-01`), dayToNumber(`${year}-12-31`)]
  }
  const first = Date.UTC(year, month - 1, day ?? 1) / DAY_MS
  if (day !== undefined) return [first, first]
  return [first, Date.UTC(year, month, 0) / DAY_MS]
}

const numberTest = (comparison: Comparison<number>): ((value: number) => boolean) => {
  switch (comparison.op) {
    case 'eq':
      return (value) => value === comparison.value
    case 'lt':
      return (value) => value < comparison.value
    case 'le':
      return (value) => value <= comparison.value
    case 'gt':
      return (value) => value > comparison.value
    case 'ge':
      return (value) => value >= comparison.value
    case 'range':
      return (value) => value >= comparison.from && value <= comparison.to
  }
}

/** A date compares as the whole span it names: `completed:<2025` is before the first of January. */
const dateTest = (comparison: Comparison<string>): ((day: number) => boolean) => {
  switch (comparison.op) {
    case 'eq': {
      const [first, last] = daySpan(comparison.value)
      return (day) => day >= first && day <= last
    }
    case 'lt': {
      const [first] = daySpan(comparison.value)
      return (day) => day < first
    }
    case 'le': {
      const [, last] = daySpan(comparison.value)
      return (day) => day <= last
    }
    case 'gt': {
      const [, last] = daySpan(comparison.value)
      return (day) => day > last
    }
    case 'ge': {
      const [first] = daySpan(comparison.value)
      return (day) => day >= first
    }
    case 'range': {
      const [first] = daySpan(comparison.from)
      const [, last] = daySpan(comparison.to)
      return (day) => day >= first && day <= last
    }
  }
}

const scan = (index: LibraryIndex, values: Float64Array, test: (value: number) => boolean) => {
  const bits = emptyBits(index.size)
  for (let at = 0; at < index.size; at += 1) {
    const value = values[at]!
    // A game with no value matches no comparison. Its absence is `-has:` or `-key:`'s to find.
    if (!Number.isNaN(value) && test(value)) setBit(bits, at)
  }
  return bits
}

const isCopyTerm = (node: QueryNode): node is ListTerm =>
  node.type === 'term' && isCopyKey(node.key)

/** The copies that match every one of these terms. */
const copiesMatching = (index: LibraryIndex, terms: readonly ListTerm[]): Bitmap => {
  const { copies } = index
  let bits = fullBits(copies.size)
  for (const term of terms) {
    const list = copies.lists[term.key as CopyKey]
    let any = emptyBits(copies.size)
    for (const word of term.values) {
      const found = list.get(word)
      if (found) any = orBits(any, found)
    }
    bits = andBits(bits, any)
  }
  return bits
}

/** The games that own at least one of these copies. */
const gamesOwning = (index: LibraryIndex, copyBits: Bitmap): Bitmap => {
  const bits = emptyBits(index.size)
  for (const copy of bitPositions(copyBits)) setBit(bits, index.copies.game[copy]!)
  return bits
}

const isListTerm = (term: Term): term is ListTerm => isListKey(term.key)
const isNumberTerm = (term: Term): term is NumberTerm => isNumberKey(term.key)

const termBits = (index: LibraryIndex, term: Term): Bitmap => {
  if (isListTerm(term)) {
    if (isCopyKey(term.key)) return gamesOwning(index, copiesMatching(index, [term]))
    const list = index.lists[term.key]
    let bits = emptyBits(index.size)
    for (const word of term.values) {
      const value = list.get(word)
      if (value) bits = orBits(bits, value.bits)
    }
    return bits
  }
  if (isNumberTerm(term)) {
    const tests = term.values.map(numberTest)
    return scan(index, index.numbers[term.key], (value) => tests.some((test) => test(value)))
  }
  const date = term as DateTerm
  const tests = date.values.map(dateTest)
  return scan(index, index.dates[date.key], (day) => tests.some((test) => test(day)))
}

/** The set of games a filter matches. No filter matches every game. */
export const evaluate = (index: LibraryIndex, tree: QueryNode | undefined): Bitmap => {
  if (tree === undefined) return index.all
  switch (tree.type) {
    case 'term':
      return termBits(index, tree)
    case 'text': {
      const needle = fold(tree.text)
      const bits = emptyBits(index.size)
      index.titles.forEach((title, at) => {
        if (title.includes(needle)) setBit(bits, at)
      })
      return bits
    }
    case 'not':
      return notBits(evaluate(index, tree.child), index.all)
    case 'and': {
      // The conditions on copies in one group are about one copy.
      const onCopies = tree.children.filter(isCopyTerm)
      let bits =
        onCopies.length > 0 ? gamesOwning(index, copiesMatching(index, onCopies)) : index.all
      for (const child of tree.children) {
        if (!isCopyTerm(child)) bits = andBits(bits, evaluate(index, child))
      }
      return bits
    }
    case 'or':
      return tree.children.reduce(
        (bits, child) => orBits(bits, evaluate(index, child)),
        emptyBits(index.size),
      )
  }
}

/** The games a filter matches, in the library's order. */
export const gamesIn = (index: LibraryIndex, bits: Bitmap): LibraryGame[] =>
  bitPositions(bits).map((at) => index.library.games[at]!)

/**
 * Which copies stand on the shelves: those that match the filter's
 * top-level conditions on copies. With `format:physical`, a game owned on a
 * disc and as a download stands only as the disc. Without such conditions,
 * every copy stands, and the answer is none.
 */
export const standingCopies = (
  index: LibraryIndex,
  tree: QueryNode | undefined,
): ((copy: LibraryCopy) => boolean) | undefined => {
  const onCopies = conjuncts(tree).filter(isCopyTerm)
  if (onCopies.length === 0) return undefined
  const bits = copiesMatching(index, onCopies)
  return (copy) => {
    const at = index.copies.of.get(copy)
    return at !== undefined && hasBit(bits, at)
  }
}

/** Whether a filter asks about keywords, which are not in the library file. */
export const asksForKeywords = (tree: QueryNode | undefined): boolean => {
  if (!tree) return false
  switch (tree.type) {
    case 'term':
      return tree.key === 'keyword'
    case 'text':
      return false
    case 'not':
      return asksForKeywords(tree.child)
    default:
      return tree.children.some(asksForKeywords)
  }
}
