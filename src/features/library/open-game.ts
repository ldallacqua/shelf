import type { ShelfItem } from '@/domain/library/group'

import type { DrawnShelf, OpenBox } from './view-props'

/** The box pulled from the 3D wall: where it stood when it was pulled, and which game it is. */
export type OpenGame = OpenBox & { slug: string; platform?: number }

export const openGameAt = (box: OpenBox, item: ShelfItem): OpenGame => ({
  ...box,
  slug: item.game.slug,
  platform: item.copy?.platform,
})

/**
 * The pulled box as the shelves stand now. It is followed by which game it
 * is, not by where it stood, so a change that moves it (a new status under a
 * status filter, a regroup) leaves it pulled: its box, wherever it now
 * stands, on its own shelf first (grouped by platform, a game stands on
 * several). Gone from the wall, it is nowhere, and goes back.
 */
export const followOpen = (
  shelves: readonly DrawnShelf[],
  open: OpenGame,
): { item: ShelfItem; box: OpenBox } | undefined => {
  const own = shelves.filter((shelf) => shelf.key === open.key)
  for (const shelf of [...own, ...shelves]) {
    const index = shelf.items.findIndex((item) => item.game.slug === open.slug)
    if (index >= 0) return { item: shelf.items[index]!, box: { key: shelf.key, index } }
  }
  return undefined
}
