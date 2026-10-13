import { groupLibrary, isGrouping, type Grouping, type Shelf } from '@/domain/library/group'
import type { Library, LibraryGame, LibraryNames } from '@/domain/library/library'
import { sortByTitle } from '@/domain/library/sort'
import { libraryStats, type LibraryStats } from '@/domain/library/stats'

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

export type LibraryQuery = { view: View; group: Grouping }

type RawParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value

/** An unknown or malformed parameter falls back to its default. It never shows an error. */
export const parseLibraryQuery = (params: RawParams): LibraryQuery => {
  const view = first(params.view)
  const group = first(params.group)
  return {
    view: isView(view) ? view : DEFAULT_VIEW,
    group: isGrouping(group) ? group : DEFAULT_GROUPING,
  }
}

/** The shelves for a library: sorted, then grouped. */
export const arrangeLibrary = (
  games: readonly LibraryGame[],
  names: LibraryNames,
  query: Pick<LibraryQuery, 'group'>,
  locale: string,
): Shelf[] => groupLibrary(sortByTitle(games, locale), names, query.group)

/**
 * How many boxes are sent inside the page, and drawn before a view has
 * measured itself: about a screenful on a desktop. Each one is hydrated on a
 * phone too, so more is not free.
 */
export const FIRST_BOXES = 48

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

/** A shelf's name tag before its games are known: enough to draw the shelf and reserve its space. */
export type ShelfOutline = {
  key: string
  count: number
  /** How many of the shelf's first boxes came with the page. The rest arrive with the library file. */
  known: number
}

/**
 * The start of the library, small enough to send inside the page: every
 * shelf's key and count, and only the games that stand on the first screen.
 * The whole library follows as a file of its own.
 */
export type FirstScreen = {
  version: number
  stats: LibraryStats
  outline: ShelfOutline[]
  /** The first boxes in shelf order, each game once. */
  games: LibraryGame[]
  /** Platforms are needed to draw any box. The other name tables come with the library file. */
  platforms: LibraryNames['platform']
  tags: LibraryNames['tag']
}

export const buildFirstScreen = (
  library: Library,
  query: Pick<LibraryQuery, 'group'>,
  locale: string,
  limit: number,
): FirstScreen => {
  const shelves = arrangeLibrary(library.games, library.names, query, locale)

  const games = new Map<string, LibraryGame>()
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    limit,
  )
  const outline = shelves.map((shelf, index): ShelfOutline => {
    const known = shares[index] ?? 0
    for (const item of shelf.items.slice(0, known)) games.set(item.game.slug, item.game)
    return { key: shelf.key, count: shelf.items.length, known }
  })

  return {
    version: library.version,
    stats: libraryStats(library.games),
    outline,
    games: [...games.values()],
    platforms: library.names.platform,
    tags: library.names.tag,
  }
}

/**
 * The shelves to draw before the library file arrives: every shelf from the
 * outline, each holding only the boxes that came with the page. A game that
 * came for one shelf may also belong on a later one; it is left off there
 * until the whole shelf is known, so no box ever changes place.
 */
export const firstScreenShelves = (
  first: FirstScreen,
  query: Pick<LibraryQuery, 'group'>,
  locale: string,
) => {
  const names: LibraryNames = {
    genre: [],
    theme: [],
    mode: [],
    perspective: [],
    franchise: [],
    series: [],
    company: [],
    platform: first.platforms,
    tag: first.tags,
  }
  const partial = new Map(
    arrangeLibrary(first.games, names, query, locale).map((shelf) => [shelf.key, shelf]),
  )
  return first.outline.flatMap((entry) => {
    const shelf = partial.get(entry.key)
    // A shelf with none of its boxes yet cannot be named or drawn until the file arrives.
    if (!shelf) return []
    return [{ ...shelf, items: shelf.items.slice(0, entry.known), total: entry.count }]
  })
}
