'use client'

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useRef, type ReactNode } from 'react'

import type { ShelfItem } from '@/domain/library/group'
import type { LibraryPlatform } from '@/domain/library/library'
import { naturalSort, type Sort, type SortKey } from '@/domain/library/sort'
import { shareFirstBoxes } from '@/domain/library/view'

import { Cover } from './cover'
import { describeBox, shelfName } from './describe'
import { FoldBody, FoldToggle } from './fold-toggle'
import { dateOf, hoursOf, outOfTen } from './format'
import { platformFor } from './game-box'
import { GhostHeading, ghostOrder } from './ghosts'
import { StatusMark } from './status-mark'
import { useRowWindow } from './use-row-window'
import type { DrawnShelf, OpenBox, ViewProps } from './view-props'

/** Rows drawn before the layout is measured, over all the tables: two screens of them. */
const FIRST_ROWS = 30

/** Columns a phone has no room for. Their content is in the game's details instead. */
const WIDE = 'hidden lg:table-cell'
const MEDIUM = 'hidden md:table-cell'
/** The same, for the <col> that sizes each of those columns. */
const WIDE_COLUMN = 'hidden lg:[display:table-column]'
const MEDIUM_COLUMN = 'hidden md:[display:table-column]'

/** The list's columns and their widths. */
function ListColumns() {
  return (
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
  )
}

/** Clicking a heading sorts by it; clicking it again reverses it (spec 3.8). */
type Sorting = { sort?: Sort; onSort?: (sort: Sort) => void }

function Heading({
  sortKey,
  sort,
  onSort,
  children,
  className,
  number,
}: Sorting & { sortKey: SortKey; children: ReactNode; className?: string; number?: boolean }) {
  const active = sort?.key === sortKey
  const direction = active ? (sort.descending ? 'descending' : 'ascending') : undefined
  return (
    <th
      scope="col"
      aria-sort={direction}
      data-number={number ? '' : undefined}
      className={className}
    >
      {onSort ? (
        <button
          type="button"
          className="game-sort"
          onClick={() =>
            onSort(active ? { ...sort, descending: !sort.descending } : naturalSort(sortKey))
          }
        >
          {children}
          {active ? (
            sort.descending ? (
              <ArrowDownIcon aria-hidden="true" className="size-3" />
            ) : (
              <ArrowUpIcon aria-hidden="true" className="size-3" />
            )
          ) : null}
        </button>
      ) : (
        children
      )}
    </th>
  )
}

type ListTableProps = Sorting & {
  shelf: DrawnShelf
  platforms: ReadonlyMap<number, LibraryPlatform>
  caption: string
  /** Rows drawn before the layout is measured: this table's share of the first screen. */
  unmeasured: number
  open?: OpenBox
  onOpen: (box: OpenBox) => void
}

function ListTable({
  shelf,
  platforms,
  caption,
  unmeasured,
  open,
  onOpen,
  sort,
  onSort,
}: ListTableProps) {
  const t = useTranslations('Library')
  const format = useFormatter()
  const body = useRef<HTMLTableSectionElement>(null)
  const rowWindow = useRowWindow(body, shelf.total, 6)

  // Every row of the shelf, the ones whose games come with the library file included: those are ghosts.
  const from = rowWindow ? rowWindow.start : 0
  const to = rowWindow
    ? Math.min(shelf.total, rowWindow.end)
    : // At least one: a row's height is measured from a row, or a ghost.
      Math.min(shelf.total, Math.max(1, unmeasured))
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
      <ListColumns />
      <thead>
        <tr>
          <th scope="col">
            <span className="sr-only">{t('list.cover')}</span>
          </th>
          <Heading sortKey="title" sort={sort} onSort={onSort}>
            {t('list.title')}
          </Heading>
          <th scope="col">{t('list.platforms')}</th>
          <Heading sortKey="status" sort={sort} onSort={onSort}>
            <span className="max-sm:sr-only">{t('list.status')}</span>
          </Heading>
          <Heading sortKey="rating" sort={sort} onSort={onSort} number className={MEDIUM}>
            {t('list.rating')}
          </Heading>
          <Heading sortKey="igdb" sort={sort} onSort={onSort} number className={MEDIUM}>
            {t('list.igdb')}
          </Heading>
          <Heading sortKey="hours" sort={sort} onSort={onSort} number className={MEDIUM}>
            {t('list.playtime')}
          </Heading>
          <Heading sortKey="added" sort={sort} onSort={onSort} className={WIDE}>
            {t('list.added')}
          </Heading>
          <Heading sortKey="completed" sort={sort} onSort={onSort} className={WIDE}>
            {t('list.completed')}
          </Heading>
        </tr>
      </thead>
      <tbody ref={body} data-grid-of={shelf.key}>
        {/* Rows that are not near the screen are not in the page; these keep their place.
            One cell each: one across all nine would make columns of those a phone hides,
            and they would take the title's room. */}
        {before > 0 ? (
          <tr aria-hidden="true">
            <td style={{ height: before, padding: 0, border: 0 }} />
          </tr>
        ) : null}
        {Array.from({ length: to - from }, (_, offset) => {
          const index = from + offset
          const item = shelf.items[index]
          if (!item) return <GhostRow key={`ghost-${index}`} index={offset} />
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
            <td style={{ height: after, padding: 0, border: 0 }} />
          </tr>
        ) : null}
      </tbody>
    </table>
  )
}

