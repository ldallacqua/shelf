import {
  groupLibrary,
  isGrouping,
  shelfIdOf,
  type Grouping,
  type Shelf,
  type ShelfItem,
  type Stands,
} from '@/domain/library/group'
import type { Library, LibraryGame, LibraryNames } from '@/domain/library/library'
import { DEFAULT_SORT, parseSort, sortGames, writeSort, type Sort } from '@/domain/library/sort'
import { libraryStats, type LibraryStats } from '@/domain/library/stats'
import type { Status } from '@/domain/library/values'
import {
  buildIndex,
  evaluate,
  gamesIn,
  standingCopies,
  withKeywords,
  type GameKeywords,
  type LibraryIndex,
} from '@/domain/query/evaluate'
import { facetCounts } from '@/domain/query/facets'
import { parseQuery } from '@/domain/query/parse'
import type { QueryNode } from '@/domain/query/tree'
import { writeQuery } from '@/domain/query/write'

/**
 * What the library's address says, and the shelves that follow from it.
 * The server and the browser both call this, so a page built on the server
 * and the same page worked out on the device cannot disagree.
 */

export const views = ['shelf', 'wall', 'list'] as const
export type View = (typeof views)[number]

export const isView = (value: unknown): value is View =>
  typeof value === 'string' && (views as readonly string[]).includes(value)

export const DEFAULT_VIEW: View = 'shelf'
export const DEFAULT_GROUPING: Grouping = 'platform'

/**
 * Everything the library's address says (spec, section 2): the view, the
 * grouping, the filter as text, the sort, and the seed that keeps a shuffle
 * the same for everyone who opens the address.
 */
export type LibraryQuery = { view: View; group: Grouping; q: string; sort: Sort; seed: string }

/** What decides the shelves and their order: the grouping and the sort. */
export type Arrangement = { group: Grouping; sort?: Sort; seed?: string }

type RawParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

/** A filter longer than this is not one anybody typed. */
export const MAX_QUERY_LENGTH = 1000

/** A shuffle's seed: a few letters and digits, safe in an address. */
const SEED = /^[a-z0-9]{1,16}$/i

/** An unknown or malformed parameter falls back to its default. It never shows an error. */
export const parseLibraryQuery = (params: RawParams): LibraryQuery => {
  const view = first(params.view)
  const group = first(params.group)
  const seed = first(params.seed) ?? ''
  return {
    view: isView(view) ? view : DEFAULT_VIEW,
    group: isGrouping(group) ? group : DEFAULT_GROUPING,
    q: (first(params.q) ?? '').slice(0, MAX_QUERY_LENGTH),
    sort: parseSort(first(params.sort)),
    seed: SEED.test(seed) ? seed : '',
  }
}

/**
 * The shelves for a list of games: sorted, then grouped. The sort applies
 * inside each shelf. `stands` says which copies may stand, when the filter
 * is about copies (see `standingCopies`).
 */
export const arrangeLibrary = (
  games: readonly LibraryGame[],
  names: LibraryNames,
  query: Arrangement,
  locale: string,
  stands?: Stands,
): Shelf[] =>
  groupLibrary(
    sortGames(games, query.sort ?? DEFAULT_SORT, locale, query.seed),
    names,
    query.group,
    stands,
  )

const indexes = new WeakMap<Library, LibraryIndex>()

/** The library's filter index, built once per library. */
export const indexOnce = (library: Library): LibraryIndex => {
  let index = indexes.get(library)
  if (!index) {
    index = buildIndex(library)
    indexes.set(library, index)
  }
  return index
}

const keywordIndexes = new WeakMap<LibraryIndex, WeakMap<GameKeywords, LibraryIndex>>()

/** The same index with the keywords file added, once it has arrived. */
export const keywordIndexOnce = (index: LibraryIndex, keywords: GameKeywords): LibraryIndex => {
  let known = keywordIndexes.get(index)
  if (!known) {
    known = new WeakMap()
    keywordIndexes.set(index, known)
  }
  let found = known.get(keywords)
  if (!found) {
    found = withKeywords(index, keywords)
    known.set(keywords, found)
  }
  return found
}

/** How many filters an index remembers the answer to: the last few typed. */
const REMEMBERED = 24

const selections = new WeakMap<LibraryIndex, Map<string, LibraryGame[]>>()

/**
 * The games a filter matches, in library order, remembered: the same filter
 * on the same index gives the very same list, so the shelves arranged from
 * it are remembered too. No filter gives the library's own list.
 */
