'use client'

import { CheckIcon, InfinityIcon } from 'lucide-react'
import { memo, type CSSProperties, type KeyboardEvent } from 'react'

import { fromHex, ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { caseShapes, GameCase, plastics, type CaseShape } from '@/ui/game-case'

import { Cover } from './cover'
import { SHELF_SIZES } from './opening-covers'
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

export type GameBoxProps = {
  item: ShelfItem
  platform?: LibraryPlatform
  density: Density
  /**
   * The whole description, for assistive technology: title, platform, format,
   * status. Given as the words, or as the function that words it, which is
   * then only called when the box is drawn.
   */
  label: string | ((item: ShelfItem, platform: LibraryPlatform | undefined) => string)
  /** Lifted and lit in its own color: under the pointer, in focus, or open. */
  active: boolean
  /** Whether Tab stops here. One box per shelf does; arrow keys reach the rest. */
  tabbable: boolean
  /** Position on its shelf, from 0. */
  index: number
  /** One of the first covers on the page. */
  eager?: boolean
  /** Both are told which box, by position, so one function can serve a whole shelf. */
  onOpen: (index: number) => void
  /** Arrow keys and the like: the shelf decides where they lead. */
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void
}

/**
 * Whether a box would be drawn the same. Shelves are arranged anew on every
 * regroup, and the pair of game and copy is made anew with them; the game and
 * the copy inside the pair are not, so those are what is compared.
 */
const sameBox = (before: GameBoxProps, after: GameBoxProps): boolean =>
  before.item.game === after.item.game &&
  before.item.copy === after.item.copy &&
  before.platform === after.platform &&
  before.density === after.density &&
  before.label === after.label &&
  before.active === after.active &&
  before.tabbable === after.tabbable &&
  before.index === after.index &&
  before.eager === after.eager &&
  before.onOpen === after.onOpen &&
  before.onKeyDown === after.onKeyDown

/**
 * One game on the shelf, as an object you can pick up: a case in its
 * platform's shape and plastic, with the cover behind it. In the compact
 * shelf it stands sideways and shows its spine.
 *
 * Its state shows in its posture and marks, never by color alone (spec 3.2),
 * and `label` says the same in words.
 *
 * A shelf redraws often: a row scrolls into view, the pointer moves to the
 * next box, the rest of the library arrives. A box is only drawn again when
 * something about it changed (`sameBox`), which is what keeps a pointer
 * crossing a full shelf, and a slow phone taking over the page, from stalling.
 */
export const GameBox = memo(function GameBox({
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
      aria-label={typeof label === 'string' ? label : label(item, platform)}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onOpen(index)}
      onKeyDown={onKeyDown ? (event) => onKeyDown(event, index) : undefined}
      style={density === 'compact' ? { width: '100%' } : undefined}
    >
      {body}
      {game.status === 'playing' ? <span className="game-live" aria-hidden="true" /> : null}
      {game.status === 'completed' && density === 'covers' ? (
        <span className="game-seal" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : null}
      {game.status === 'retired' && density === 'covers' ? (
        <span className="game-tag" aria-hidden="true">
          <InfinityIcon />
        </span>
      ) : null}
      {owned > 1 && density === 'covers' ? (
        <span className="game-count" aria-hidden="true">
          {owned}
        </span>
      ) : null}
    </button>
  )
}, sameBox)
