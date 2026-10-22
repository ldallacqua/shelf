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

/** What a case needs of its game: no more, since a scene's games are sent to the browser. */
export type CaseGame = Pick<DemoGame, 'title' | 'cover' | 'colors' | 'led' | 'shape' | 'plastic'>

/** A game in "Ask it anything": its case, and its slug, which the filters find it by. */
export type AskGame = CaseGame & { slug: string }

type DemoCaseProps = {
  game: CaseGame
  /** `sizes` for the cover: how wide the case is drawn. */
  sizes: string
  /** One of the first covers on the page: fetched at once. */
  eager?: boolean
  /** Offered at the next size up too, for a sharp screen: the first screen's cases. */
  sharp?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * A game case with its cover, drawn without any script: the landing page's
 * shelves are pictures of the product, so a case here is not a control.
 * Its title is the image's alternative text. A case is never drawn wider
 * than about 110 pixels, so the cover comes in its two small sizes only,
 * over its darkest color until it arrives.
 */
export function DemoCase({ game, sizes, eager, sharp, className, style }: DemoCaseProps) {
  return (
    <GameCase
      shape={game.shape}
      frame={plastics[game.plastic]}
      led={game.led}
      className={cn('demo-case', className)}
      style={style}
    >
      <span className="cover" style={{ backgroundColor: game.colors[2] }}>
        {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={game.title}
          {...coverSources(game.cover, sharp ? 'cover_big' : 'cover_small_2x')}
          sizes={sizes}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
      </span>
    </GameCase>
  )
}
