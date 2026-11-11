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
 * Steam's image servers: covers, banners and art from its store pages (ADR 010), achievement
 * icons (ADR 003).
 */
export const STEAM_IMAGE_HOST = 'https://shared.akamai.steamstatic.com'

/** Every server a library's images come from: a page opens its connections to them early. */
export const IMAGE_HOSTS = [IMAGE_HOST, STEAM_IMAGE_HOST] as const

/**
 * A game's images from its store page on Steam (ADR 010), and every image of a game IGDB does
 * not have (ADR 006), are on Steam's servers, and an image id is then the file's path there.
 */
export const STEAM_IMAGES = `${STEAM_IMAGE_HOST}/store_item_assets`
const STEAM_IMAGE = /^steam\/apps\/\d+(\/\w[\w.-]*)+\.(jpe?g|png)(@2x)?$/i

export const isSteamImage = (imageId: string): boolean => STEAM_IMAGE.test(imageId)

type ImageFile = { url: string; width: number }

/**
 * The file on Steam's servers nearest a size, and how wide it really is, which is what a
 * browser chooses by. They resize nothing, so a cover is in two files, 300 and 600 pixels wide,
 * when `@2x` says the second exists; a screenshot in two, 600 and 1920; anything else is the one
 * file there is.
 *
 * A cover's smaller file is said to be 300 wide, as it is, and not IGDB's 264: a wall's large
 * cover, 192 pixels at 150%, needs 288, and would otherwise take the file twice the size.
 */
const steamFile = (imageId: string, size: ImageSize): ImageFile => {
  const path = imageId.replace('@2x', '')
  const { width } = imageSizes[size]
  const at = (file: string) => `${STEAM_IMAGES}/${file}`
  if (/\/ss_[^/]+$/.test(path))
    return width > 600
      ? { url: at(path.replace(/\.jpg$/i, '.1920x1080.jpg')), width: 1920 }
      : { url: at(path.replace(/\.jpg$/i, '.600x338.jpg')), width: 600 }
  if (path === imageId) return { url: at(path), width }
  return width > 300
    ? { url: at(path.replace(/(\.\w+)$/, '_2x$1')), width: 600 }
    : { url: at(path), width: 300 }
}

const fileOf = (imageId: string, size: ImageSize): ImageFile => {
  if (isSteamImage(imageId)) return steamFile(imageId, size)
  if (!IMAGE_ID.test(imageId)) throw new Error('Not an IGDB image id')
  return {
    url: `${IMAGE_HOST}/igdb/image/upload/t_${size}/${imageId}.webp`,
    width: imageSizes[size].width,
  }
}

export const imageUrl = (imageId: string, size: ImageSize): string => fileOf(imageId, size).url

const IMAGE_URL =
  /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_[a-z0-9_]+\/([a-z0-9_]+)\.\w+$/i

/** The image id in an address `imageUrl` made, as the API gives covers. Nothing for any other address. */
export const imageIdOf = (url: string): string | undefined => IMAGE_URL.exec(url)?.[1]

type Sources = { src: string; srcSet: string }

const sources = (imageId: string, sizes: readonly ImageSize[]): Sources => {
  // Steam's servers have fewer files than there are sizes: each is named once, at its own width.
  const files = new Map(sizes.map((size) => fileOf(imageId, size)).map((file) => [file.url, file]))
  return {
    // A browser without srcset support gets the 264-pixel cover, or the nearest to it.
    src: imageUrl(imageId, sizes.includes('cover_big') ? 'cover_big' : (sizes.at(-1) ?? 'cover_big')),
    srcSet: [...files.values()].map(({ url, width }) => `${url} ${width}w`).join(', '),
  }
}

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
 * A game's banner (the banner view): its store page's header on Steam, 460 pixels wide and 920
 * when `@2x` says that file is there, or IGDB's art at its two smaller screenshot sizes.
 */
export const bannerSources = (imageId: string): Sources => {
  if (!isSteamImage(imageId)) return sources(imageId, ['screenshot_med', 'screenshot_big'])
  const path = imageId.replace('@2x', '')
  const one = `${STEAM_IMAGES}/${path}`
  if (path === imageId) return { src: one, srcSet: `${one} 460w` }
  return {
    src: one,
    srcSet: `${one} 460w, ${STEAM_IMAGES}/${path.replace(/(\.\w+)$/, '_2x$1')} 920w`,
  }
}

/**
 * Key art behind a game's cover. It is dimmed to a third, so a file smaller
 * than the screen is never seen as soft, and on a phone's slow connection
 * the largest file was what held its page's largest paint back.
 */
export const backdropSources = (imageId: string): Sources =>
  sources(imageId, ['screenshot_med', 'screenshot_big'])
