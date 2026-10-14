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
 * same list of games, grouping and language, it answers at once.
 *
 * Arranging a few hundred games is quick on a desktop and a twentieth of a
 * second on a mid-range phone. Remembering it lets the device do that work
 * in a moment of its own, before it draws, and keeps a redraw that changed
 * nothing about the shelves from doing it again.
 */
export const arrangeOnce = (
  games: readonly LibraryGame[],
  names: LibraryNames,
  query: Pick<LibraryQuery, 'group'>,
  locale: string,
): Shelf[] => {
  let known = arranged.get(games)
  if (!known) {
    known = new Map()
    arranged.set(games, known)
  }
  const key = `${query.group}:${locale}`
  let shelves = known.get(key)
  if (!shelves) {
    shelves = arrangeLibrary(games, names, query, locale)
    known.set(key, shelves)
  }
  return shelves
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
  /** How many boxes this page was sized for: fewer for a phone. */
  boxes: number
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
    boxes: limit,
    stats: libraryStats(library.games),
    outline,
    games: [...games.values()],
    platforms: library.names.platform,
    tags: library.names.tag,
  }
}

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
