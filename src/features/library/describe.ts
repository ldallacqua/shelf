import type { useTranslations } from 'next-intl'

import type { Shelf, ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'

import { platformsOwned } from './game-box'

/** The translator for the `Library` messages. */
type Translate = ReturnType<typeof useTranslations<'Library'>>

/** A shelf's name, as its label and its tab show it. */
export const shelfName = (shelf: Shelf, t: Translate, short = false): string => {
  switch (shelf.kind) {
    case 'platform':
      return short ? shelf.platform.short : shelf.platform.name
    case 'not-owned':
      return t('shelf.notOwned')
    case 'status':
      return t(`status.${shelf.status}`)
    case 'year':
      return String(shelf.year)
    case 'year-unknown':
      return t('shelf.yearUnknown')
    case 'all':
      return t('shelf.all')
  }
}

/**
 * A box in words, for assistive technology: the title, where it is owned and
 * how, and its status. Everything a box shows by shape is said here.
 */
export const describeBox = (
  item: ShelfItem,
  platform: LibraryPlatform | undefined,
  t: Translate,
): string => {
  const { game, copy } = item
  const title = game.year ? t('box.titled', { title: game.title, year: game.year }) : game.title
  const status = t(`status.${game.status}`)
  const owned = platformsOwned(item)
  const base =
    copy && platform
      ? t('box.owned', {
          title,
          platform: platform.short,
          format: t(`format.${copy.format}`),
          status,
        })
      : game.wanted?.length && platform
        ? t('box.wanted', { title, status, platform: platform.short, more: game.wanted.length - 1 })
        : t('box.notOwned', { title, status })
  const described = owned > 1 ? t('box.alsoOn', { description: base, count: owned }) : base
  return game.private ? t('box.private', { description: described }) : described
}
