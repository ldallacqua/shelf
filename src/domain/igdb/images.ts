/**
 * Addresses on IGDB's image servers. Images are used straight from there:
 * the servers resize, send WebP, allow cross-origin use and cache for a year.
 * They answer AVIF with an error, so WebP is the only format asked for.
 * `imageUrl` also takes the id of an image on Steam's servers.
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

/**
 * A game IGDB does not have keeps its images on Steam's servers (ADR 006), and
 * an image id is then the file's path there. They resize nothing, so each size
 * is the nearest file there is: a cover in two, when `@2x` says the second
 * exists, a screenshot in two, anything else as it is.
 */
export const STEAM_IMAGES = 'https://shared.akamai.steamstatic.com/store_item_assets'
const STEAM_IMAGE =
  /^steam\/apps\/\d+\/(?:[0-9a-f]+\/)?[\w-]+(?:\.[\w-]+)*\.(?:jpg|jpeg|png)(?:@2x)?$/i
const DOUBLE = '@2x'
const SCREENSHOT = /\/ss_[^/]+\.jpg$/i
/** The widest a single file of a cover is, and of a smaller screenshot. */
const STEAM_COVER_WIDTH = 300
const STEAM_SHOT_WIDTH = 600

export const isSteamImage = (imageId: string): boolean => STEAM_IMAGE.test(imageId)

/** The id for a cover's file, and for its file at twice the size when that is beside it. */
export const steamCoverId = (path: string, double?: string): string | undefined => {
  if (!isSteamImage(path)) return undefined
  const doubled = path.replace(/(\.\w+)$/, '_2x$1')
  return double === doubled && isSteamImage(double) ? `${path}${DOUBLE}` : path
}

const steamImageUrl = (imageId: string, size: ImageSize): string => {
  const doubled = imageId.endsWith(DOUBLE)
  const path = doubled ? imageId.slice(0, -DOUBLE.length) : imageId
  const { width } = imageSizes[size]
  if (SCREENSHOT.test(path)) {
    const file = width <= STEAM_SHOT_WIDTH ? '.600x338.jpg' : '.1920x1080.jpg'
    return `${STEAM_IMAGES}/${path.replace(/\.jpg$/i, file)}`
  }
  const large = doubled && width > STEAM_COVER_WIDTH
  return `${STEAM_IMAGES}/${large ? path.replace(/(\.\w+)$/, '_2x$1') : path}`
}

export const imageUrl = (imageId: string, size: ImageSize): string => {
  if (isSteamImage(imageId)) return steamImageUrl(imageId, size)
  if (!IMAGE_ID.test(imageId)) throw new Error('Not an IGDB image id')
  return `${IMAGE_HOST}/igdb/image/upload/t_${size}/${imageId}.webp`
}

const IMAGE_URL =
  /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_[a-z0-9_]+\/([a-z0-9_]+)\.\w+$/i

/** The image id in an address `imageUrl` made, as the API gives covers. Nothing for any other address. */
export const imageIdOf = (url: string): string | undefined => IMAGE_URL.exec(url)?.[1]

type Sources = { src: string; srcSet: string }

const sources = (imageId: string, sizes: readonly ImageSize[]): Sources => ({
  // A browser without srcset support gets the 264-pixel cover, or the nearest to it.
  src: imageUrl(imageId, sizes.includes('cover_big') ? 'cover_big' : (sizes.at(-1) ?? 'cover_big')),
  srcSet: sizes.map((size) => `${imageUrl(imageId, size)} ${imageSizes[size].width}w`).join(', '),
})

const COVER_SIZES = ['cover_small', 'cover_small_2x', 'cover_big', 'cover_big_2x'] as const

/**
 * A cover at every width a shelf, wall or list can ask for. Pair it with a
 * `sizes` attribute.
 *
 * `largest` caps what a very sharp screen may fetch. A box on the shelf is
 * about 130 pixels wide: the 264-pixel file is already more than twice that,
 * and the 528-pixel one is three times the bytes for a difference nobody can
 * see at that size.
 */
export const coverSources = (
  imageId: string,
  largest: (typeof COVER_SIZES)[number] = 'cover_big_2x',
): Sources => sources(imageId, COVER_SIZES.slice(0, COVER_SIZES.indexOf(largest) + 1))

/** A screenshot or backdrop, which IGDB crops to 16:9. */
export const screenshotSources = (imageId: string): Sources =>
  sources(imageId, ['screenshot_med', 'screenshot_big', 'screenshot_huge'])

/**
 * Key art behind a game's cover. It is dimmed to a third, so a file smaller
 * than the screen is never seen as soft, and on a phone's slow connection
 * the largest file was what held its page's largest paint back.
 */
export const backdropSources = (imageId: string): Sources =>
  sources(imageId, ['screenshot_med', 'screenshot_big'])
