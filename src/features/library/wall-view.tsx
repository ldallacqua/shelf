'use client'

import { useTranslations } from 'next-intl'
import { memo, useRef, type CSSProperties } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { shareFirstBoxes } from '@/domain/library/view'

import { Cover } from './cover'
import { describeBox, shelfName } from './describe'
import { platformFor } from './game-box'
import type { WallSize } from './preferences'
import { StatusMark } from './status-mark'
import { useRowWindow } from './use-row-window'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'

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
  size: WallSize
  active: boolean
  enter: boolean
  eager: boolean
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
  size,
  active,
  enter,
  eager,
  onOpen,
}: WallCellProps) {
  const t = useTranslations('Library')
  const { game, copy } = item
  const platform = platformFor(item, platforms)
  const owned = [...new Set(game.copies.map((held) => held.platform))]
    .map((id) => platforms.get(id)?.short)
    .filter((short) => short !== undefined)

  return (
    <li
      className="wall-cell"
      data-cell=""
      data-enter={enter ? '' : undefined}
      aria-posinset={index + 1}
      aria-setsize={total}
      style={{ '--i': stagger } as CSSProperties}
    >
      <button
        type="button"
        className="wall-box"
        data-status={game.status}
        data-flip={copy ? `${game.slug}:${copy.platform}` : game.slug}
        data-active={active ? 'true' : undefined}
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
        />
        <span className="wall-marks" aria-hidden="true">
          <StatusMark status={game.status} label={t(`status.${game.status}`)} iconOnly />
          <span className="truncate">{owned.join(' · ')}</span>
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
  open?: OpenBox
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
  open,
  onOpen,
  enter,
  eager,
}: WallGridProps) {
  const ref = useRef<HTMLUListElement>(null)
  const rowWindow = useRowWindow(ref, shelf.total)

  const from = rowWindow ? rowWindow.start * rowWindow.columns : 0
  const to = rowWindow
    ? Math.min(shelf.items.length, rowWindow.end * rowWindow.columns)
    : // At least one: a row's height is measured from a cover.
      Math.min(shelf.items.length, Math.max(1, unmeasured))
  const before = rowWindow ? rowWindow.start * rowWindow.pitch : 0
  const after = rowWindow ? (rowWindow.rows - rowWindow.end) * rowWindow.pitch : 0

  return (
    // Safari stops calling a list a list once its bullets are styled away; the role says it again.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      ref={ref}
      role="list"
      className="wall-grid"
      data-size={size}
      aria-label={label}
      // Rows that are not near the screen are not in the page; padding keeps their place.
      style={{ paddingTop: before, paddingBottom: after }}
    >
      {shelf.items.slice(from, to).map((item, offset) => {
        const index = from + offset
        return (
          <WallCell
            key={`${item.game.slug}:${item.copy?.platform ?? ''}`}
            item={item}
            index={index}
            stagger={offset}
            shelfKey={shelf.key}
            total={shelf.total}
            platforms={platforms}
            size={size}
            active={open?.key === shelf.key && open.index === index}
            enter={enter}
            eager={index < eager}
            onOpen={onOpen}
          />
        )
      })}
    </ul>
  )
}

type WallViewProps = ViewProps & { size: WallSize }

/** One shelf on the wall: its pinned label and its covers. Its words are worked out once. */
function WallSection({ shelf, ...grid }: Omit<WallGridProps, 'label'>) {
  const t = useTranslations('Library')
  const name = shelfName(shelf, t)
  const headingId = `wall-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`

  return (
    <section aria-labelledby={headingId} className="mt-6 first:mt-4">
      <header className="wall-label">
        <h2 id={headingId} className="title text-base sm:text-lg">
          {name}
        </h2>
        <span className="readout text-[0.6875rem] text-muted">
          {t('shelf.count', { count: shelf.total })}
        </span>
      </header>
      <WallGrid shelf={shelf} label={t('shelf.games', { shelf: name })} {...grid} />
    </section>
  )
}

/**
 * The wall: covers in a dense grid with almost no chrome, the Letterboxd
 * way. A status mark and platform marks sit on each cover, and each shelf's
 * label stays pinned while its games scroll past (spec 3.8).
 */
export function WallView({
  shelves,
  platforms,
  open,
  onOpen,
  enter,
  firstBoxes,
  size,
}: WallViewProps) {
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
          open={open?.key === shelf.key ? open : undefined}
          onOpen={onOpen}
          enter={enter}
          eager={index === 0 ? 6 : 0}
        />
      ))}
    </div>
  )
}
