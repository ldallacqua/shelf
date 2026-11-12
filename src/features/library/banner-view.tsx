'use client'

import { LockIcon, StarIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { memo, useRef, type CSSProperties } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { shareFirstBoxes } from '@/domain/library/view'

import { Banner } from './banner'
import { GhostBanner } from './banner-ghosts'
import { describeBox, shelfName } from './describe'
import { Duration } from './duration'
import { FoldBody, FoldToggle } from './fold-toggle'
import { outOfTen } from './format'
import { platformFor } from './game-box'
import { StatusMark } from './status-mark'
import { useRowWindow } from './use-row-window'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'
import { useFollowOnHover } from './follow-hover'

/**
 * The banner view: each game as a wide card, the way Steam's lists and Hydra's library show
 * games. Its image is the header of its store page on Steam, which has its name drawn in, or
 * IGDB's art; under it, its title and a line of what is mine: status, platforms, hours, rating.
 */

/** What the browser is told about a banner's width: a card is about a fifth of a wide screen. */
const SIZES = '(min-width: 64rem) 22rem, (min-width: 40rem) 45vw, 100vw'

type BannerCellProps = {
  item: ShelfItem
  /** Position on its shelf, from 0. */
  index: number
  /** Its turn in the arrival stagger. */
  stagger: number
  shelfKey: string
  total: number
  platforms: ReadonlyMap<number, LibraryPlatform>
  enter: boolean
  eager: boolean
  onOpen: (box: OpenBox) => void
}

/**
 * One game as a banner. A component of its own, drawn again only when something about it
 * changes, as a grid redraws each time a row scrolls into view.
 */
const BannerCell = memo(function BannerCell({
  item,
  index,
  stagger,
  shelfKey,
  total,
  platforms,
  enter,
  eager,
  onOpen,
}: BannerCellProps) {
  const t = useTranslations('Library')
  const format = useFormatter()
  const { game, copy } = item
  const platform = platformFor(item, platforms)
  const owned = [...new Set(game.copies.map((held) => held.platform))]
    .map((id) => platforms.get(id)?.short)
    .filter((short) => short !== undefined)

  return (
    <li
      className="banner-cell"
      data-cell=""
      data-adult={game.adult ? '' : undefined}
      data-enter={enter ? '' : undefined}
      aria-posinset={index + 1}
      aria-setsize={total}
      style={{ '--i': stagger } as CSSProperties}
    >
      <button
        type="button"
        className="banner-box"
        data-status={game.status}
        data-flip={copy ? `${game.slug}:${copy.platform}` : game.slug}
        // A wide banner doesn't grow into a tall cover: the page opens as any other does.
        data-morph="off"
        aria-label={describeBox(item, platform, t)}
        onClick={() => onOpen({ key: shelfKey, index })}
        style={{ '--case-led': game.colors ? ledFrom(game.colors[0]) : undefined } as CSSProperties}
      >
        <span className="banner-art">
          <Banner
            {...(game.banner ? { banner: game.banner } : {})}
            {...(game.colors ? { colors: game.colors } : {})}
            title={game.title}
            sizes={SIZES}
            eager={eager}
          />
        </span>
        {/* All of it is in the button's name: this is for the eye. */}
        <span className="banner-info" aria-hidden="true">
          <span className="banner-name">{game.title}</span>
          <span className="banner-facts">
            <StatusMark status={game.status} label={t(`status.${game.status}`)} />
            {game.private ? <LockIcon className="size-3.5 flex-none" /> : null}
            {owned.length > 0 ? <span className="truncate">{owned.join(' · ')}</span> : null}
            {game.minutes > 0 ? (
              <span className="tabular-nums">
                <Duration minutes={game.minutes} />
              </span>
            ) : null}
            {game.rating === undefined ? null : (
              <span className="inline-flex items-center gap-1 tabular-nums">
                <StarIcon className="size-3.5 flex-none" />
                {format.number(outOfTen(game.rating), { maximumFractionDigits: 1 })}
              </span>
            )}
          </span>
        </span>
      </button>
    </li>
  )
})

type BannerGridProps = {
  shelf: DrawnShelf
  platforms: ReadonlyMap<number, LibraryPlatform>
  label: string
  /** Banners drawn before the layout is measured: this shelf's share of the first screen. */
  unmeasured: number
  onOpen: (box: OpenBox) => void
  enter: boolean
  eager: number
}

function BannerGrid({
  shelf,
  platforms,
  label,
  unmeasured,
  onOpen,
  enter,
  eager,
}: BannerGridProps) {
  const ref = useRef<HTMLUListElement>(null)
  const rowWindow = useRowWindow(ref, shelf.total)

  const from = rowWindow ? rowWindow.start * rowWindow.columns : 0
  const to = rowWindow
    ? Math.min(shelf.total, rowWindow.end * rowWindow.columns)
    : // At least one: a row's height is measured from a banner, or a ghost.
      Math.min(shelf.total, Math.max(1, unmeasured))
  const before = rowWindow ? rowWindow.start * rowWindow.pitch : 0
  const after = rowWindow ? (rowWindow.rows - rowWindow.end) * rowWindow.pitch : 0

  // With following on, the room takes the colors of the banner in focus.
  const follow = useFollowOnHover((index) => shelf.items[index]?.game.colors)

  return (
    // Safari stops calling a list a list once its bullets are styled away; the role says it again.
    // eslint-disable-next-line jsx-a11y/no-redundant-roles
    <ul
      ref={ref}
      role="list"
      data-grid-of={shelf.key}
      className="banner-grid"
      aria-label={label}
      {...follow}
      // Rows that are not near the screen are not in the page; padding keeps their place.
      style={{ paddingTop: before, paddingBottom: after }}
    >
      {Array.from({ length: to - from }, (_, offset) => {
        const index = from + offset
        const item = shelf.items[index]
        if (!item) return <GhostBanner key={`ghost-${index}`} index={offset} />
        return (
          <BannerCell
            key={`${item.game.slug}:${item.copy?.platform ?? ''}`}
            item={item}
            index={index}
            stagger={offset}
            shelfKey={shelf.key}
            total={shelf.total}
            platforms={platforms}
            enter={enter}
            eager={index < eager}
            onOpen={onOpen}
          />
        )
      })}
    </ul>
  )
}

/** One shelf of banners: its pinned label and its games. Its words are worked out once. */
function BannerSection({ shelf, ...grid }: Omit<BannerGridProps, 'label'>) {
  const t = useTranslations('Library')
  const name = shelfName(shelf, t)
  const headingId = `banners-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`

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
        <BannerGrid shelf={shelf} label={t('shelf.games', { shelf: name })} {...grid} />
      </FoldBody>
    </section>
  )
}

/**
 * The banner view (spec 3.8): the same shelves as the shelf, the wall and the list, each game a
 * wide card with its title and a line of what is mine under its banner.
 */
export function BannerView({ shelves, platforms, onOpen, enter, firstBoxes }: ViewProps) {
  // A banner takes the room of about four covers.
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    Math.max(4, Math.round(firstBoxes / 4)),
  )

  return (
    <div className="pb-6">
      {shelves.map((shelf, index) => (
        <BannerSection
          key={shelf.key}
          shelf={shelf}
          platforms={platforms}
          unmeasured={shares[index] ?? 0}
          onOpen={onOpen}
          enter={enter}
          eager={index === 0 ? 4 : 0}
        />
      ))}
    </div>
  )
}
