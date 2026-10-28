import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { type CSSProperties, type ReactNode, useId } from 'react'

import type { Ranked, TrophyStats } from '@/domain/library/trophy-stats'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { SettlingNumber } from '@/features/library/settling-number'
import { gameHref, libraryHref, trophiesHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import './dashboard.css'

/**
 * The trophy page's figures (issue 68, phase 1): the headline numbers, the
 * games finished year by year and month by month, the genres, themes and
 * platforms finished, and the records. Drawn without a script, on the
 * server for a public shelf: each chart is marks in the page, with a
 * tooltip on hover and focus, and a table that says the same. Every mark
 * leads to the games behind it.
 */

/** A filter in the library's language, kept to the one the page is filtered by. */
export const withFilter = (filter: string, q?: string) =>
  q?.trim() ? `${filter} (${q.trim()})` : filter

/** The address of the trophy page for a year, or for all time, the filter kept. */
const scopeHref = (handle: string, year: number | undefined, q?: string) => {
  const query: Record<string, string> = {}
  if (year !== undefined) query.year = String(year)
  if (q?.trim()) query.q = q.trim()
  return trophiesHref(handle, query)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="trophy-section">
      <h2 id={id} className="title text-xl sm:text-2xl">
        {title}
      </h2>
      {children}
    </section>
  )
}

/** A whole number that counts up into place once, when first seen. The true figure is what is read out. */
function Counted({ value, className }: { value: number; className: string }) {
  const format = useFormatter()
  const locale = useLocale()
  const text = format.number(value)
  return (
    <>
      <span className="sr-only">{text}</span>
      <SettlingNumber value={value} text={text} locale={locale} className={className} />
    </>
  )
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="trophy-figure">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  )
}

