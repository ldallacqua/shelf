'use client'

import { useState } from 'react'
import { thumbHashToDataURL } from 'thumbhash'

import type { Palette } from '@/domain/color/palette'
import { coverSources } from '@/domain/igdb/images'

import { pageIsLive } from './live'

type CoverProps = {
  /** IGDB image id. Without one, the title is set in type over the colors. */
  cover?: string
  colors?: Palette
  /** A ThumbHash of the cover, base64. */
  hash?: string
  title: string
  /** How wide the cover is drawn, for the browser to choose a file by: `sizes`. */
  sizes: string
  /** One of the first covers on the page: fetched at once, ahead of the rest. */
  eager?: boolean
  /** Drawn small (a box on the shelf, a thumbnail): the largest file is never worth fetching. */
  small?: boolean
}

const previews = new Map<string, string>()

/** A ThumbHash as an image address. Each is worked out once and kept. */
const previewOf = (hash: string): string | undefined => {
  const known = previews.get(hash)
  if (known) return known
  try {
    const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0))
    const address = thumbHashToDataURL(bytes)
    previews.set(hash, address)
    return address
  } catch {
    return undefined
  }
}

const wash = ([accent, second, base]: Palette): string =>
  `radial-gradient(90% 70% at 25% 18%, ${accent}, transparent 68%), radial-gradient(85% 75% at 85% 92%, ${second}, transparent 62%), ${base}`

/**
 * A cover, from IGDB's image servers. Until it arrives there is a wash of its
 * colors, then a blur of the cover itself; it is never a drawing of a cover.
 * If it cannot be loaded, the title is set in type over the colors.
 */
export function Cover({ cover, colors, hash, title, sizes, eager, small }: CoverProps) {
  // The page as the server built it shows its covers plainly, over a wash of
  // their colors. A cover that joins a live page (a row scrolled into view)
  // fades in over a blur of itself. Decided once, when the cover joins the
  // page, and never revisited: a cover that was there when the page went live
  // is not drawn again, and its blur, which nobody would see, is not worked out.
  const [joined] = useState(pageIsLive)
  const preview = joined && hash ? previewOf(hash) : undefined
  const fades = joined && !eager

  return (
    <span
      className="cover"
      style={{
        backgroundImage: preview ? `url("${preview}")` : colors ? wash(colors) : undefined,
      }}
    >
      {cover ? (
        // Covers come straight from IGDB's servers, which already resize and cache them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={title}
          {...coverSources(cover, small ? 'cover_big' : 'cover_big_2x')}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          draggable={false}
          data-pending={fades ? '' : undefined}
          ref={(image) => {
            // Already in the browser's cache: there is nothing to wait for.
            if (image?.complete && image.naturalWidth > 0) image.removeAttribute('data-pending')
          }}
          onLoad={(event) => event.currentTarget.removeAttribute('data-pending')}
          onError={(event) => {
            // Leave the wash and say the title in type instead.
            const image = event.currentTarget
            image.hidden = true
            image.parentElement?.setAttribute('data-failed', '')
          }}
        />
      ) : null}
      <span className="cover-title" aria-hidden={cover ? 'true' : undefined}>
        {title}
      </span>
    </span>
  )
}
