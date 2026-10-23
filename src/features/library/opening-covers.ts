import { preload } from 'react-dom'

import { coverSources } from '@/domain/igdb/images'
import type { Library } from '@/domain/library/library'
import { openingCovers } from '@/domain/library/view'

/**
 * `sizes` for a cover on the shelf: how wide a case is drawn at each scale
 * (see `--mm` in shelf.css), a little under, so a screen twice as sharp takes
 * the next file down and not the next up.
 */
export const SHELF_SIZES = '(min-width: 64rem) 128px, (min-width: 40rem) 116px, 100px'

/**
 * How many of the first shelf's covers are fetched ahead of the rest: the
 * first two rows on a phone, most of the first on a desktop. More would
 * compete with each other on a slow connection and all arrive later.
 */
export const EAGER_COVERS = 6

/**
 * Names the covers a library opens with to the browser, from the part of its
 * page built ahead of time, which arrives first. Its boxes come later in the
 * page, after the data the page starts up from, and the largest paint is one
 * of these covers. At an address that shows other covers first (a filter, a
 * sort), these few are fetched for nothing. Call it while rendering.
 */
export function preloadOpeningCovers(library: Library, locale: string): void {
  for (const cover of openingCovers(library, locale, EAGER_COVERS)) {
    // The files and sizes a box asks for (`GameBox`, `Cover`), so its image is the one preloaded.
    const files = coverSources(cover, 'cover_big')
    preload(files.src, {
      as: 'image',
      imageSrcSet: files.srcSet,
      imageSizes: SHELF_SIZES,
      fetchPriority: 'high',
    })
  }
}