export const selectOnce = (index: LibraryIndex, tree: QueryNode | undefined): LibraryGame[] => {
  if (tree === undefined) return index.library.games
  let known = selections.get(index)
  if (!known) {
    known = new Map()
    selections.set(index, known)
  }
  const key = writeQuery(tree)
  let games = known.get(key)
  if (!games) {
    games = gamesIn(index, evaluate(index, tree))
    known.set(key, games)
    if (known.size > REMEMBERED) known.delete(known.keys().next().value!)
  }
  return games
}

/**
 * How many boxes are sent inside the page, and drawn before a view has
 * measured itself: about a screenful on a desktop.
 */
export const FIRST_BOXES = 48

/**
 * The same for a phone, which shows about nine boxes at once: four rows of
 * three. Every box sent is markup to download, style and bring to life, and
 * a phone is the device that can least afford the thirty-odd it would then
 * take off the page again. Standing spine-out, or on the wall at its smallest
 * size, twelve do not fill a phone's screen; the rest follow with the library
 * file, a moment later.
 */
export const FIRST_BOXES_PHONE = 12

/**
 * How the first boxes are shared out: in shelf order, each shelf takes what
 * it holds until `limit` boxes are spoken for. Later shelves get none.
 */
export const shareFirstBoxes = (counts: readonly number[], limit: number): number[] => {
  let left = Math.max(0, limit)
  return counts.map((count) => {
    const share = Math.min(count, left)
    left -= share
    return share
  })
}

const arranged = new WeakMap<readonly LibraryGame[], Map<string, Shelf[]>>()

/**
 * The same shelves as `arrangeLibrary`, remembered: asked twice about the
 * same list of games, arrangement and language, it answers at once.
 *
 * Arranging a few hundred games is quick on a desktop and a twentieth of a
 * second on a mid-range phone. Remembering it lets the device do that work
 * in a moment of its own, before it draws, and keeps a redraw that changed
 * nothing about the shelves from doing it again.
 */
export const arrangeOnce = (
  games: readonly LibraryGame[],
  names: LibraryNames,
  query: Arrangement,
  locale: string,
  stands?: Stands,
): Shelf[] => {
  let known = arranged.get(games)
  if (!known) {
    known = new Map()
    arranged.set(games, known)
  }
  const key = `${query.group}:${writeSort(query.sort ?? DEFAULT_SORT)}:${query.seed ?? ''}:${locale}`
  let shelves = known.get(key)
  if (!shelves) {
    // The same list of games always comes from the same filter, so `stands` is the same too.
    shelves = arrangeLibrary(games, names, query, locale, stands)
    known.set(key, shelves)
  }
  return shelves
}

/**
 * One of a shelf's first boxes, as the server placed it: the game, and which
 * of its copies stands there (its place in `copies`), when one does.
 */
export type FirstBox = { slug: string; copy?: number }

/** A shelf's name tag before its games are known: enough to draw the shelf and reserve its space. */
export type ShelfOutline = {
  key: string
  count: number
  /** The shelf's first boxes that came with the page, in their places. The rest arrive with the library file. */
  boxes: FirstBox[]
}

/** The part of the address a first screen was built for. The view does not change it. */
export type FirstQuery = { group: Grouping; q: string; sort: string; seed: string }

/**
 * The start of the library, small enough to send inside the page: every
 * shelf's key and count, and only the games that stand on the first screen.
 * The whole library follows as a file of its own.
 */
export type FirstScreen = {
  version: number
  /** How many boxes this page was sized for: fewer for a phone. */
  boxes: number
  /** The address it was built for, so the device knows while its shelves still apply. */
  query: FirstQuery
  /** For the games the filter matches. */
  stats: LibraryStats
  /** How many games each status would give, for the status row: it has its counts from the first paint. */
  statusCounts: Partial<Record<Status, number>>
  outline: ShelfOutline[]
  /** The first boxes in shelf order, each game once. */
  games: LibraryGame[]
  /** Platforms are needed to draw any box. The other name tables come with the library file. */
  platforms: LibraryNames['platform']
  tags: LibraryNames['tag']
}

/**
 * The first screen for an address. `keywords` is needed only when the
 * filter asks about keywords, which the library itself does not carry.
 */
