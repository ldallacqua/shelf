import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, type ReactNode, useId } from 'react'

import type { PicturedGame, Ranked } from '@/domain/library/trophy-stats'
import type { Measure } from '@/domain/library/trophy-taste'
import { Cover } from '@/features/library/cover'
import { hoursOf } from '@/features/library/format'
import { libraryHref, trophiesHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

/**
 * The pieces the trophy page is made of (issue 68): its chapters, the panels
 * on their boards, the bands of figures and the cards of records, a chart's
 * table, columns and ranked bars, and the addresses they lead to. Every
 * chapter is a board of panels on one grid, and every panel is drawn the same
 * way, so the page reads as one thing. Drawn without a script; each mark has
 * a tooltip on hover and focus.
 */

/** A filter in the library's language, kept to the one the page is filtered by. */
export const withFilter = (filter: string, q?: string) =>
  q?.trim() ? `${filter} (${q.trim()})` : filter

/** The address of the trophy page for a year, or for all time, the filter and the ranking kept. */
export const scopeHref = (handle: string, year: number | undefined, q?: string, by?: Measure) => {
  const query: Record<string, string> = {}
  if (year !== undefined) query.year = String(year)
  if (q?.trim()) query.q = q.trim()
  if (by && by !== 'finished') query.by = by
  return trophiesHref(handle, query)
}

/** How many of the board's twelve columns a panel takes on a wide screen. */
export type Span = 3 | 4 | 5 | 6 | 7 | 8 | 12

/**
 * One chapter of the page: its title, a line on what it holds, and its
 * panels on the board. The page's chapter links lead to its `id`.
 */
export function Chapter({
  id,
  title,
  lede,
  aside,
  quiet,
  children,
}: {
  id: string
  title: string
  lede?: ReactNode
  /** Beside the title: what the chapter is ranked by, or where its figures are from. */
  aside?: ReactNode
  /** Its title for screen readers only: the first chapter, under the page's own. */
  quiet?: boolean
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="trophy-chapter">
      <div className={quiet ? 'sr-only' : 'trophy-chapter-head'}>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="title text-2xl sm:text-3xl">
            {title}
          </h2>
          {lede ? <p className="trophy-chapter-lede">{lede}</p> : null}
        </div>
        {aside}
      </div>
      <div className="trophy-board">{children}</div>
    </section>
  )
}

/**
 * One panel on a chapter's board: a chart or a list, under its title, with
 * a line on how to read it. Panels in a row stand as tall as each other.
 */
export function Panel({
  title,
  caption,
  aside,
  span = 12,
  rows,
  id,
  children,
}: {
  title: string
  caption?: ReactNode
  aside?: ReactNode
  span?: Span
  /** Rows of the board it stands across, beside shorter panels. */
  rows?: 2 | 3
  /** Where a link lands on it. */
  id?: string
  children: ReactNode
}) {
  const titleId = useId()
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className="trophy-panel"
      data-span={span}
      data-rows={rows}
    >
      <div className="trophy-panel-head">
        <h3 id={titleId} className="trophy-panel-title">
          {title}
        </h3>
        {aside}
        {caption ? <p className="trophy-panel-caption">{caption}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** A title over a run of cards on the board, as a panel's is over its chart. */
export function BoardTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="trophy-board-title">
      {children}
    </h3>
  )
}

/** One figure in a band of them: what it is, the number, and a line on it. */
export function Kpi({
  label,
  value,
  unit,
  note,
  hero,
  wide,
}: {
  label: string
  value: ReactNode
  unit?: string
  note?: ReactNode
  /** The band's first figure, larger, and two columns wide. */
  hero?: boolean
  /** Across both columns on a phone, being alone on its row. */
  wide?: boolean
}) {
  return (
    <div className="trophy-kpi" data-hero={hero ? '' : undefined} data-wide={wide ? '' : undefined}>
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="trophy-kpi-value">
        {value}
        {unit ? <span className="trophy-kpi-unit">{unit}</span> : null}
      </dd>
      {note ? <dd className="trophy-kpi-note">{note}</dd> : null}
    </div>
  )
}

/** A band of figures across the board, split by hairlines: `columns` is how many it is wide. */
export function Kpis({
  label,
  columns,
  children,
}: {
  label?: string
  columns: number
  children: ReactNode
}) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className="trophy-kpis-band">
      <dl className="trophy-kpis" style={{ '--kpis': columns } as CSSProperties}>
        {children}
      </dl>
    </div>
  )
}