/** The same chart as rows and columns, for whoever cannot or would rather not read the marks. */
function AsTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: readonly [string, string]
  rows: readonly (readonly [ReactNode, ReactNode])[]
}) {
  const t = useTranslations('Trophies.charts')
  return (
    <details className="chart-table">
      <summary className="readout text-[0.625rem] text-muted">{t('asTable')}</summary>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value], at) => (
            <tr key={at}>
              <th scope="row">{label}</th>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

/** The headline: games finished, large, and the few figures that say how. */
function Headline({ stats, handle }: { stats: TrophyStats; handle: string }) {
  const t = useTranslations('Trophies.stats')
  const format = useFormatter()
  const scoped = stats.scope !== undefined
  const median = stats.medianMinutes === undefined ? 0 : hoursOf(stats.medianMinutes)
  const lines = [
    !scoped && stats.thisYear > 0
      ? t('thisYearLine', { count: stats.thisYear, year: String(stats.year) })
      : undefined,
    stats.finishedShare === undefined
      ? undefined
      : t('shareLine', {
          share: format.number(stats.finishedShare, { style: 'percent', maximumFractionDigits: 0 }),
        }),
  ].filter((line) => line !== undefined)
  return (
    <div role="group" aria-label={t('label')} className="trophy-headline">
      <div className="trophy-hero">
        <p className="readout text-[0.625rem] text-muted">
          {scoped ? t('finishedIn', { year: String(stats.scope) }) : t('finished')}
        </p>
        <p className="mt-1">
          <Counted value={stats.finished} className="title text-6xl tabular-nums sm:text-7xl" />
        </p>
        {lines.length > 0 ? <p className="mt-2 text-sm text-muted">{lines.join(' · ')}</p> : null}
      </div>
      <dl className="trophy-figures">
        <Figure label={scoped ? t('hoursOn') : t('hours')}>
          <Counted value={stats.hours} className="title text-3xl tabular-nums sm:text-4xl" />
        </Figure>
        {stats.averageRating === undefined ? null : (
          <Figure label={t('rating')}>
            <span className="title text-3xl sm:text-4xl">
              {/* An average keeps its tenth: 7.8, where one rating is shown in half steps. */}
              {format.number(stats.averageRating / 10, { maximumFractionDigits: 1 })}
            </span>
            <span className="ml-1.5 readout text-[0.625rem] text-muted">{t('outOfTen')}</span>
          </Figure>
        )}
        {median > 0 ? (
          <Figure label={t('median')}>
            <span className="title text-3xl sm:text-4xl">{format.number(median)}</span>
            <span className="ml-1.5 readout text-[0.625rem] text-muted">
              {t('hoursUnit', { count: median })}
            </span>
          </Figure>
        ) : null}
        {!scoped && stats.started > 0 ? (
          <Figure label={t('dropped')}>
            <span className="title text-3xl sm:text-4xl">{format.number(stats.dropped)}</span>
          </Figure>
        ) : null}
        {!scoped && stats.streak.longest ? (
          <Figure label={t('streak')}>
            <span className="title text-3xl sm:text-4xl">
              {format.number(stats.streak.current)}
            </span>
            <span className="ml-1.5 readout text-[0.625rem] text-muted">
              {t('streakBest', { count: stats.streak.longest.months })}
            </span>
          </Figure>
        ) : null}
        {stats.longest ? (
          <Figure label={t('longest')}>
            <Link
              href={gameHref(handle, stats.longest.slug)}
              className="line-clamp-2 title text-xl text-balance underline-offset-4 hover:underline"
            >
              {stats.longest.title}
            </Link>
            <span className="readout text-[0.625rem] text-muted">
              {t('hoursOf', { count: hoursOf(stats.longest.minutes) })}
            </span>
          </Figure>
        ) : null}
        {stats.platform ? (
          <Figure label={t('platform')}>
            <span className="line-clamp-2 title text-xl text-balance">{stats.platform.name}</span>
            <span className="readout text-[0.625rem] text-muted">
              {t('hoursOf', { count: hoursOf(stats.platform.minutes) })}
            </span>
          </Figure>
        ) : null}
      </dl>
    </div>
  )
}

type Column = {
  key: string
  /** Under the column. */
  label: string
  value: number
  /** What the column says, read out and shown on hover. */
  says: string
  href: Parameters<typeof Link>[0]['href']
  /** Set apart from the rest: the year the page is of. */
  current?: boolean
  /** Shown with its number on top. */
  labelled?: boolean
}

/** Columns rising from one line, one series: the year the page is of in the accent, the others quiet. */
function Columns({ columns, emphasis }: { columns: readonly Column[]; emphasis: boolean }) {
  const format = useFormatter()
  const top = Math.max(1, ...columns.map((column) => column.value))
  return (
    <ol className="trophy-columns" style={{ '--columns': columns.length } as CSSProperties}>
      {columns.map((column) => (
        <li key={column.key} className="min-w-0">
          <Link
            href={column.href}
            aria-label={column.says}
            aria-current={column.current ? 'page' : undefined}
            className="trophy-column"
            data-quiet={emphasis && !column.current ? '' : undefined}
            style={{ '--value': column.value / top } as CSSProperties}
            scroll={false}
          >
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
          </Link>
        </li>
      ))}
    </ol>
  )
}

/** Each year from the first finished to this one: a way into each year's page. */
function YearByYear({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  if (stats.perYear.length < 2) return null
  const best = stats.records.bestYear?.year
  const columns = stats.perYear.map(({ year, finished }) => ({
    key: String(year),
    label: String(year),
    value: finished,
    says: t('yearSays', { year: String(year), count: finished }),
    // The year the page is of leads back to all of them.
    href: scopeHref(handle, stats.scope === year ? undefined : year, q),
    current: stats.scope === year,
    labelled: year === best || year === stats.year,
  }))
  return (
    <Section title={t('years')}>
      <p className="readout text-[0.625rem] text-muted">{t('yearsHint')}</p>
      <Columns columns={columns} emphasis={stats.scope !== undefined} />
      <AsTable
        caption={t('years')}
        head={[t('year'), t('finished')]}
        rows={stats.perYear.map(({ year, finished }) => [String(year), format.number(finished)])}
      />
    </Section>
  )
}

/** How dark a month's cell is: none, then four steps up to the busiest month. */
const levelOf = (count: number, top: number) => (count === 0 ? 0 : Math.ceil((count / top) * 4))

/** Month by month: every year a row of twelve, or, for one year, its twelve columns. */
function MonthByMonth({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  if (stats.perMonth.length === 0) return null
  const monthName = (month: number, style: 'long' | 'short' | 'narrow') =>
    format.dateTime(new Date(Date.UTC(2000, month, 1)), { month: style, timeZone: 'UTC' })
  const monthHref = (year: number, month: number) =>
    libraryHref(handle, {
      q: withFilter(`completed:${year}-${String(month + 1).padStart(2, '0')}`, q),
    })
  const says = (year: number, month: number, count: number) =>
    t('monthSays', {
      month: format.dateTime(new Date(Date.UTC(year, month, 1)), {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      count,
    })
  const rows = stats.perMonth.flatMap(({ year, months }) =>
    months.flatMap((count, month) =>
      count > 0
        ? [
            [
              <Link key="month" href={monthHref(year, month)}>
                {format.dateTime(new Date(Date.UTC(year, month, 1)), {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </Link>,
              format.number(count),
            ] as const,
          ]
        : [],
    ),
  )

  if (stats.scope !== undefined) {
    const year = stats.scope
    const months = stats.perMonth[0]!.months
    const busiest = Math.max(...months)
    return (
      <Section title={t('months')}>
        <Columns
          emphasis={false}
          columns={months.map((count, month) => ({
            key: String(month),
            label: monthName(month, 'short'),
            value: count,
            says: says(year, month, count),
            href: monthHref(year, month),
            labelled: count > 0 && count === busiest,
          }))}
        />
        <AsTable caption={t('months')} head={[t('month'), t('finished')]} rows={rows} />
      </Section>
    )
  }

  const top = Math.max(1, ...stats.perMonth.flatMap(({ months }) => months))
  return (
    <Section title={t('months')}>
      {/* The table below says the same, a link for each month, for screen readers and keyboards. */}
      <div aria-hidden="true" className="trophy-heat">
        <span />
        {Array.from({ length: 12 }, (_, month) => (
          <span key={month} className="trophy-heat-month readout">
            {monthName(month, 'narrow')}
          </span>
        ))}
        {stats.perMonth.map(({ year, months }) => (
          <div key={year} className="contents">
            <span className="trophy-heat-year readout">{year}</span>
            {months.map((count, month) =>
              count > 0 ? (
                <Link
                  key={month}
                  href={monthHref(year, month)}
                  tabIndex={-1}
                  className="trophy-heat-cell"
                  data-level={levelOf(count, top)}
                >
                  <span className="chart-tip">{says(year, month, count)}</span>
                </Link>
              ) : (
                <span key={month} className="trophy-heat-cell" data-level="0" />
              ),
            )}
          </div>
        ))}
      </div>
      <p aria-hidden="true" className="trophy-heat-scale readout text-[0.625rem] text-muted">
        <span>{t('fewer')}</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="trophy-heat-cell" data-level={level} />
        ))}
        <span>{t('more')}</span>
      </p>
      <AsTable caption={t('months')} head={[t('month'), t('finished')]} rows={rows} />
    </Section>
  )
}

/** One kind's games finished, most first, each a way to them in the library. */
function RankedList({
  title,
  items,
  filterOf,
  handle,
  scope,
  q,
}: {
  title: string
  items: readonly Ranked[]
  filterOf: (item: Ranked) => string
  handle: string
  scope?: number
  q?: string
}) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  const id = useId()
  if (items.length === 0) return null
  const top = Math.max(...items.map((item) => item.finished))
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
      <ol className="trophy-ranked">
        {items.map((item) => {
          const share =
            item.share === undefined
              ? undefined
              : t('shareOf', {
                  share: format.number(item.share, { style: 'percent', maximumFractionDigits: 0 }),
                })
          const filter = `status:completed ${filterOf(item)}${scope === undefined ? '' : ` completed:${scope}`}`
          return (
            <li key={item.id}>
              <Link
                href={libraryHref(handle, { q: withFilter(filter, q) })}
                aria-label={[t('rankedSays', { name: item.name, count: item.finished }), share]
                  .filter(Boolean)
                  .join(', ')}
                className="trophy-ranked-row"
                style={{ '--value': item.finished / top } as CSSProperties}
              >
                <span aria-hidden="true" className="truncate text-sm font-medium">
                  {item.name}
                </span>
                <span aria-hidden="true" className="readout text-[0.6875rem] tabular-nums">
                  {format.number(item.finished)}
                </span>
                <span aria-hidden="true" className="trophy-ranked-track">
                  <span className="trophy-ranked-bar" />
                </span>
                {share ? (
                  <span aria-hidden="true" className="readout text-[0.5625rem] text-muted">
                    {share}
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

/** What the games finished are: their genres, themes and the platforms they are owned on. */
function Kinds({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  if (stats.genres.length + stats.themes.length + stats.platforms.length === 0) return null
  const common = { handle, scope: stats.scope, q }
  return (
    <Section title={t('kinds')}>
      <div className="trophy-kinds">
        <RankedList
          title={t('genres')}
          items={stats.genres}
          filterOf={(item) => `genre:${item.slug}`}
          {...common}
        />
        <RankedList
          title={t('themes')}
          items={stats.themes}
          filterOf={(item) => `theme:${item.slug}`}
          {...common}
        />
        <RankedList
          title={t('platforms')}
          items={stats.platforms}
          filterOf={(item) => `owned:${item.slug}`}
          {...common}
        />
      </div>
    </Section>
  )
}

function Record({ label, children, note }: { label: string; children: ReactNode; note?: string }) {
  return (
    <div className="trophy-record">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="mt-1.5 min-w-0">
        <span className="line-clamp-2 title text-lg text-balance">{children}</span>
        {note ? <span className="readout text-[0.625rem] text-muted">{note}</span> : null}
      </dd>
    </div>
  )
}

/** The records among the games finished: the first, the longest, the quickest, the best. */
function Records({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.records')
  const format = useFormatter()
  const { records } = stats
  const game = (slug: string, title: string) => (
    <Link href={gameHref(handle, slug)} className="underline-offset-4 hover:underline">
      {title}
    </Link>
  )
  const month = (value: string) =>
    format.dateTime(dateOf(`${value}-01`), { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const shown = [
    records.first ? (
      <Record
        key="first"
        label={t('first')}
        note={format.dateTime(dateOf(records.first.on), { dateStyle: 'medium', timeZone: 'UTC' })}
      >
        {game(records.first.slug, records.first.title)}
      </Record>
    ) : null,
    records.quickest ? (
      <Record
        key="quickest"
        label={t('quickest')}
        note={t('hours', { count: hoursOf(records.quickest.minutes) })}
      >
        {game(records.quickest.slug, records.quickest.title)}
      </Record>
    ) : null,
    records.mostPlayed ? (
      <Record
        key="most-played"
        label={t('mostPlayed')}
        note={t('hours', { count: hoursOf(records.mostPlayed.minutes) })}
      >
        {game(records.mostPlayed.slug, records.mostPlayed.title)}
      </Record>
    ) : null,
    records.bestRated ? (
      <Record
        key="best-rated"
        label={t('bestRated')}
        note={t('outOfTen', {
          value: format.number(outOfTen(records.bestRated.rating), { maximumFractionDigits: 1 }),
        })}
      >
        {game(records.bestRated.slug, records.bestRated.title)}
      </Record>
    ) : null,
    records.oldest ? (
      <Record
        key="oldest"
        label={t('oldest')}
        note={t('released', { year: String(records.oldest.year) })}
      >
        {game(records.oldest.slug, records.oldest.title)}
      </Record>
    ) : null,
    records.bestYear ? (
      <Record
        key="best-year"
        label={t('bestYear')}
        note={t('games', { count: records.bestYear.finished })}
      >
        <Link
          href={scopeHref(handle, records.bestYear.year, q)}
          className="underline-offset-4 hover:underline"
        >
          {String(records.bestYear.year)}
        </Link>
      </Record>
    ) : null,
    records.bestMonth ? (
      <Record
        key="best-month"
        label={t('bestMonth')}
        note={t('games', { count: records.bestMonth.finished })}
      >
        <Link
          href={libraryHref(handle, { q: withFilter(`completed:${records.bestMonth.month}`, q) })}
          className="underline-offset-4 hover:underline"
        >
          {month(records.bestMonth.month)}
        </Link>
      </Record>
    ) : null,
    stats.scope === undefined && stats.streak.longest && stats.streak.longest.months > 1 ? (
      <Record
        key="streak"
        label={t('streak')}
        note={t('span', {
          from: month(stats.streak.longest.from),
          to: month(stats.streak.longest.to),
        })}
      >
        {t('months', { count: stats.streak.longest.months })}
      </Record>
    ) : null,
  ].filter((record) => record !== null)
  if (shown.length === 0) return null
  return (
    <Section title={t('title')}>
      <dl className="trophy-records">{shown}</dl>
    </Section>
  )
}

/** The figures above the wall, all of them of the same games. */
export function Dashboard({
  stats,
  handle,
  q,
}: {
  stats: TrophyStats
  handle: string
  q?: string
}) {
  return (
    <>
      <Headline stats={stats} handle={handle} />
      <div className="trophy-timeline">
        <YearByYear stats={stats} handle={handle} q={q} />
        <MonthByMonth stats={stats} handle={handle} q={q} />
      </div>
      <Kinds stats={stats} handle={handle} q={q} />
      <Records stats={stats} handle={handle} q={q} />
    </>
  )
}

/**
 * Which trophies the page is of: all time or one year, and a filter in the
 * library's language. Links and a form, so it works before the page is
 * alive, and without a script.
 */
export function TrophyFilters({
  stats,
  handle,
  q,
}: {
  stats: TrophyStats
  handle: string
  q?: string
}) {
  const t = useTranslations('Trophies.filters')
  const years = stats.perYear.filter(({ finished }) => finished > 0).reverse()
  const chip = 'trophy-chip readout text-[0.6875rem]'
  return (
    <div role="search" aria-label={t('label')} className="trophy-filters">
      <ul aria-label={t('period')} className="trophy-period">
        <li>
          <Link
            href={scopeHref(handle, undefined, q)}
            aria-current={stats.scope === undefined ? 'page' : undefined}
            className={chip}
            scroll={false}
          >
            {t('allTime')}
          </Link>
        </li>
        {years.map(({ year }) => (
          <li key={year}>
            <Link
              href={scopeHref(handle, year, q)}
              aria-current={stats.scope === year ? 'page' : undefined}
              className={chip}
              scroll={false}
            >
              {String(year)}
            </Link>
          </li>
        ))}
      </ul>
      <form method="get" className="trophy-filter-form">
        {stats.scope === undefined ? null : (
          <input type="hidden" name="year" value={String(stats.scope)} />
        )}
        <label className="sr-only" htmlFor="trophy-filter">
          {t('filter')}
        </label>
        <input
          id="trophy-filter"
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder={t('placeholder')}
          maxLength={1000}
          autoComplete="off"
          spellCheck={false}
          className="trophy-filter-input"
        />
        <button type="submit" className={chip}>
          {t('apply')}
        </button>
        {q?.trim() ? (
          <Link href={scopeHref(handle, stats.scope)} className={chip} scroll={false}>
            {t('clear')}
          </Link>
        ) : null}
      </form>
    </div>
  )
}
