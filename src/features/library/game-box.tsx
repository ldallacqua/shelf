'use client'

import { CheckIcon } from 'lucide-react'
import type { CSSProperties, KeyboardEvent } from 'react'

import { fromHex, ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { caseShapes, GameCase, plastics, type CaseShape } from '@/ui/game-case'

import { Cover } from './cover'
import type { Density } from './preferences'

/** What a box is drawn as when nothing says otherwise: a game with no platform known. */
const PLAIN_SHAPE: CaseShape = 'keepCase'

/** The platform whose case a box is drawn in: the copy's, or the first the game came out on. */
export const platformFor = (
  item: ShelfItem,
  platforms: ReadonlyMap<number, LibraryPlatform>,
): LibraryPlatform | undefined => {
  if (item.copy) return platforms.get(item.copy.platform)
  for (const id of item.game.platforms) {
    const platform = platforms.get(id)
    if (platform) return platform
  }
  return undefined
}

/** How many platforms a game is owned on. */
export const platformsOwned = (item: ShelfItem): number =>
  new Set(item.game.copies.map((copy) => copy.platform)).size

/** White or near-black, whichever reads on a color. */
const inkOn = (hex: string): string => {
  const [r, g, b] = fromHex(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#14171f' : '#ffffff'
}

/**
 * `sizes` for a cover on the shelf: how wide a case is drawn at each scale
 * (see `--mm` in shelf.css), a little under, so a screen twice as sharp takes
 * the next file down and not the next up.
 */
const SHELF_SIZES = '(min-width: 64rem) 128px, (min-width: 40rem) 116px, 100px'

export type GameBoxProps = {
  item: ShelfItem
  platform?: LibraryPlatform
  density: Density
  /** The whole description, for assistive technology: title, platform, format, status. */
  label: string
  /** Lifted and lit in its own color: under the pointer, in focus, or open. */
  active: boolean
  /** Whether Tab stops here. One box per shelf does; arrow keys reach the rest. */
  tabbable: boolean
  /** Position on its shelf, from 0. */
  index: number
  /** One of the first covers on the page. */
  eager?: boolean
  onOpen: () => void
  /** Arrow keys and the like: the shelf decides where they lead. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}

/**
 * One game on the shelf, as an object you can pick up: a case in its
 * platform's shape and plastic, with the cover behind it. In the compact
 * shelf it stands sideways and shows its spine.
 *
 * Its state shows in its posture and marks, never by color alone (spec 3.2),
 * and `label` says the same in words.
 */
export function GameBox({
  item,
  platform,
  density,
  label,
  active,
  tabbable,
  index,
  eager,
  onOpen,
  onKeyDown,
}: GameBoxProps) {
  const { game, copy } = item
  const shape = platform?.shape ?? PLAIN_SHAPE
  const frame = plastics[platform?.plastic ?? 'black']
  const led = game.colors ? ledFrom(game.colors[0]) : undefined
  const size = caseShapes[shape]
  const owned = platformsOwned(item)
  const coverId = copy?.cover ?? game.cover
  // A download has no case around it. A wishlist game keeps its outline.
  const loose = copy?.format === 'digital' && game.status !== 'wishlist'

  let body
  if (density === 'compact') {
    const base = game.colors?.[2]
    body = (
      <span
        className="game-spine"
        data-active={active ? 'true' : undefined}
        style={
          {
            height: `calc(var(--mm) * ${size.height})`,
            '--spine': base,
            '--spine-ink': base ? inkOn(base) : undefined,
            '--case-frame': frame,
            '--case-led': led,
          } as CSSProperties
        }
      >
        <span className="game-spine-title">{game.title}</span>
      </span>
    )
  } else if (loose) {
    // The cover alone, at the size it would have inside its case.
    body = (
      <span
        className="game-loose"
        data-active={active ? 'true' : undefined}
        style={
          {
            width: `calc(var(--mm) * ${Math.round(size.width * 0.95)})`,
            height: `calc(var(--mm) * ${Math.round(size.height * 0.89)})`,
            '--case-led': led,
          } as CSSProperties
        }
      >
        <Cover
          cover={coverId}
          colors={game.colors}
          hash={game.hash}
          title={game.title}
          sizes={SHELF_SIZES}
          eager={eager}
          small
        />
      </span>
    )
  } else {
    body = (
      <GameCase shape={shape} frame={frame} led={led} active={active}>
        <Cover
          cover={coverId}
          colors={game.colors}
          hash={game.hash}
          title={game.title}
          sizes={SHELF_SIZES}
          eager={eager}
          small
        />
      </GameCase>
    )
  }

  return (
    <button
      type="button"
      className="game-box"
      data-status={game.status}
      data-index={index}
      data-flip={copy ? `${game.slug}:${copy.platform}` : game.slug}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      style={density === 'compact' ? { width: '100%' } : undefined}
    >
      {body}
      {game.status === 'playing' ? <span className="game-live" aria-hidden="true" /> : null}
      {game.status === 'completed' && density === 'covers' ? (
        <span className="game-seal" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : null}
      {owned > 1 && density === 'covers' ? (
        <span className="game-count" aria-hidden="true">
          {owned}
        </span>
      ) : null}
    </button>
  )
}
