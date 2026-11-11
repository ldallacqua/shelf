'use client'

import type { Palette } from '@/domain/color/palette'
import { bannerSources } from '@/domain/igdb/images'

type BannerProps = {
  /** An image id: Steam's header, or IGDB's art. Without one, the title is set in type over the colors. */
  banner?: string
  colors?: Palette
  title: string
  /** How wide the banner is drawn, for the browser to choose a file by: `sizes`. */
  sizes: string
  /** One of the first on the page: fetched at once, ahead of the rest. */
  eager?: boolean
}

const wash = ([accent, second, base]: Palette): string =>
  `radial-gradient(90% 120% at 15% 20%, ${accent}, transparent 65%), radial-gradient(80% 120% at 90% 90%, ${second}, transparent 60%), ${base}`

/**
 * A game's banner: its wide header from Steam, or IGDB's art. Until it arrives there is a wash of
 * its cover's colors; if it can't be loaded, the title is set in type over them, as a cover's is.
 * Never a drawing of a game.
 */
export function Banner({ banner, colors, title, sizes, eager }: BannerProps) {
  return (
    <span className="banner" style={{ backgroundImage: colors ? wash(colors) : undefined }}>
      {banner ? (
        // Straight from Steam's or IGDB's servers, which cache them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          {...bannerSources(banner)}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          draggable={false}
          onError={(event) => {
            const image = event.currentTarget
            image.hidden = true
            image.parentElement?.setAttribute('data-failed', '')
          }}
        />
      ) : null}
      <span className="banner-title" aria-hidden="true">
        {title}
      </span>
    </span>
  )
}