export const buildFirstScreen = (
  library: Library,
  query: Arrangement & { q?: string },
  locale: string,
  limit: number,
  keywords?: GameKeywords,
): FirstScreen => {
  const base = indexOnce(library)
  const index = keywords ? keywordIndexOnce(base, keywords) : base
  const { tree } = parseQuery(query.q ?? '')
  const matching = selectOnce(index, tree)
  const shelves = arrangeLibrary(
    matching,
    library.names,
    query,
    locale,
    standingCopies(index, tree),
  )

  const games = new Map<string, LibraryGame>()
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    limit,
  )
  const outline = shelves.map((shelf, at): ShelfOutline => {
    const known = shelf.items.slice(0, shares[at] ?? 0)
    for (const item of known) games.set(item.game.slug, item.game)
    return {
      key: shelf.key,
      count: shelf.items.length,
      boxes: known.map(({ game, copy }) =>
        copy ? { slug: game.slug, copy: game.copies.indexOf(copy) } : { slug: game.slug },
      ),
    }
  })

  return {
    version: library.version,
    boxes: limit,
    query: {
      group: query.group,
      q: query.q ?? '',
      sort: writeSort(query.sort ?? DEFAULT_SORT),
      seed: query.seed ?? '',
    },
    stats: libraryStats(matching),
    statusCounts: Object.fromEntries(
      facetCounts(index, tree, 'status').map((value) => [value.word, value.count]),
    ),
    outline,
    games: [...games.values()],
    platforms: library.names.platform,
    tags: library.names.tag,
  }
}

/**
 * The covers the first shelf opens with at the library's own address, in
 * order: what a box there shows, a copy's own cover first. The page names
 * them to the browser before the boxes that draw them arrive.
 */
export const openingCovers = (library: Library, locale: string, count: number): string[] =>
  (arrangeLibrary(library.games, library.names, parseLibraryQuery({}), locale)[0]?.items ?? [])
    .slice(0, count)
    .flatMap((item) => item.copy?.cover ?? item.game.cover ?? [])

/**
 * How many games on the whole shelf wait for a status, whatever the address
 * filters. Once the library has arrived it says; until then the counts sent
 * with the page say it only for an address with no filter, and otherwise
 * nothing is known yet.
 */
export const unsortedOnShelf = (
  library: Library | undefined,
  first: FirstScreen,
): number | undefined =>
  library
    ? library.games.reduce((sum, game) => sum + (game.status === 'unsorted' ? 1 : 0), 0)
    : first.query.q === ''
      ? (first.statusCounts.unsorted ?? 0)
      : undefined

/**
 * The whole library, once its file has arrived, holding on to what came with
 * the page: a game or platform already drawn keeps the very object it was
 * drawn from. The file says the same about it (same version, same words), so
 * nothing on screen has to be drawn again just because the rest arrived.
 */
export const keepFirstScreen = (library: Library, first: FirstScreen): Library => {
  if (library.version !== first.version) return library
  const before = kept.get(library)
  if (before?.first === first) return before.library

  const games = new Map(first.games.map((game) => [game.slug, game]))
  const platforms = new Map(first.platforms.map((platform) => [platform.id, platform]))
  const whole: Library = {
    ...library,
    games: library.games.map((game) => games.get(game.slug) ?? game),
    names: {
      ...library.names,
      platform: library.names.platform.map((platform) => platforms.get(platform.id) ?? platform),
    },
  }
  // Remembered, so the same file and page always give the very same library.
  kept.set(library, { first, library: whole })
  return whole
}

const kept = new WeakMap<Library, { first: FirstScreen; library: Library }>()

/**
 * The shelves to draw before the library file arrives: every shelf from the
 * outline, each holding only the boxes that came with the page, where the
 * server placed them. A game that came for one shelf may also belong on a
 * later one; it is left off there until the whole shelf is known, so no box
 * ever changes place. A shelf none of whose boxes came is drawn empty, so the
 * shelves and their tabs are all there from the first paint and none is
 * slotted in when the file arrives.
 *
 * Nothing is filtered, sorted or grouped here: the device did all of that
 * again as the page came alive, for the same boxes, in the same task, and
 * the first sort made the language's collator then too.
 */
export const firstScreenShelves = (first: FirstScreen) => {
  const games = new Map(first.games.map((game) => [game.slug, game]))
  return first.outline.flatMap((entry) => {
    const id = shelfIdOf(entry.key, first.platforms)
    if (!id) return []
    const items = entry.boxes.flatMap(({ slug, copy }): ShelfItem[] => {
      const game = games.get(slug)
      if (!game) return []
      const stands = copy === undefined ? undefined : game.copies[copy]
      return [stands ? { game, copy: stands } : { game }]
    })
    return [{ ...id, items, total: entry.count }]
  })
}
