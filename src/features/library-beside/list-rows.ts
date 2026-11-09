import type { Shelf, ShelfItem } from '@/domain/library/group'

import type { Step } from './store'

/**
 * The list beside a game's page, as rows: each group's heading, then its
 * games, unless the group is folded. Only the rows in view are drawn, so
 * their heights are known ahead: a heading's and a game's, in rem.
 */

export const HEADING_REM = 2.25
export const GAME_REM = 2.75

export type ListRow =
  | { kind: 'heading'; key: string; shelf: Shelf; count: number; folded: boolean }
  | { kind: 'game'; key: string; item: ShelfItem }

/** The rows for these groups. Ungrouped (`none`), the one group has no heading. */
export const listRows = (shelves: readonly Shelf[], folded: ReadonlySet<string>): ListRow[] =>
  shelves.flatMap((shelf): ListRow[] => {
    const games = shelf.items.map((item): ListRow => ({
      kind: 'game',
      key: `${shelf.key}/${item.game.slug}`,
      item,
    }))
    if (shelf.kind === 'all') return games
    const closed = folded.has(shelf.key)
    const heading: ListRow = {
      kind: 'heading',
      key: shelf.key,
      shelf,
      count: shelf.items.length,
      folded: closed,
    }
    return closed ? [heading] : [heading, ...games]
  })

/**
 * The games in the list's order, each once: what Previous and Next step
 * through. A game on two platforms' shelves is where it first stands; a
 * folded group's games are still in the order.
 */
export const orderOf = (shelves: readonly Shelf[]): Step[] => {
  const seen = new Set<string>()
  const order: Step[] = []
  for (const shelf of shelves) {
    for (const { game } of shelf.items) {
      if (seen.has(game.slug)) continue
      seen.add(game.slug)
      order.push({ slug: game.slug, title: game.title })
    }
  }
  return order
}

/** Where each row starts, in pixels, and where the last one ends. */
export const offsetsOf = (rows: readonly ListRow[], heading: number, game: number): number[] => {
  const offsets = [0]
  for (const row of rows) offsets.push(offsets.at(-1)! + (row.kind === 'heading' ? heading : game))
  return offsets
}

/** The first row reaching below `top`: a binary search of the offsets. */
const rowAt = (offsets: readonly number[], top: number): number => {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (offsets[middle + 1]! <= top) low = middle + 1
    else high = middle
  }
  return low
}

/**
 * Which rows to draw for what can be seen, from `top` to `bottom`, with
 * `overscan` more on each side: the first, and one past the last.
 */
export const windowOf = (
  offsets: readonly number[],
  top: number,
  bottom: number,
  overscan: number,
): { start: number; end: number } => {
  const count = offsets.length - 1
  if (count <= 0) return { start: 0, end: 0 }
  const first = rowAt(offsets, Math.max(0, top))
  const last = rowAt(offsets, Math.max(top, bottom - 1))
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + 1 + overscan) }
}

/** The first row showing this game, if the list shows it. */
export const rowOf = (rows: readonly ListRow[], slug: string): number =>
  rows.findIndex((row) => row.kind === 'game' && row.item.game.slug === slug)
