import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import type { AchievementStats } from '@/domain/library/trophy-achievements'
import type { TrophyStats } from '@/domain/library/trophy-stats'
import { measures } from '@/domain/library/trophy-taste'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { SettlingNumber } from '@/features/library/settling-number'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { Achievements, Vault } from './achievements'
import { AsTable, Columns, RankedList, scopeHref, Section, withFilter } from './chart-parts'
import { History, Insights, Ratings, Series } from './taste'

import './dashboard.css'

export { withFilter } from './chart-parts'

/**
 * The trophy page's figures (issue 68): the headline numbers and what they
 * say, the games finished year by year and month by month, what they are and
 * who made them, ranked as asked, my ratings, the series, the achievements and
 * their vault, the records and the years' milestones. Drawn without a script,
 * on the server for a public
 * shelf: each chart is marks in the page, with a tooltip on hover and focus,
 * and a table that says the same. Every mark leads to the games behind it.
 */

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
    href: scopeHref(handle, stats.scope === year ? undefined : year, q, stats.by),
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

/** What the lists are ranked by: links, so the choice is in the address and works without a script. */
function RankBy({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  // A year's games began whenever they did: its share finished says nothing.
  const offered = measures.filter((measure) => measure !== 'share' || stats.scope === undefined)
  return (
    <ul aria-label={t('rankBy')} className="trophy-rank-by">
      {offered.map((measure) => (
        <li key={measure}>
          <Link
            href={scopeHref(handle, stats.scope, q, measure)}
            aria-current={stats.by === measure ? 'page' : undefined}
            className="trophy-chip readout text-[0.6875rem]"
            scroll={false}
          >
            {t(`by.${measure}`)}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** When the games finished came out: a column for each decade. */
function Decades({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  if (stats.decades.length < 2) return null
  const busiest = Math.max(...stats.decades.map(({ finished }) => finished))
  const scoped = stats.scope === undefined ? '' : ` completed:${stats.scope}`
  return (
    <section aria-label={t('decades')} className="min-w-0">
      <h3 className="readout text-[0.625rem] text-muted">{t('decades')}</h3>
      <div className="mt-3">
        <Columns
          emphasis={false}
          columns={stats.decades.map(({ decade, finished }) => ({
            key: String(decade),
            label: t('decade', { decade: String(decade) }),
            value: finished,
            says: t('decadeSays', { decade: String(decade), count: finished }),
            href: libraryHref(handle, {
              q: withFilter(`status:completed year:${decade}..${decade + 9}${scoped}`, q),
            }),
            labelled: finished > 0 && finished === busiest,
          }))}
        />
      </div>
      <AsTable
        caption={t('decades')}
        head={[t('decadeHead'), t('finished')]}
        rows={stats.decades.map(({ decade, finished }) => [
          t('decade', { decade: String(decade) }),
          format.number(finished),
        ])}
      />
    </section>
  )
}

/**
 * What the games finished are and who made them: genres, themes, the
 * platforms they are owned on, modes, perspectives, developers and
 * publishers, each ranked as the page asks, and the decades they came out in.
 */
function Kinds({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const lists = [
    { key: 'genres', items: stats.genres, filter: 'genre' },
    { key: 'themes', items: stats.themes, filter: 'theme' },
    { key: 'platforms', items: stats.platforms, filter: 'owned' },
    { key: 'modes', items: stats.modes, filter: 'mode' },
    { key: 'perspectives', items: stats.perspectives, filter: 'perspective' },
    { key: 'developers', items: stats.developers, filter: 'developer' },
    { key: 'publishers', items: stats.publishers, filter: 'publisher' },
  ] as const
  if (stats.finished === 0) return null
  const empty = lists.every(({ items }) => items.length === 0)
  return (
    <Section title={t('kinds')} aside={<RankBy stats={stats} handle={handle} q={q} />}>
      {empty ? <p className="text-sm text-muted">{t('rankedNone')}</p> : null}
      <div className="trophy-kinds">
        {lists.map(({ key, items, filter }) => (
          <RankedList
            key={key}
            title={t(key)}
            items={items}
            filterOf={(item) => `${filter}:${item.slug}`}
            handle={handle}
            scope={stats.scope}
            q={q}
            by={stats.by}
          />
        ))}
        <Decades stats={stats} handle={handle} q={q} />
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
          href={scopeHref(handle, records.bestYear.year, q, stats.by)}
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
  achievements,
  handle,
  q,
}: {
  stats: TrophyStats
  /** Of the same games, from what Steam last said: none when none of them has any known. */
  achievements?: AchievementStats
  handle: string
  q?: string
}) {
  const of = achievements && { stats: achievements, handle, q, by: stats.by }
  return (
    <>
      <Headline stats={stats} handle={handle} />
      <Insights stats={stats} handle={handle} q={q} achievements={achievements?.insights} />
      <div className="trophy-timeline">
        <YearByYear stats={stats} handle={handle} q={q} />
        <MonthByMonth stats={stats} handle={handle} q={q} />
      </div>
      <Kinds stats={stats} handle={handle} q={q} />
      <Ratings stats={stats} handle={handle} q={q} />
      <Series stats={stats} handle={handle} q={q} />
      {of ? <Achievements {...of} /> : null}
      {of ? <Vault {...of} /> : null}
      <Records stats={stats} handle={handle} q={q} />
      <History stats={stats} handle={handle} q={q} />
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
            href={scopeHref(handle, undefined, q, stats.by)}
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
              href={scopeHref(handle, year, q, stats.by)}
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
        {stats.by === 'finished' ? null : <input type="hidden" name="by" value={stats.by} />}
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
          <Link
            href={scopeHref(handle, stats.scope, undefined, stats.by)}
            className={chip}
            scroll={false}
          >
            {t('clear')}
          </Link>
        ) : null}
      </form>
    </div>
  )
}
