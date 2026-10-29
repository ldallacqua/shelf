import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { type CSSProperties, useId } from 'react'

import type { AchievementStats } from '@/domain/library/trophy-achievements'
import type { TrophyStats } from '@/domain/library/trophy-stats'
import { measures } from '@/domain/library/trophy-taste'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { SettlingNumber } from '@/features/library/settling-number'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { Achievements, Vault, VAULT } from './achievements'
import { Backlog } from './backlog'
import {
  AsTable,
  BoardTitle,
  Chapter,
  Columns,
  Fact,
  Kpi,
  Kpis,
  Panel,
  RankedList,
  scopeHref,
  withFilter,
} from './chart-parts'
import { Insights, Ratings, Series } from './taste'

import './dashboard.css'

export { withFilter } from './chart-parts'

/**
 * The trophy page's figures (issue 68), in chapters: the overview (the
 * headline figures, what they say, the records), when the games were
 * finished, what they are and how I rated them, the achievements and their
 * vault, and what is still to play. The wall itself is the last chapter.
 * Drawn without a script, on the server for a public shelf: each chart is
 * marks in the page, with a tooltip on hover and focus, and a table that says
 * the same. Every mark leads to the games behind it.
 */

/** The page's chapters, in order, as its chapter links name them. */
export type ChapterKey =
  'overview' | 'timeline' | 'taste' | 'achievements' | 'vault' | 'backlog' | 'wall'

/** The wall's chapter, drawn once, under either set of figures. */
export const WALL = 'wall'

/**
 * Where each chapter is. A page that draws its figures twice, with and
 * without the games a device hides (spec 3.13), gives the second set its own
 * `suffix`, so each set's links lead to its own chapters.
 */
export const chapterId = (key: ChapterKey, suffix = '') =>
  key === 'wall' ? WALL : `${key === 'vault' ? VAULT : key}${suffix}`

/** The chapters there is something for: none of the achievements without any known, for one. */
export const chaptersOf = (
  stats: TrophyStats,
  achievements: AchievementStats | undefined,
  wall: boolean,
): ChapterKey[] => [
  'overview',
  ...(stats.perMonth.length > 0 ? (['timeline'] as const) : []),
  ...(stats.finished > 0 ? (['taste'] as const) : []),
  ...(achievements ? (['achievements', 'vault'] as const) : []),
  ...(stats.backlog ? (['backlog'] as const) : []),
  ...(wall ? (['wall'] as const) : []),
]

/**
 * The page's chapters, as links that stay in view under the site's header
 * while it scrolls. Plain links to each chapter, so they work without a script.
 */
