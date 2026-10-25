import type { ShelfItem } from '@/domain/library/group'
import type { LibraryGame } from '@/domain/library/library'

import type { DrawnShelf, OpenBox } from './view-props'

/** The game open over the shelf: where it stood when it was opened, and which game it is. */
export type OpenGame = OpenBox & { slug: string; platform?: number }

export const openGameAt = (box: OpenBox, item: ShelfItem): OpenGame => ({
  ...box,
  slug: item.game.slug,
  platform: item.copy?.platform,
})

/**
 * The open game as the shelves stand now. It is followed by which game it is,
 * not by where it stood, so a change that moves it (a new status under a
 * status filter, a regroup) leaves it open: its box, wherever it now stands,
 * on its own shelf first (grouped by platform, a game stands on several);
 * else, when the filter no longer shows it, the game itself, from the
 * library; and failing both (its address changed with its main version),
 * the box now in its place.
 */
export const followOpen = (
  shelves: readonly DrawnShelf[],
  open: OpenGame,
  games: readonly LibraryGame[] | undefined,
): { item?: ShelfItem; box?: OpenBox } => {
  const own = shelves.filter((shelf) => shelf.key === open.key)
  for (const shelf of [...own, ...shelves]) {
    const index = shelf.items.findIndex((item) => item.game.slug === open.slug)
    if (index >= 0) return { item: shelf.items[index], box: { key: shelf.key, index } }
  }
  const game = games?.find((each) => each.slug === open.slug)
  const copy = game?.copies.find((each) => each.platform === open.platform)
  if (game) return { item: copy ? { game, copy } : { game } }
  const item = own[0]?.items[open.index]
  return item ? { item, box: { key: open.key, index: open.index } } : {}
}

/** The box one step on from this one: along its shelf, then on to the next shelf with any. */
export const stepFrom = (
  shelves: readonly DrawnShelf[],
  box: OpenBox,
  direction: -1 | 1,
): OpenBox | undefined => {
  const at = shelves.findIndex((shelf) => shelf.key === box.key)
  if (shelves[at]?.items[box.index + direction]) {
    return { key: box.key, index: box.index + direction }
  }
  // Off the end of a shelf: on to the next shelf's first box, or back to the last of the one before.
  for (let other = at + direction; at >= 0 && shelves[other]; other += direction) {
    const length = shelves[other]!.items.length
    if (length > 0) return { key: shelves[other]!.key, index: direction === 1 ? 0 : length - 1 }
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
): { previous?: OpenBox; next?: OpenBox } => ({
  previous: stepFrom(shelves, box ?? open, -1),
  next: stepFrom(shelves, box ?? { key: open.key, index: open.index - 1 }, 1),
})
