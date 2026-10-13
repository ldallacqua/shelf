'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRef } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'

import { Cover } from './cover'
import { describeBox, shelfName } from './describe'
import { dateOf, hoursOf, outOfTen } from './format'
import { platformFor } from './game-box'
import { StatusMark } from './status-mark'
import { useRowWindow } from './use-row-window'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'

/** Rows drawn before the layout is measured. */
const UNMEASURED = 30

/** Columns a phone has no room for. Their content is in the game's details instead. */
const WIDE = 'hidden lg:table-cell'
const MEDIUM = 'hidden md:table-cell'
/** The same, for the <col> that sizes each of those columns. */
const WIDE_COLUMN = 'hidden lg:[display:table-column]'
const MEDIUM_COLUMN = 'hidden md:[display:table-column]'

type ListTableProps = {
  shelf: DrawnShelf
  platforms: ReadonlyMap<number, LibraryPlatform>
  caption: string
  open?: OpenBox
  onOpen: (box: OpenBox) => void
}

function ListTable({ shelf, platforms, caption, open, onOpen }: ListTableProps) {
  const t = useTranslations('Library')
  const format = useFormatter()
  const body = useRef<HTMLTableSectionElement>(null)
  const rowWindow = useRowWindow(body, shelf.total, 6)

  const from = rowWindow ? rowWindow.start : 0
  const to = rowWindow
    ? Math.min(shelf.items.length, rowWindow.end)
    : Math.min(shelf.items.length, UNMEASURED)
  const before = rowWindow ? rowWindow.start * rowWindow.pitch : 0
  const after = rowWindow ? (rowWindow.rows - rowWindow.end) * rowWindow.pitch : 0

  const day = (value: string | undefined) =>
    value
      ? format.dateTime(dateOf(value), { dateStyle: 'medium', timeZone: 'UTC' })
      : t('list.none')

  const describe = (item: ShelfItem, platform: LibraryPlatform | undefined) =>
    describeBox(item, platform, t)

  return (
    <table className="game-table" aria-rowcount={shelf.total + 1}>
      <caption className="sr-only">{caption}</caption>
      <colgroup>
        <col className="w-15" />
        <col />
        <col className="w-24 sm:w-44" />
        <col className="w-12 sm:w-36" />
        <col className={`${MEDIUM_COLUMN} w-24`} />
        <col className={`${MEDIUM_COLUMN} w-20`} />
        <col className={`${MEDIUM_COLUMN} w-24`} />
        <col className={`${WIDE_COLUMN} w-36`} />
        <col className={`${WIDE_COLUMN} w-36`} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">{t('list.cover')}</span>
          </th>
          <th scope="col">{t('list.title')}</th>
          <th scope="col">{t('list.platforms')}</th>
          <th scope="col">
            <span className="max-sm:sr-only">{t('list.status')}</span>
          </th>
          <th scope="col" data-number="" className={MEDIUM}>
            {t('list.rating')}
          </th>
          <th scope="col" data-number="" className={MEDIUM}>
            {t('list.igdb')}
          </th>
          <th scope="col" data-number="" className={MEDIUM}>
            {t('list.playtime')}
          </th>
          <th scope="col" className={WIDE}>
            {t('list.added')}
          </th>
          <th scope="col" className={WIDE}>
            {t('list.completed')}
          </th>
        </tr>
      </thead>
      <tbody ref={body}>
        {/* Rows that are not near the screen are not in the page; these keep their place. */}
        {before > 0 ? (
          <tr aria-hidden="true">
            <td colSpan={9} style={{ height: before, padding: 0, border: 0 }} />
          </tr>
        ) : null}
        {shelf.items.slice(from, to).map((item, offset) => {
          const index = from + offset
          const { game, copy } = item
          const platform = platformFor(item, platforms)
          const hours = hoursOf(game.minutes)
          const isOpen = open?.key === shelf.key && open.index === index
          return (
            <tr
              key={`${game.slug}:${copy?.platform ?? ''}`}
              data-cell=""
              data-active={isOpen ? 'true' : undefined}
              aria-rowindex={index + 2}
            >
              <td>
                <span className="game-thumb" aria-hidden="true">
                  <Cover
                    cover={copy?.cover ?? game.cover}
                    colors={game.colors}
                    hash={game.hash}
                    title=""
                    sizes="36px"
                    small
                  />
                </span>
              </td>
              <td>
                <button
                  type="button"
                  className="game-link"
                  data-flip={copy ? `${game.slug}:${copy.platform}` : game.slug}
                  aria-label={describe(item, platform)}
                  onClick={() => onOpen({ key: shelf.key, index })}
                >
                  {game.title}
                </button>
                {game.year ? (
                  <span className="block readout text-[0.625rem] text-muted">{game.year}</span>
                ) : null}
              </td>
              <td className="text-muted">
                {game.copies.length > 0 ? (
                  game.copies.map((owned) => {
                    const on = platforms.get(owned.platform)
                    return (
                      <span
                        key={`${owned.platform}:${owned.format}`}
                        className="mr-2 inline-flex items-baseline gap-1 last:mr-0"
                      >
                        <span className="text-text">{on?.short}</span>
                        <span className="readout text-[0.5625rem]">
                          {t(`formatShort.${owned.format}`)}
                        </span>
                      </span>
                    )
                  })
                ) : (
                  <span>{t('list.none')}</span>
                )}
              </td>
              <td>
                <StatusMark
                  status={game.status}
                  label={t(`status.${game.status}`)}
                  className="[&>span]:max-sm:sr-only"
                />
              </td>
              <td data-number="" className={MEDIUM}>
                {game.rating === undefined
                  ? t('list.none')
                  : format.number(outOfTen(game.rating), { maximumFractionDigits: 1 })}
              </td>
              <td data-number="" className={`${MEDIUM} text-muted`}>
                {game.igdbRating ?? t('list.none')}
              </td>
              <td data-number="" className={MEDIUM}>
                {hours > 0 ? t('hoursShort', { count: hours }) : t('list.none')}
              </td>
              <td className={`${WIDE} text-muted`}>{day(game.addedOn)}</td>
              <td className={`${WIDE} text-muted`}>{day(game.completedOn)}</td>
            </tr>
          )
        })}
        {after > 0 ? (
          <tr aria-hidden="true">
            <td colSpan={9} style={{ height: after, padding: 0, border: 0 }} />
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

/**
 * The list: one compact row per game, for fast scanning. A real table, so a
 * screen reader can read across a row and down a column. On a phone it keeps
 * the cover, title, platforms and status; the rest is in the game's details
 * (spec 3.8).
 */
export function ListView({ shelves, platforms, open, onOpen }: ViewProps) {
  const t = useTranslations('Library')

  return (
    <div className="pb-6">
      {shelves.map((shelf) => {
        const name = shelfName(shelf, t)
        const headingId = `list-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`
        return (
          <section key={shelf.key} aria-labelledby={headingId} className="mt-8 first:mt-4">
            <header className="flex items-baseline gap-3 pb-1">
              <h2 id={headingId} className="title text-base sm:text-lg">
                {name}
              </h2>
              <span className="readout text-[0.6875rem] text-muted">
                {t('shelf.count', { count: shelf.total })}
              </span>
            </header>
            <ListTable
              shelf={shelf}
              platforms={platforms}
              caption={t('shelf.games', { shelf: name })}
              open={open}
              onOpen={onOpen}
            />
          </section>
        )
      })}
    </div>
  )
}
