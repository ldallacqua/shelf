import 'server-only'

import sharp from 'sharp'
import { rgbaToThumbHash } from 'thumbhash'

import { extractPalette } from '@/domain/color/palette'
import { imageUrl } from '@/domain/igdb/images'
import type { CoverArt } from '@/server/library/store'

/**
 * Reads a cover once, when a game is added, and keeps two small things from
 * it: three colors (they light the shelf and paint the placeholder) and a
 * ThumbHash (about 25 bytes that become a blurred preview while the real
 * cover loads).
 */

/** ThumbHash wants a small image; 100 pixels a side is its limit. */
const SAMPLE = { width: 48, height: 64 }

export const coverArtFromImage = async (bytes: Uint8Array): Promise<CoverArt> => {
  const { data, info } = await sharp(bytes)
    .resize(SAMPLE.width, SAMPLE.height, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const hash = rgbaToThumbHash(info.width, info.height, data)
  return {
    colors: extractPalette(data),
    thumbhash: Buffer.from(hash).toString('base64'),
  }
}

/** Undefined when the cover cannot be fetched or decoded: a game is still addable without it. */
export const readCoverArt = async (
  imageId: string,
  fetcher: typeof fetch = fetch,
): Promise<CoverArt | undefined> => {
  try {
    const response = await fetcher(imageUrl(imageId, 'cover_small'), {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return undefined
    return await coverArtFromImage(new Uint8Array(await response.arrayBuffer()))
  } catch {
    return undefined
  }
}
