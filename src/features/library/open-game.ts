import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame } from '@/domain/library/library'

import type { DrawnShelf, OpenBox } from './view-props'

/** The game open over the shelf: where it stood when it was opened, and which game it is. */
export type OpenGame = OpenBox & { slug: string; platform?: number }

export const openGameAt = (box: OpenBox, item: ShelfItem): OpenGame => ({
  ...box,
  slug: item.game.slug,
  ...(item.copy ? { platform: item.copy.platform } : {}),
})

const isIt = (item: ShelfItem | undefined, open: OpenGame, copy = true): boolean =>
  item?.game.slug === open.slug && (!copy || item.copy?.platform === open.platform)

/**
 * The open game as the shelves stand now. It is followed by which game it is,
 * not by where it stood, so a change that moves it (a new status under a
 * status filter, a regroup) leaves it open: its box, wherever it now stands;
 * else, when the filter no longer shows it, the game itself, from the
 * library; and failing both (its address changed with its main version),
 * the box now in its place.
 */
export const followOpen = (
  shelves: readonly DrawnShelf[],
  open: OpenGame,
  games: readonly LibraryGame[] | undefined,
): { item?: ShelfItem; box?: OpenBox } => {
  const same = shelves.find((shelf) => shelf.key === open.key)?.items[open.index]
  if (isIt(same, open)) return { item: same, box: { key: open.key, index: open.index } }
  for (const copy of [true, false]) {
    // Its own shelf first: grouped by platform, a game stands on several.
    const ordered = [
      ...shelves.filter((shelf) => shelf.key === open.key),
      ...shelves.filter((shelf) => shelf.key !== open.key),
    ]
    for (const shelf of ordered) {
      const index = shelf.items.findIndex((item) => isIt(item, open, copy))
      if (index >= 0) return { item: shelf.items[index], box: { key: shelf.key, index } }
    }
  }
  const game = games?.find((each) => each.slug === open.slug)
  if (game) {
    const copy = game.copies.find((each) => each.platform === open.platform)
    return { item: copy ? { game, copy } : { game } }
  }
  return same ? { item: same, box: { key: open.key, index: open.index } } : {}
}

/** The box one step on from this one: along its shelf, then on to the next shelf with any. */
export const stepFrom = (
  shelves: readonly DrawnShelf[],
  box: OpenBox,
  direction: -1 | 1,
): OpenBox | undefined => {
  const at = shelves.findIndex((shelf) => shelf.key === box.key)
  if (at < 0) return undefined
  const current = shelves[at]
  if (current?.items[box.index + direction]) return { key: box.key, index: box.index + direction }
  // Off the end of a shelf: on to the next shelf's first box, or back to the last of the one before.
  for (let other = at + direction; other >= 0 && other < shelves.length; other += direction) {
    const next = shelves[other]
    if (next && next.items.length > 0) {
      return { key: next.key, index: direction === 1 ? 0 : next.items.length - 1 }
    }
  }
  return undefined
}

/**
 * The open game's neighbors. Gone from the shelves, it keeps the place it
 * left: the game that now stands there is next, and the one before it is
 * previous.
 */
export const neighborsOf = (
  shelves: readonly DrawnShelf[],
  open: OpenGame,
  box: OpenBox | undefined,
): { previous?: OpenBox; next?: OpenBox } => {
  if (box) {
    const previous = stepFrom(shelves, box, -1)
    const next = stepFrom(shelves, box, 1)
    return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) }
  }
  const left = { key: open.key, index: open.index }
  const standing = shelves.find((shelf) => shelf.key === open.key)?.items[open.index]
  const next = standing ? left : stepFrom(shelves, { ...left, index: open.index - 1 }, 1)
  const previous = stepFrom(shelves, left, -1)
  return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) }
}