/** A row-shaped place in the list, for a game on its way. */
function GhostRow({ index }: { index: number }) {
  return (
    <tr data-cell="" data-ghost="" aria-hidden="true" style={ghostOrder(index)}>
      <td>
        <span className="game-thumb">
          <span className="ghost size-full" />
        </span>
      </td>
      <td>
        <span className="ghost h-3 w-3/4" />
        <span className="ghost mt-1.5 h-2 w-8" />
      </td>
      <td>
        <span className="ghost h-3 w-12" />
      </td>
      <td>
        <span className="ghost h-3 w-16 max-sm:w-4" />
      </td>
      <td className={MEDIUM}>
        <span className="ghost ml-auto h-3 w-6" />
      </td>
      <td className={MEDIUM}>
        <span className="ghost ml-auto h-3 w-6" />
      </td>
      <td className={MEDIUM}>
        <span className="ghost ml-auto h-3 w-8" />
      </td>
      <td className={WIDE}>
        <span className="ghost h-3 w-20" />
      </td>
      <td className={WIDE}>
        <span className="ghost h-3 w-20" />
      </td>
    </tr>
  )
}

/** The list before its shelves are known: two shelves' names and rows. */
export function GhostList() {
  return (
    <div className="pb-6" aria-hidden="true">
      {[8, 4].map((count, shelf) => (
        <section key={shelf} className="mt-8 first:mt-4">
          <GhostHeading className="pb-1" />
          <table className="game-table">
            <ListColumns />
            <tbody>
              {Array.from({ length: count }, (_, index) => (
                <GhostRow key={index} index={index} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}

/**
 * The list: one compact row per game, for fast scanning. A real table, so a
 * screen reader can read across a row and down a column. On a phone it keeps
 * the cover, title, platforms and status; the rest is in the game's details
 * (spec 3.8).
 */
export function ListView({
  shelves,
  platforms,
  open,
  onOpen,
  firstBoxes,
  sort,
  onSort,
}: ViewProps & Sorting) {
  const t = useTranslations('Library')
  const shares = shareFirstBoxes(
    shelves.map((shelf) => shelf.items.length),
    Math.min(FIRST_ROWS, firstBoxes),
  )

  return (
    <div className="pb-6">
      {shelves.map((shelf, index) => {
        const name = shelfName(shelf, t)
        const headingId = `list-${shelf.key.replace(/[^a-z0-9]+/gi, '-')}`
        return (
          <section
            key={shelf.key}
            aria-labelledby={headingId}
            data-shelf={shelf.key}
            className="mt-8 first:mt-4"
          >
            <header className="flex items-baseline gap-3 pb-1">
              <FoldToggle shelfKey={shelf.key} name={name} controls={`${headingId}-games`} />
              <h2 id={headingId} className="title text-base sm:text-lg">
                {name}
              </h2>
              <span className="readout text-[0.6875rem] text-muted">
                {t('shelf.count', { count: shelf.total })}
              </span>
            </header>
            <FoldBody shelfKey={shelf.key} id={`${headingId}-games`}>
              <ListTable
                shelf={shelf}
                platforms={platforms}
                caption={t('shelf.games', { shelf: name })}
                unmeasured={shares[index] ?? 0}
                open={open}
                onOpen={onOpen}
                sort={sort}
                onSort={onSort}
              />
            </FoldBody>
          </section>
        )
      })}
    </div>
  )
}
