import type {
  LibraryCopy,
  LibraryGame,
  LibraryNames,
  LibraryPlatform,
} from '@/domain/library/library'
import { statuses, type Status } from '@/domain/library/values'

/**
 * Turns an ordered list of games into shelves (spec, section 3.7).
 *
 * | Group by | Shelves                                            | Order                              |
 * | -------- | -------------------------------------------------- | ---------------------------------- |
 * | Platform | One per platform I own games on, plus "Not owned"  | By family, newest generation first |
 * | Status   | Playing, Backlog, Completed, Dropped, Wishlist     | That order                         |
 * | Year     | One per release year                               | Newest first                       |
 * | None     | One shelf                                          |                                    |
 *
 * A game owned on two platforms stands on both platform shelves. Empty
 * shelves are not shown. The order inside a shelf is the order given.
 */

export const groupings = ['platform', 'status', 'year', 'none'] as const
export type Grouping = (typeof groupings)[number]

export const isGrouping = (value: unknown): value is Grouping =>
  typeof value === 'string' && (groupings as readonly string[]).includes(value)

/** One game standing on a shelf, and the copy of it that stands there. */
export type ShelfItem = {
  game: LibraryGame
  /** Absent for a game I do not own: a wishlist entry, or one played on a subscription. */
  copy?: LibraryCopy
}

/**
 * What a shelf is for. The key is stable text, safe in an address and as a
 * React key: `platform:167`, `platform:none`, `status:playing`, `year:2018`,
 * `year:unknown`, `all`.
 */
export type ShelfId =
  | { kind: 'platform'; key: string; platform: LibraryPlatform }
  | { kind: 'not-owned'; key: 'platform:none' }
  | { kind: 'status'; key: string; status: Status }
  | { kind: 'year'; key: string; year: number }
  | { kind: 'year-unknown'; key: 'year:unknown' }
  | { kind: 'all'; key: 'all' }

export type Shelf = ShelfId & { items: ShelfItem[] }

/** The copy a game shows when it stands once: the one chosen for display, which is first. */
export const displayCopy = (game: LibraryGame): LibraryCopy | undefined => game.copies[0]

const standingOnce = (game: LibraryGame): ShelfItem => {
  const copy = displayCopy(game)
  return copy ? { game, copy } : { game }
}

const byPlatform = (games: readonly LibraryGame[], names: LibraryNames): Shelf[] => {
  const shelves = new Map<number, ShelfItem[]>()
  const notOwned: ShelfItem[] = []

  for (const game of games) {
    if (game.copies.length === 0) {
      notOwned.push({ game })
      continue
    }
    // A disc and a download on one platform are one box on that shelf: the first of them.
    const seen = new Set<number>()
    for (const copy of game.copies) {
      if (seen.has(copy.platform)) continue
      seen.add(copy.platform)
      const shelf = shelves.get(copy.platform)
      if (shelf) shelf.push({ game, copy })
      else shelves.set(copy.platform, [{ game, copy }])
    }
  }

  // `names.platform` is already in shelf order: by family, newest generation first.
  const ordered: Shelf[] = []
  for (const platform of names.platform) {
    const items = shelves.get(platform.id)
    if (items) ordered.push({ kind: 'platform', key: `platform:${platform.id}`, platform, items })
  }
  if (notOwned.length > 0) {
    ordered.push({ kind: 'not-owned', key: 'platform:none', items: notOwned })
  }
  return ordered
}

const byStatus = (games: readonly LibraryGame[]): Shelf[] =>
  statuses.flatMap((status): Shelf[] => {
    const items = games.filter((game) => game.status === status).map(standingOnce)
    return items.length > 0 ? [{ kind: 'status', key: `status:${status}`, status, items }] : []
  })

const byYear = (games: readonly LibraryGame[]): Shelf[] => {
  const years = new Map<number, ShelfItem[]>()
  const unknown: ShelfItem[] = []
  for (const game of games) {
    if (game.year === undefined) {
      unknown.push(standingOnce(game))
      continue
    }
    const shelf = years.get(game.year)
    if (shelf) shelf.push(standingOnce(game))
    else years.set(game.year, [standingOnce(game)])
  }
  const shelves: Shelf[] = [...years]
    .sort(([a], [b]) => b - a)
    .map(([year, items]) => ({ kind: 'year', key: `year:${year}`, year, items }))
  if (unknown.length > 0)
    shelves.push({ kind: 'year-unknown', key: 'year:unknown', items: unknown })
  return shelves
}

export const groupLibrary = (
  games: readonly LibraryGame[],
  names: LibraryNames,
  grouping: Grouping,
): Shelf[] => {
  switch (grouping) {
    case 'platform':
      return byPlatform(games, names)
    case 'status':
      return byStatus(games)
    case 'year':
      return byYear(games)
    case 'none':
      return games.length > 0 ? [{ kind: 'all', key: 'all', items: games.map(standingOnce) }] : []
  }
}

/** How many boxes stand on the shelves in all. A game on two platform shelves counts twice here. */
export const countBoxes = (shelves: readonly Shelf[]): number =>
  shelves.reduce((total, shelf) => total + shelf.items.length, 0)