/** A card of one record: what it is, the game or the figure, a note, and the game's cover. */
export function Fact({
  label,
  children,
  note,
  game,
}: {
  label: string
  children: ReactNode
  note?: ReactNode
  /** The game it is of, for its cover beside it. */
  game?: PicturedGame
}) {
  return (
    <div className="trophy-fact" data-pictured={game ? '' : undefined}>
      {game ? (
        <span aria-hidden="true" className="trophy-fact-cover">
          <Cover
            cover={game.cover}
            colors={game.colors}
            hash={game.hash}
            title={game.title}
            sizes="48px"
            small
          />
        </span>
      ) : null}
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="trophy-fact-value">{children}</dd>
      {note ? <dd className="trophy-fact-note">{note}</dd> : null}
    </div>
  )
}

/**
 * A ranked list's columns: what the figure the bars are of is, and the one
 * beside it, over them. The first row of the list, read out by the rows
 * themselves.
 */
export function RankedHead({ figure, beside }: { figure: string; beside?: string }) {
  return (
    <li aria-hidden="true" className="trophy-ranked-head">
      <span />
      <span>{figure}</span>
      {beside ? <span>{beside}</span> : null}
    </li>
  )
}

/** A ranked list's rows, under its heads: `figures` is one, or two with a figure beside. */
export function RankedRows({ figures, children }: { figures: 1 | 2; children: ReactNode }) {
  return (
    <ol className="trophy-ranked" style={{ '--figures': figures } as CSSProperties}>
      {children}
    </ol>
  )
}

