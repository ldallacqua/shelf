'use client'

import type { CSSProperties } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { ShowcaseGame } from '@/domain/setup/showcase'
import { Cover } from '@/features/library/cover'
import { GameCase, plastics } from '@/ui/game-case'

/**
 * One of my games on setting up's small shelves: its case in its platform's shape and plastic,
 * its cover drawn by `Cover` as everywhere, at small sizes. A picture, not a control: the shelf
 * it stands on is hidden from assistive technology, which hears the count in words.
 */
export function ShowcaseCase({
  game,
  sizes,
  order,
}: {
  game: ShowcaseGame
  /** How wide the cover is drawn, for the browser to choose a file by. */
  sizes: string
  /** Its place on the shelf: cases arrive one after another. */
  order: number
}) {
  return (
    <GameCase
      shape={game.shape}
      frame={plastics[game.plastic]}
      led={game.colors ? ledFrom(game.colors[0]) : undefined}
      className="setup-case"
      style={{ '--arrive': order } as CSSProperties}
    >
      <Cover
        cover={game.cover}
        colors={game.colors}
        hash={game.hash}
        title={game.title}
        sizes={sizes}
        small
      />
    </GameCase>
  )
}
