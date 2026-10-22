import type { CSSProperties } from 'react'

import type { Palette } from '@/domain/color/palette'
import { coverSources } from '@/domain/igdb/images'
import type { Status } from '@/domain/library/values'
import type { CaseShape, Plastic } from '@/domain/platforms/platforms'
import { cn } from '@/ui/cn'
import { GameCase, plastics } from '@/ui/game-case'

/**
 * A game on the example shelf, as the landing page draws it: what a box
 * needs, and the few facts a section shows beside it.
 */
export type DemoGame = {
  slug: string
  title: string
  cover: string
  colors: Palette
  /** The light it gives off in focus: from its cover. */
  led: string
  shape: CaseShape
  plastic: Plastic
  /** The platform's short name, as the shelf labels it. */
  platform: string
  format: 'physical' | 'digital'
  status: Status
  year?: number
  /** Hours for a normal playthrough. */
  length?: number
  /** Hours played. */
  hours: number
  /** Out of ten. */
  rating?: number
}

/** Washes the case in the cover's colors until the image arrives. */
const wash = ([accent, second, base]: Palette): string =>
  `radial-gradient(90% 70% at 25% 18%, ${accent}, transparent 68%), radial-gradient(85% 75% at 85% 92%, ${second}, transparent 62%), ${base}`

type DemoCaseProps = {
  game: DemoGame
  /** `sizes` for the cover: how wide the case is drawn. */
  sizes: string
  /** One of the first covers on the page: fetched at once. */
  eager?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * A game case with its cover, drawn without any script: the landing page's
 * shelves are pictures of the product, so a case here is not a control.
 * Its title is the image's alternative text.
 */
export function DemoCase({ game, sizes, eager, className, style }: DemoCaseProps) {
  return (
    <GameCase
      shape={game.shape}
      frame={plastics[game.plastic]}
      led={game.led}
      className={cn('demo-case', className)}
      style={style}
    >
      <span className="cover" style={{ backgroundImage: wash(game.colors) }}>
        {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={game.title}
          {...coverSources(game.cover, 'cover_big')}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : undefined}
          decoding="async"
          draggable={false}
        />
      </span>
    </GameCase>
  )
}
