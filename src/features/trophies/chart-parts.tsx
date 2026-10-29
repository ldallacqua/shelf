import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, type ReactNode, useId } from 'react'

import type { Ranked } from '@/domain/library/trophy-stats'
import type { Measure } from '@/domain/library/trophy-taste'
import { hoursOf } from '@/features/library/format'
import { libraryHref, trophiesHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

/**
 * The pieces the trophy page's charts are made of (issue 68): a section, a
 * chart's table, columns and ranked bars, and the addresses they lead to.
 * Drawn without a script; each mark has a tooltip on hover and focus.
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

export function Section({
  title,
  children,
  aside,
}: {
  title: string
  children: ReactNode
  /** Beside the title: what the section is ranked by. */
  aside?: ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="trophy-section">
      <div className="trophy-section-head">
        <h2 id={id} className="title text-xl sm:text-2xl">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
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
      <summary className="readout text-[0.625rem] text-muted">{t('asTable')}</summary>
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

/** One kind's games finished, ranked by the page's measure, each a way to them in the library. */
export function RankedList({
  title,
  items,
  filterOf,
  handle,
  scope,
  q,
  by,
}: {
  title: string
  items: readonly Ranked[]
  filterOf: (item: Ranked) => string
  handle: string
  scope?: number
  q?: string
  by: Measure
}) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  const id = useId()
  if (items.length === 0) return null
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
      <ol className="trophy-ranked">
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
          // The figure the list is ranked by, and under the bar what else is known.
          const figure =
            by === 'hours'
              ? t('hoursShort', { count: hoursOf(item.minutes) })
              : by === 'rating' && item.rating !== undefined
                ? format.number(item.rating / 10, { maximumFractionDigits: 1 })
                : by === 'share' && item.share !== undefined
                  ? percent(item.share)
                  : format.number(item.finished)
          const note = by === 'finished' ? share : t('finishedCount', { count: item.finished })
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
                <span aria-hidden="true" className="truncate text-sm font-medium">
                  {item.name}
                </span>
                <span aria-hidden="true" className="readout text-[0.6875rem] tabular-nums">
                  {figure}
                </span>
                <span aria-hidden="true" className="trophy-ranked-track">
                  <span className="trophy-ranked-bar" />
                </span>
                {note ? (
                  <span aria-hidden="true" className="readout text-[0.5625rem] text-muted">
                    {note}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
