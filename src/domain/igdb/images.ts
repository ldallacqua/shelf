/**
 * Addresses on IGDB's image servers. Images are used straight from there:
 * the servers resize, send WebP, allow cross-origin use and cache for a year.
 * They answer AVIF with an error, so WebP is the only format asked for.
 */

/** IGDB's size names and what each returns, in pixels. Covers keep their shape. */
export const imageSizes = {
  cover_small: { width: 90, height: 128 },
  cover_small_2x: { width: 180, height: 256 },
  cover_big: { width: 264, height: 374 },
  cover_big_2x: { width: 528, height: 748 },
  screenshot_med: { width: 569, height: 320 },
  screenshot_big: { width: 889, height: 500 },
  screenshot_huge: { width: 1280, height: 720 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const

export type ImageSize = keyof typeof imageSizes

export const IMAGE_HOST = 'https://images.igdb.com'

/** Image ids are IGDB's own short tokens. Anything else is refused, so an id can never smuggle a path. */
const IMAGE_ID = /^[a-z0-9_]+$/i

export const imageUrl = (imageId: string, size: ImageSize): string => {
  if (!IMAGE_ID.test(imageId)) throw new Error('Not an IGDB image id')
  return `${IMAGE_HOST}/igdb/image/upload/t_${size}/${imageId}.webp`
}

type Sources = { src: string; srcSet: string }

const sources = (imageId: string, sizes: readonly ImageSize[]): Sources => ({
  // The middle size is what a browser without srcset support gets.
  src: imageUrl(imageId, sizes[Math.min(1, sizes.length - 1)] ?? 'cover_big'),
  srcSet: sizes.map((size) => `${imageUrl(imageId, size)} ${imageSizes[size].width}w`).join(', '),
})

/** A cover at every width a shelf, wall or list can ask for. Pair it with a `sizes` attribute. */
export const coverSources = (imageId: string): Sources =>
  sources(imageId, ['cover_small', 'cover_big', 'cover_big_2x'])

/** A screenshot or backdrop, which IGDB crops to 16:9. */
export const screenshotSources = (imageId: string): Sources =>
  sources(imageId, ['screenshot_med', 'screenshot_big', 'screenshot_huge'])