/** The same chart as rows and columns, for whoever cannot or would rather not read the marks. */
export function AsTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: readonly string[]
  rows: readonly (readonly ReactNode[])[]
}) {
  const t = useTranslations('Trophies.charts')
  return (
    <details className="chart-table">
      <summary>{t('asTable')}</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((label) => (
              <th key={label} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...values], at) => (
            <tr key={at}>
              <th scope="row">{label}</th>
              {values.map((value, column) => (
                <td key={column}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export type Column = {
  key: string
  /** Under the column. */
  label: string
  value: number
  /** What the column says, read out and shown on hover. */
  says: string
  /** Where it leads. Without one it is a mark: its tooltip on hover, and its words in the table. */
  href?: Parameters<typeof Link>[0]['href']
  /** Set apart from the rest: the year the page is of. */
  current?: boolean
  /** Shown with its number on top. */
  labelled?: boolean
}

/** Columns rising from one line, one series: the year the page is of in the accent, the others quiet. */
export function Columns({ columns, emphasis }: { columns: readonly Column[]; emphasis: boolean }) {
  const format = useFormatter()
  const top = Math.max(1, ...columns.map((column) => column.value))
  return (
    <ol className="trophy-columns" style={{ '--columns': columns.length } as CSSProperties}>
      {columns.map((column) => {
        const marks = (
          <>
            <span aria-hidden="true" className="trophy-column-plot">
              {column.labelled || column.current ? (
                <span className="trophy-column-value readout">{format.number(column.value)}</span>
              ) : null}
              <span className="trophy-column-bar" data-none={column.value === 0 ? '' : undefined} />
            </span>
            <span aria-hidden="true" className="trophy-column-label readout">
              {column.label}
            </span>
            <span aria-hidden="true" className="chart-tip">
              {column.says}
            </span>
          </>
        )
        const look = {
          className: 'trophy-column',
          'data-quiet': emphasis && !column.current ? '' : undefined,
          style: { '--value': column.value / top } as CSSProperties,
        }
        return (
          <li key={column.key} className="min-w-0">
            {column.href ? (
              <Link
                href={column.href}
                aria-label={column.says}
                aria-current={column.current ? 'page' : undefined}
                scroll={false}
                {...look}
              >
                {marks}
              </Link>
            ) : (
              <span role="img" aria-label={column.says} {...look}>
                {marks}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** How long a ranked bar is, from 0 to 1: against the longest for counts, against the whole for a rating or a share. */
const lengthOf = (item: Ranked, by: Measure, items: readonly Ranked[]) => {
  if (by === 'rating') return (item.rating ?? 0) / 100
  if (by === 'share') return item.share ?? 0
  const value = (each: Ranked) => (by === 'hours' ? each.minutes : each.finished)
  return value(item) / Math.max(1, ...items.map(value))
}

/**
 * One kind's games finished, ranked by the page's measure, each a way to
 * them in the library: a panel, with the figure the bars are of and, beside
 * it, the share finished or how many were.
 */
export function RankedList({
  title,
  items,
  filterOf,
  handle,
  scope,
  q,
  by,
  span = 4,
}: {
  title: string
  items: readonly Ranked[]
  filterOf: (item: Ranked) => string
  handle: string
  scope?: number
  q?: string
  by: Measure
  span?: Span
}) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  if (items.length === 0) return null
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  // Ranked by the games, the share finished stands beside them, when any is known.
  const shares = items.some((item) => item.share !== undefined)
  const beside = by !== 'finished' ? t('by.finished') : shares ? t('by.share') : undefined
  return (
    <Panel title={title} span={span}>
      <RankedRows figures={beside ? 2 : 1}>
        <RankedHead figure={t(`by.${by}`)} beside={beside} />
        {items.map((item) => {
          const share =
            item.share === undefined ? undefined : t('shareOf', { share: percent(item.share) })
          const rating =
            item.rating === undefined
              ? undefined
              : t('ratingOf', {
                  value: format.number(item.rating / 10, { maximumFractionDigits: 1 }),
                })
          const hours = t('hoursOn', { count: hoursOf(item.minutes) })
          // The figure the list is ranked by, and beside it what else is known.
          const figure =
            by === 'hours'
              ? t('hoursShort', { count: hoursOf(item.minutes) })
              : by === 'rating' && item.rating !== undefined
                ? format.number(item.rating / 10, { maximumFractionDigits: 1 })
                : by === 'share' && item.share !== undefined
                  ? percent(item.share)
                  : format.number(item.finished)
          const besideIt =
            by !== 'finished'
              ? format.number(item.finished)
              : item.share === undefined
                ? undefined
                : percent(item.share)
          const said = [
            t('rankedSays', { name: item.name, count: item.finished }),
            by === 'hours' ? hours : by === 'rating' ? rating : share,
          ]
          const filter = `status:completed ${filterOf(item)}${scope === undefined ? '' : ` completed:${scope}`}`
          return (
            <li key={item.id}>
              <Link
                href={libraryHref(handle, { q: withFilter(filter, q) })}
                aria-label={said.filter(Boolean).join(', ')}
                className="trophy-ranked-row"
                style={{ '--value': lengthOf(item, by, items) } as CSSProperties}
              >
                <span aria-hidden="true" className="trophy-ranked-name">
                  {item.name}
                </span>
                <span aria-hidden="true" className="trophy-ranked-figure">
                  {figure}
                </span>
                {beside ? (
                  <span aria-hidden="true" className="trophy-ranked-beside">
                    {besideIt}
                  </span>
                ) : null}
                <span aria-hidden="true" className="trophy-ranked-track">
                  <span className="trophy-ranked-bar" />
                </span>
              </Link>
            </li>
          )
        })}
      </RankedRows>
    </Panel>
  )
}
