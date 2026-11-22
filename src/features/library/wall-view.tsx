'use client'

import { LockIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { memo, useRef, type CSSProperties, type KeyboardEvent } from 'react'

import { ledFrom } from '@/domain/color/palette'
import { WALL_FILL_WITHIN, WALL_FRAME, coverFit, ratioOfCover } from '@/domain/library/cover-fit'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { shareFirstBoxes } from '@/domain/library/view'

import { Cover } from './cover'
import { describeBox, shelfName } from './describe'
import { FoldBody, FoldToggle } from './fold-toggle'
import { platformFor } from './game-box'
import { GhostHeading } from './ghosts'
import type { WallSize } from './preferences'
import { StatusMark } from './status-mark'
import { useRovingShelf } from './use-roving'
import { useRowWindow } from './use-row-window'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'
import { useFollowOnHover } from './follow-hover'
import { ghostOrder } from '@/ui/ghost'

/**
 * What the browser is told about a cover's width on the wall, by size: a
 * little under what is drawn, so a screen twice as sharp takes the next file
 * down and not the next up.
 */
const SIZES: Record<WallSize, string> = {
  small: '80px',
  medium: '(min-width: 40rem) 128px, 100px',
  large: '(min-width: 40rem) 192px, 152px',
}

type WallCellProps = {
  item: ShelfItem
  /** Position on its shelf, from 0. */
  index: number
  /** Its turn in the arrival stagger. */
  stagger: number
  shelfKey: string
  total: number
  platforms: ReadonlyMap<number, LibraryPlatform>
  /** The platform its shelf is for, when the wall is grouped by platform: said by the shelf's name, so left out of its marks. */
  shelfPlatform: number | undefined
  size: WallSize
  enter: boolean
  eager: boolean
  /** Where Tab stops on its shelf: one cover a shelf (`useRovingShelf`). */
  tabbable: boolean
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onOpen: (box: OpenBox) => void
}

/**
 * One cover on the wall. A component of its own, drawn again only when
 * something about it changes: its name is worded through the translator, and
 * a wall redraws every time a row scrolls into view.
 */
const WallCell = memo(function WallCell({
  item,
  index,
  stagger,
  shelfKey,
  total,
  platforms,
  shelfPlatform,
  size,
  enter,
  eager,
  tabbable,
  onKeyDown,
  onOpen,
}: WallCellProps) {
  const t = useTranslations('Library')
  const { game, copy } = item
  const platform = platformFor(item, platforms)
  const owned = [...new Set(game.copies.map((held) => held.platform))]
    .filter((id) => id !== shelfPlatform)
    .map((id) => platforms.get(id)?.short)
    .filter((short) => short !== undefined)
  // A version's own cover has no shape in the library file: Steam's is a capsule, IGDB's unknown.
  const fit = coverFit(
    copy?.cover ? ratioOfCover(copy.cover) : ratioOfCover(game.cover, game.coverRatio),
    WALL_FRAME,
    WALL_FILL_WITHIN,
  )

  return (
    <li
      className="wall-cell"
      data-cell=""
      data-adult={game.adult ? '' : undefined}
      data-enter={enter ? '' : undefined}
      aria-posinset={index + 1}
      aria-setsize={total}
      style={{ '--i': stagger } as CSSProperties}
    >
      <button
        type="button"
        className="wall-box"
        data-index={index}
        tabIndex={tabbable ? 0 : -1}
        onKeyDown={onKeyDown}
        data-status={game.status}
        data-flip={copy ? `${game.slug}:${copy.platform}` : game.slug}
        aria-label={describeBox(item, platform, t)}
        onClick={() => onOpen({ key: shelfKey, index })}
        style={{ '--case-led': game.colors ? ledFrom(game.colors[0]) : undefined } as CSSProperties}
      >
        <Cover
          cover={copy?.cover ?? game.cover}
          colors={game.colors}
          hash={game.hash}
          title={game.title}
          sizes={SIZES[size]}
          eager={eager}
          small={size !== 'large'}
          fit={fit}
        />
        {/* Its name says all of these in words. The platforms show only while pointed at or reached. */}
        <span className="wall-marks" aria-hidden="true">
          <span className="wall-mark">
            <StatusMark status={game.status} label={t(`status.${game.status}`)} iconOnly />
            {game.private ? <LockIcon className="size-3.5 flex-none" /> : null}
          </span>
          {owned.length > 0 ? (
            // Each name kept whole, and each dot with the name before it: a long list wraps between platforms.
            <span className="wall-mark wall-mark-platforms">
              {owned.map((short) => short.replaceAll(' ', '\u00a0')).join('\u00a0· ')}
            </span>
          ) : null}
        </span>
      </button>
    </li>
  )
})

type WallGridProps = {
  shelf: DrawnShelf
  platforms: ReadonlyMap<number, LibraryPlatform>
  size: WallSize
  label: string
  /** Covers drawn before the layout is measured: this shelf's share of the first screen. */
  unmeasured: number
  onOpen: (box: OpenBox) => void
  enter: boolean
  eager: number
}

function WallGrid({
  shelf,
  platforms,
  size,
  label,
  unmeasured,
  onOpen,
  enter,
  eager,
}: WallGridProps) {
  const ref = useRef<HTMLUListElement>(null)
  const rowWindow = useRowWindow(ref, shelf.total)
  // With following on, the room takes the colors of the cover in focus.
  const follow = useFollowOnHover((index) => shelf.items[index]?.game.colors)
  const roving = useRovingShelf(ref, shelf.items.length, rowWindow?.columns)

  // Every place on the shelf, the ones whose covers come with the library file included: those hold ghosts.
  const from = rowWindow ? rowWindow.start * rowWindow.columns : 0
  const to = rowWindow
    ? Math.min(shelf.total, rowWindow.end * rowWindow.columns)
    : // At least one: a row's height is measured from a cover, or a ghost.
      Math.min(shelf.total, Math.max(1, unmeasured))
  const before = rowWindow ? rowWindow.start * rowWindow.pitch : 0
  const after = rowWindow ? (rowWindow.rows - rowWindow.end) * rowWindow.pitch : 0

  return (
    // Safari stops calling a list a list once its bullets are styled away; the role says it again.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      ref={ref}
      role="list"
      data-grid-of={shelf.key}
      className="wall-grid"
      data-size={size}
      aria-label={label}
      data-roving=""
      // The shelf's stop while none of its games is drawn (`useRovingShelf`).
      tabIndex={roving.gridTabIndex(from, to)}
      {...follow}
      onFocus={(event) => {
        follow.onFocus(event)
        roving.onFocus(event)
      }}
      // Rows that are not near the screen are not in the page; padding keeps their place.
      style={{ paddingTop: before, paddingBottom: after }}
    >
      {Array.from({ length: to - from }, (_, offset) => {
        const index = from + offset
        const item = shelf.items[index]
        if (!item) return <GhostCover key={`ghost-${index}`} index={offset} />
        return (
          <WallCell
            key={`${item.game.slug}:${item.copy?.platform ?? ''}`}
            item={item}
            index={index}
            stagger={offset}
            shelfKey={shelf.key}
            total={shelf.total}
            platforms={platforms}
            shelfPlatform={shelf.kind === 'platform' ? shelf.platform.id : undefined}
            size={size}
            enter={enter}
            eager={index < eager}
            tabbable={index === roving.tabStop(from, to)}
            onKeyDown={roving.onKeyDown}
            onOpen={onOpen}
          />
        )
      })}
    </ul>
  )
}

/** A cover-shaped place on the wall, for a cover on its way. */
function GhostCover({ index }: { index: number }) {
  return (
    <li
      className="wall-cell"
      data-cell=""
      data-ghost=""
      aria-hidden="true"
      style={ghostOrder(index)}
    >
      <span className="ghost size-full" />
    </li>
  )
}

/** The wall before its shelves are known: two shelves' labels and covers. */
export function GhostWall({ size }: { size: WallSize }) {
  return (
    <div className="pb-6" aria-hidden="true">
      {[24, 12].map((count, shelf) => (
        <section key={shelf} className="mt-6 first:mt-4">
          <GhostHeading className="wall-label" />
          <ul className="wall-grid" data-size={size}>
            {Array.from({ length: count }, (_, index) => (
              <GhostCover key={index} index={index} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

type WallViewProps = ViewProps & { size: WallSize }

/** One shelf on the wall: its pinned label and its covers. Its words are worked out once. */
function WallSection({ shelf, ...grid }: Omit<WallGridProps, 'label'>) {
  const t = useTranslations('Library')
  const name = shelfName(shelf, t)
  const headingId = `wall-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`

  return (
    <section aria-labelledby={headingId} data-shelf={shelf.key} className="mt-6 first:mt-4">
      <header className="wall-label">
        <FoldToggle shelfKey={shelf.key} name={name} controls={`${headingId}-games`} />
        <h2 id={headingId} className="title text-base sm:text-lg">
          {name}
        </h2>
        <span className="readout text-[0.6875rem] text-muted">
          {t('shelf.count', { count: shelf.total })}
        </span>
      </header>
      <FoldBody shelfKey={shelf.key} id={`${headingId}-games`}>
        <WallGrid shelf={shelf} label={t('shelf.games', { shelf: name })} {...grid} />
      </FoldBody>
    </section>
  )
}

/**
 * The wall: covers in a dense grid with almost no chrome, the Letterboxd
 * way. A small status mark sits in each cover's corner, its platforms come up
 * beside it while it is pointed at or reached, and each shelf's label stays pinned while its games scroll past (spec 3.8).
 */
export function WallView({ shelves, platforms, onOpen, enter, firstBoxes, size }: WallViewProps) {
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    firstBoxes,
  )

  return (
    <div className="pb-6">
      {shelves.map((shelf, index) => (
        <WallSection
          key={shelf.key}
          shelf={shelf}
          platforms={platforms}
          size={size}
          unmeasured={shares[index] ?? 0}
          onOpen={onOpen}
          enter={enter}
          eager={index === 0 ? 6 : 0}
        />
      ))}
    </div>
  )
}