export function ChapterNav({
  chapters,
  suffix,
  when,
}: {
  chapters: readonly ChapterKey[]
  suffix?: string
  /** On a page that draws two sets of figures, which one these links are of (spec 3.13). */
  when?: 'shown' | 'hidden'
}) {
  const t = useTranslations('Trophies.chapters')
  return (
    <nav aria-label={t('label')} className="trophy-nav" data-when-adult={when}>
      <ol>
        {chapters.map((key) => (
          <li key={key}>
            <a href={`#${chapterId(key, suffix)}`}>{t(`${key}.nav`)}</a>
          </li>
        ))}
      </ol>
    </nav>
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

/** The headline: games finished, large, and beside it the few figures that say how. */
function Headline({ stats }: { stats: TrophyStats }) {
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
  const number = (value: number, digits = 0) => (
    <span className="trophy-kpi-number">
      {format.number(value, { maximumFractionDigits: digits })}
    </span>
  )
  const figures = [
    {
      key: 'hours',
      label: scoped ? t('hoursOn') : t('hours'),
      value: <Counted value={stats.hours} className="trophy-kpi-number" />,
    },
    stats.averageRating === undefined
      ? undefined
      : {
          key: 'rating',
          label: t('rating'),
          // An average keeps its tenth: 7.8, where one rating is shown in half steps.
          value: number(stats.averageRating / 10, 1),
          unit: t('outOfTen'),
        },
    median > 0
      ? {
          key: 'median',
          label: t('median'),
          value: number(median),
          unit: t('hoursUnit', { count: median }),
        }
      : undefined,
    !scoped && stats.started > 0
      ? { key: 'dropped', label: t('dropped'), value: number(stats.dropped) }
      : undefined,
  ].filter((figure) => figure !== undefined)
  return (
    <Kpis label={t('label')} columns={figures.length + 2}>
      <Kpi
        hero
        label={scoped ? t('finishedIn', { year: String(stats.scope) }) : t('finished')}
        value={<Counted value={stats.finished} className="trophy-kpi-number" />}
        note={lines.length > 0 ? lines.join(' · ') : undefined}
      />
      {figures.map(({ key, ...figure }, at) => (
        // On a phone two a row: one left alone takes the row.
        <Kpi key={key} {...figure} wide={figures.length % 2 === 1 && at === figures.length - 1} />
      ))}
    </Kpis>
  )
}

/**
 * The records among the games finished, each a card with its game's cover:
 * the first, the longest, the quickest, the best, and the busiest year and
 * month.
 */
function Records({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.records')
  const format = useFormatter()
  const { records } = stats
  const titleId = useId()
  const game = (slug: string, title: string) => (
    <Link href={gameHref(handle, slug)} className="trophy-fact-link">
      {title}
    </Link>
  )
  const month = (value: string) =>
    format.dateTime(dateOf(`${value}-01`), { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const hours = (minutes: number) => t('hours', { count: hoursOf(minutes) })
  const shown = [
    records.first ? (
      <Fact
        key="first"
        label={t('first')}
        game={records.first}
        note={format.dateTime(dateOf(records.first.on), { dateStyle: 'medium', timeZone: 'UTC' })}
      >
        {game(records.first.slug, records.first.title)}
      </Fact>
    ) : null,
    stats.longest ? (
      <Fact
        key="longest"
        label={t('longest')}
        game={stats.longest}
        note={hours(stats.longest.minutes)}
      >
        {game(stats.longest.slug, stats.longest.title)}
      </Fact>
    ) : null,
    records.quickest ? (
      <Fact
        key="quickest"
        label={t('quickest')}
        game={records.quickest}
        note={hours(records.quickest.minutes)}
      >
        {game(records.quickest.slug, records.quickest.title)}
      </Fact>
    ) : null,
    records.mostPlayed ? (
      <Fact
        key="most-played"
        label={t('mostPlayed')}
        game={records.mostPlayed}
        note={hours(records.mostPlayed.minutes)}
      >
        {game(records.mostPlayed.slug, records.mostPlayed.title)}
      </Fact>
    ) : null,
    records.bestRated ? (
      <Fact
        key="best-rated"
        label={t('bestRated')}
        game={records.bestRated}
        note={t('outOfTen', {
          value: format.number(outOfTen(records.bestRated.rating), { maximumFractionDigits: 1 }),
        })}
      >
        {game(records.bestRated.slug, records.bestRated.title)}
      </Fact>
    ) : null,
    records.oldest ? (
      <Fact
        key="oldest"
        label={t('oldest')}
        game={records.oldest}
        note={t('released', { year: String(records.oldest.year) })}
      >
        {game(records.oldest.slug, records.oldest.title)}
      </Fact>
    ) : null,
    stats.platform ? (
      <Fact key="platform" label={t('platform')} note={hours(stats.platform.minutes)}>
        {stats.platform.name}
      </Fact>
    ) : null,
    records.bestYear ? (
      <Fact
        key="best-year"
        label={t('bestYear')}
        note={t('games', { count: records.bestYear.finished })}
      >
        <Link
          href={scopeHref(handle, records.bestYear.year, q, stats.by)}
          className="trophy-fact-link"
        >
          {String(records.bestYear.year)}
        </Link>
      </Fact>
    ) : null,
    records.bestMonth ? (
      <Fact
        key="best-month"
        label={t('bestMonth')}
        note={t('games', { count: records.bestMonth.finished })}
      >
        <Link
          href={libraryHref(handle, { q: withFilter(`completed:${records.bestMonth.month}`, q) })}
          className="trophy-fact-link"
        >
          {month(records.bestMonth.month)}
        </Link>
      </Fact>
    ) : null,
    stats.scope === undefined && stats.streak.longest && stats.streak.longest.months > 1 ? (
      <Fact
        key="streak"
        label={t('streak')}
        note={t('span', {
          from: month(stats.streak.longest.from),
          to: month(stats.streak.longest.to),
        })}
      >
        {t('months', { count: stats.streak.longest.months })}
      </Fact>
    ) : null,
  ].filter((record) => record !== null)
  if (shown.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="trophy-group">
      <BoardTitle id={titleId}>{t('title')}</BoardTitle>
      <dl className="trophy-facts">{shown}</dl>
    </section>
  )
}

/** How dark a month's cell is: none, then four steps up to the busiest month. */
const levelOf = (count: number, top: number) => (count === 0 ? 0 : Math.ceil((count / top) * 4))

/** The scale under a chart of cells: from fewer to more. */
function HeatScale() {
  const t = useTranslations('Trophies.charts')
  return (
    <p aria-hidden="true" className="trophy-heat-scale">
      <span>{t('fewer')}</span>
      {[0, 1, 2, 3, 4].map((level) => (
        <span key={level} className="trophy-heat-cell" data-level={level} />
      ))}
      <span>{t('more')}</span>
    </p>
  )
}

/**
 * Year by year, newest first, each its own row: its twelve months, darker
 * for more, how many it finished against the busiest year, and what led it
 * and the milestones reached in it. Each year leads to its own page.
 */
function YearByYear({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const told = useTranslations('Trophies.history')
  const format = useFormatter()
  const monthName = (month: number, style: 'long' | 'narrow') =>
    format.dateTime(new Date(Date.UTC(2000, month, 1)), { month: style, timeZone: 'UTC' })
  const monthLong = (year: number, month: number) =>
    format.dateTime(new Date(Date.UTC(year, month, 1)), {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
  const monthHref = (year: number, month: number) =>
    libraryHref(handle, {
      q: withFilter(`completed:${year}-${String(month + 1).padStart(2, '0')}`, q),
    })
  const top = Math.max(1, ...stats.perMonth.flatMap(({ months }) => months))
  const finishedIn = (months: readonly number[]) => months.reduce((sum, count) => sum + count, 0)
  const busiest = Math.max(1, ...stats.perMonth.map(({ months }) => finishedIn(months)))
  const years = new Map(stats.timeline.map((year) => [year.year, year]))
  const rows = stats.perMonth.flatMap(({ year, months }) =>
    months.flatMap((count, month) =>
      count > 0
        ? [
            [
              <Link key="month" href={monthHref(year, month)}>
                {monthLong(year, month)}
              </Link>,
              format.number(count),
            ] as const,
          ]
        : [],
    ),
  )
  return (
    <Panel title={t('years')} caption={t('yearsHint')}>
      <ol className="trophy-ledger">
        <li aria-hidden="true" className="trophy-ledger-head">
          <span />
          <span className="trophy-ledger-months">
            {Array.from({ length: 12 }, (_, month) => (
              <span key={month}>{monthName(month, 'narrow')}</span>
            ))}
          </span>
          <span>{t('finished')}</span>
        </li>
        {stats.perMonth.map(({ year, months }) => {
          const finished = finishedIn(months)
          const story = years.get(year)
          return (
            <li key={year} className="trophy-ledger-year">
              <Link
                href={scopeHref(handle, year, q, stats.by)}
                aria-label={t('yearSays', { year: String(year), count: finished })}
                className="trophy-ledger-label"
                scroll={false}
              >
                {String(year)}
              </Link>
              {/* The table below says the same, a link for each month, for screen readers and keyboards. */}
              <span aria-hidden="true" className="trophy-ledger-months">
                {months.map((count, month) =>
                  count > 0 ? (
                    <Link
                      key={month}
                      href={monthHref(year, month)}
                      tabIndex={-1}
                      className="trophy-heat-cell"
                      data-level={levelOf(count, top)}
                    >
                      <span className="chart-tip">
                        {t('monthSays', { month: monthLong(year, month), count })}
                      </span>
                    </Link>
                  ) : (
                    <span key={month} className="trophy-heat-cell" data-level="0" />
                  ),
                )}
              </span>
              <span
                aria-hidden="true"
                className="trophy-ledger-total"
                style={{ '--value': finished / busiest } as CSSProperties}
              >
                <span className="trophy-ledger-bar" data-none={finished === 0 ? '' : undefined} />
                <span className="trophy-ledger-count">{format.number(finished)}</span>
              </span>
              {story && (story.best || story.genre || story.milestones.length > 0) ? (
                <p className="trophy-ledger-note">
                  {story.best ? <span className="trophy-badge">{told('best')}</span> : null}
                  {story.genre ? (
                    <span>
                      {story.was
                        ? told('shift', { genre: story.genre.name, was: story.was })
                        : told('led', { genre: story.genre.name })}
                    </span>
                  ) : null}
                  {story.milestones.map((milestone) => (
                    <span key={`${milestone.slug}-${milestone.nth ?? 'perfect'}`}>
                      {milestone.perfect ? told('perfect') : told('nth', { nth: milestone.nth! })}{' '}
                      <Link href={gameHref(handle, milestone.slug)} className="trophy-ledger-game">
                        {milestone.title}
                      </Link>
                    </span>
                  ))}
                </p>
              ) : null}
            </li>
          )
        })}
      </ol>
      <div className="trophy-panel-foot">
        <HeatScale />
        <AsTable caption={t('months')} head={[t('month'), t('finished')]} rows={rows} />
      </div>
    </Panel>
  )
}

/** One year's months, as twelve columns, each a way to its games. */
function MonthByMonth({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const format = useFormatter()
  const year = stats.scope!
  const months = stats.perMonth[0]!.months
  const busiest = Math.max(...months)
  const monthOf = (month: number, style: 'long' | 'short') =>
    format.dateTime(new Date(Date.UTC(year, month, 1)), {
      month: style,
      ...(style === 'long' ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  const monthHref = (month: number) =>
    libraryHref(handle, {
      q: withFilter(`completed:${year}-${String(month + 1).padStart(2, '0')}`, q),
    })
  return (
    <Panel title={t('months')}>
      <Columns
        emphasis={false}
        columns={months.map((count, month) => ({
          key: String(month),
          label: monthOf(month, 'short'),
          value: count,
          says: t('monthSays', { month: monthOf(month, 'long'), count }),
          href: monthHref(month),
          labelled: count > 0 && count === busiest,
        }))}
      />
      <div className="trophy-panel-foot">
        <AsTable
          caption={t('months')}
          head={[t('month'), t('finished')]}
          rows={months.flatMap((count, month) =>
            count > 0
              ? [
                  [
                    <Link key="month" href={monthHref(month)}>
                      {monthOf(month, 'long')}
                    </Link>,
                    format.number(count),
                  ],
                ]
              : [],
          )}
        />
      </div>
    </Panel>
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
    <Panel title={t('decades')} span={4}>
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
      <div className="trophy-panel-foot">
        <AsTable
          caption={t('decades')}
          head={[t('decadeHead'), t('finished')]}
          rows={stats.decades.map(({ decade, finished }) => [
            t('decade', { decade: String(decade) }),
            format.number(finished),
          ])}
        />
      </div>
    </Panel>
  )
}

/**
 * What the games finished are and who made them: genres, themes, the
 * platforms they are owned on, developers and publishers, modes and
 * perspectives, each ranked as the page asks, and the decades they came out in.
 */
function Kinds({ stats, handle, q }: { stats: TrophyStats; handle: string; q?: string }) {
  const t = useTranslations('Trophies.charts')
  const lists = [
    { key: 'genres', items: stats.genres, filter: 'genre', span: 4 },
    { key: 'themes', items: stats.themes, filter: 'theme', span: 4 },
    { key: 'platforms', items: stats.platforms, filter: 'owned', span: 4 },
    { key: 'developers', items: stats.developers, filter: 'developer', span: 6 },
    { key: 'publishers', items: stats.publishers, filter: 'publisher', span: 6 },
    { key: 'modes', items: stats.modes, filter: 'mode', span: 4 },
    { key: 'perspectives', items: stats.perspectives, filter: 'perspective', span: 4 },
  ] as const
  const empty = lists.every(({ items }) => items.length === 0)
  return (
    <>
      {empty ? <p className="trophy-board-note">{t('rankedNone')}</p> : null}
      {lists.map(({ key, items, filter, span }) => (
        <RankedList
          key={key}
          title={t(key)}
          items={items}
          filterOf={(item) => `${filter}:${item.slug}`}
          handle={handle}
          scope={stats.scope}
          q={q}
          by={stats.by}
          span={span}
        />
      ))}
      <Decades stats={stats} handle={handle} q={q} />
    </>
  )
}

type DashboardProps = {
  stats: TrophyStats
  /** Of the same games, from what Steam last said: none when none of them has any known. */
  achievements?: AchievementStats
  handle: string
  q?: string
  /** Of the second set of figures on a page that draws two: see `chapterId`. */
  suffix?: string
}

/** The figures above the wall, all of them of the same games, chapter by chapter. */
export function Dashboard({ stats, achievements, handle, q, suffix = '' }: DashboardProps) {
  const t = useTranslations('Trophies.chapters')
  const of = achievements && { stats: achievements, handle, q, by: stats.by, suffix }
  const id = (key: ChapterKey) => chapterId(key, suffix)
  return (
    <>
      <Chapter id={id('overview')} title={t('overview.title')} quiet>
        <Headline stats={stats} />
        <Insights stats={stats} handle={handle} q={q} achievements={achievements?.insights} />
        <Records stats={stats} handle={handle} q={q} />
      </Chapter>
      {stats.perMonth.length > 0 ? (
        <Chapter
          id={id('timeline')}
          title={t('timeline.title')}
          lede={stats.scope === undefined ? t('timeline.lede') : t('timeline.ledeYear')}
        >
          {stats.scope === undefined ? (
            <YearByYear stats={stats} handle={handle} q={q} />
          ) : (
            <MonthByMonth stats={stats} handle={handle} q={q} />
          )}
        </Chapter>
      ) : null}
      {stats.finished > 0 ? (
        <Chapter
          id={id('taste')}
          title={t('taste.title')}
          lede={t('taste.lede')}
          aside={<RankBy stats={stats} handle={handle} q={q} />}
        >
          <Kinds stats={stats} handle={handle} q={q} />
          <Ratings stats={stats} handle={handle} q={q} />
          <Series stats={stats} handle={handle} q={q} />
        </Chapter>
      ) : null}
      {of ? <Achievements {...of} id={id('achievements')} /> : null}
      {of ? <Vault {...of} /> : null}
      <Backlog stats={stats} handle={handle} q={q} id={id('backlog')} />
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
