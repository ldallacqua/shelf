import type { Palette } from '@/domain/color/palette'
import type { Library } from '@/domain/library/library'
import type { CaseShape, Plastic } from '@/domain/platforms/platforms'

/** A game as setting a shelf up stands it on its small shelves: its case and its cover, no more. */
export type ShowcaseGame = {
  slug: string
  title: string
  cover: string
  colors?: Palette
  hash?: string
  shape: CaseShape
  plastic: Plastic
}

/**
 * The games setting a shelf up stands on its small shelves (spec 4.6), so a shelf that has
 * games shows them, never an empty ledge: the ones most played first, as a sync brings them with
 * their hours, then the latest added. Only games owned and with a cover; never one for adults,
 * whatever this device hides. Each stands in the case of the platform of its first copy, as the
 * shelf draws it.
 */
export const showcaseOf = (library: Library, count: number): ShowcaseGame[] => {
  const platforms = new Map(library.names.platform.map((platform) => [platform.id, platform]))
  return library.games
    .filter((game) => game.cover && !game.adult && game.status !== 'wishlist')
    .toSorted(
      (a, b) =>
        b.minutes - a.minutes ||
        b.addedOn.localeCompare(a.addedOn) ||
        a.title.localeCompare(b.title),
    )
    .slice(0, count)
    .map((game) => {
      const copy = game.copies[0]
      const platform = platforms.get(copy?.platform ?? game.platforms[0] ?? -1)
      return {
        slug: game.slug,
        title: game.title,
        cover: copy?.cover ?? game.cover ?? '',
        ...(game.colors ? { colors: game.colors } : {}),
        ...(game.hash ? { hash: game.hash } : {}),
        shape: platform?.shape ?? 'keepCase',
        plastic: platform?.plastic ?? 'black',
      }
    })
}
