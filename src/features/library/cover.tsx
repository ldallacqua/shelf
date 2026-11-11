'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { Palette } from '@/domain/color/palette'
import type { CoverFit } from '@/domain/library/cover-fit'
import { coverSources } from '@/domain/igdb/images'

import { pageIsLive } from './live'
import { previewIfReady, requestPreview } from './preview-queue'

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
  /**
   * A file of this cover the page already shows, such as the shelf's smaller
   * one: drawn underneath at once, so a cover opened from the shelf is never
   * blank while its larger file loads.
   */
  placeholder?: string
  /**
   * How it stands in its frame (`coverFit`): filling it, or whole inside it, over its own
   * colors, when it is another shape. Filling it, unless said.
   */
  fit?: CoverFit
}

/**
 * A file of each cover already on this page, by the cover's id: the last to arrive, or the
 * shelf's under one opened from it. A cover drawn again on the device, such as a game's page as
 * the server draws it after the one the library drew, has it underneath at once, and never drops
 * back to a blur while its own file comes.
 */
const arrivedFiles = new Map<string, string>()

const noChange = () => () => {}
const onDevice = () => true
const onServer = () => false

const wash = ([accent, second, base]: Palette): string =>
  `radial-gradient(90% 70% at 25% 18%, ${accent}, transparent 68%), radial-gradient(85% 75% at 85% 92%, ${second}, transparent 62%), ${base}`

/**
 * A cover, from IGDB's image servers. Until it arrives there is a wash of its
 * colors, then a blur of the cover itself; it is never a drawing of a cover.
 * If it cannot be loaded, the title is set in type over the colors.
 */
export function Cover({
  cover,
  colors,
  hash,
  title,
  sizes,
  eager,
  small,
  placeholder,
  fit,
}: CoverProps) {
  // The page as the server built it has its covers over a wash of their colors.
  // A cover that joins a live page (a row scrolled into view) is over a blur of
  // itself. Decided once, when the cover joins the page, and never revisited: a
  // cover that was there when the page went live is not drawn again, and its
  // blur, which nobody would see, is not worked out. Either way it fades in as
  // it arrives, as every image does (`image-script.tsx`).
  const [joined] = useState(pageIsLive)
  // False on the server and while the browser brings its page to life, so both draw it alike.
  const drawnOnDevice = useSyncExternalStore(noChange, onDevice, onServer)
  const whole = fit === 'whole'
  // A file of it already on this page, for a cover drawn again. Not under one drawn whole, whose
  // bands keep its blur.
  const [arrived] = useState(() =>
    drawnOnDevice && cover && !placeholder && !whole ? arrivedFiles.get(cover) : undefined,
  )
  const underneath = placeholder ?? arrived
  // The blur is worked out when the browser is idle, and only while the
  // image is still on its way.
  const [preview, setPreview] = useState(() => (joined && hash ? previewIfReady(hash) : undefined))
  const image = useRef<HTMLImageElement>(null)
  const forget = useRef<(() => void) | undefined>(undefined)
  useEffect(() => {
    if (cover && placeholder && !arrivedFiles.has(cover)) arrivedFiles.set(cover, placeholder)
  }, [cover, placeholder])
  useEffect(() => {
    // With a file of it already underneath, a blur would only be worse.
    if (!hash || !cover || underneath) return
    // A cover drawn whole keeps its blur in the bands around it, as long as it is drawn: the
    // colors at its own edges, where the wash's would be anywhere's.
    if (whole) return requestPreview(hash, setPreview)
    if (!joined) return
    if (image.current?.complete) return
    forget.current = requestPreview(hash, setPreview)
    return () => forget.current?.()
  }, [joined, hash, cover, underneath, whole])

  return (
    <span
      className="cover"
      data-fit={fit === 'whole' ? 'whole' : undefined}
      style={{
        backgroundImage: underneath
          ? `url("${underneath}")`
          : preview
            ? `url("${preview}")`
            : colors
              ? wash(colors)
              : undefined,
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
          ref={image}
          onLoad={(event) => {
            forget.current?.()
            const file = event.currentTarget.currentSrc
            if (cover && file) arrivedFiles.set(cover, file)
          }}
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
