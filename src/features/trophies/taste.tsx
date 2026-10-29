import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, useId } from 'react'

import type { TrophyStats } from '@/domain/library/trophy-stats'
import type { Insight, RatedGame } from '@/domain/library/trophy-taste'
import { dateOf } from '@/features/library/format'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { StatusMark } from '@/features/library/status-mark'
import { Link } from '@/i18n/navigation'

import { AsTable, Columns, scopeHref, Section, withFilter } from './chart-parts'

/**
 * The trophy page's second phase (issue 68): what the figures say, in a few
 * sentences; my ratings, and how they stand against IGDB's players'; how far
 * through each series I am; and my years, oldest first, with their
 * milestones. Drawn without a script, as the first phase is.
 */

type Props = { stats: TrophyStats; handle: string; q?: string }

/** A rating out of 100 as the page says one: out of ten, to a tenth. */
const useTenths = () => {
  const format = useFormatter()
  return (rating: number) => format.number(rating / 10, { maximumFractionDigits: 1 })
}

/** One insight in words, and where its games are. */
function useSaid() {
  const t = useTranslations('Trophies.insights')
  const format = useFormatter()
  const tenths = useTenths()
  const percent = (value: number) =>
    format.number(value, { style: 'percent', maximumFractionDigits: 0 })
  return (
    insight: Insight,
    { handle, q, stats }: Props,
  ): { text: string; href?: Parameters<typeof Link>[0]['href'] } => {
    const finishedIn = (year: number) => scopeHref(handle, year, q, stats.by)
    const library = (filter: string) => libraryHref(handle, { q: withFilter(filter, q) })
    switch (insight.kind) {
      case 'record':
        return {
          text: t('record', {
            year: String(insight.year),
            count: insight.finished,
            best: insight.best.finished,
            bestYear: String(insight.best.year),
          }),
          href: finishedIn(insight.year),
        }
      case 'ahead':
        return {
          text: t('ahead', {
            count: insight.finished,
            more: insight.finished - insight.last,
            lastYear: String(insight.year - 1),
          }),
          href: finishedIn(insight.year),
        }
      case 'behind':
        return {
          text: t('behind', {
            count: insight.last - insight.finished,
            last: insight.last,
            lastYear: String(insight.year - 1),
          }),
          href: finishedIn(insight.year - 1),
        }
      case 'anniversary':
        return {
          text: t('anniversary', { years: insight.years, title: insight.game.title }),
          href: gameHref(handle, insight.game.slug),
        }
      case 'shift':
        return {
          text: t('shift', {
            genre: insight.genre.name,
            year: String(insight.year),
            favorite: insight.favorite,
          }),
          href: library(`status:completed genre:${insight.genre.slug} completed:${insight.year}`),
        }
      case 'finisher':
        return {
          text: t('finisher', {
            share: percent(insight.share),
            genre: insight.genre.name,
            overall: percent(insight.overall),
          }),
          href: library(`status:completed genre:${insight.genre.slug}`),
        }
      case 'maker':
        return {
          text: t('maker', {
            name: insight.developer.name,
            rating: tenths(insight.rating),
            count: insight.developer.finished,
          }),
          href: library(`status:completed developer:${insight.developer.slug}`),
        }
      case 'versus':
        return {
          text: t('versus', {
            gap: tenths(Math.abs(insight.gap)),
            direction: insight.gap > 0 ? 'higher' : 'lower',
            count: insight.games,
          }),
        }
      case 'pace':
        return {
          text:
            insight.ratio >= 1
              ? t('paceLonger', {
                  ratio: format.number(insight.ratio, { maximumFractionDigits: 1 }),
                })
              : t('paceShorter', { share: percent(insight.ratio) }),
        }
      case 'age':
        return {
          text: insight.old
            ? t('ageOld', { share: percent(insight.share) })
            : t('ageNew', { share: percent(insight.share) }),
        }
    }
  }
}

/** What the figures say, in a few sentences, each with the way to its games. */
export function Insights(props: Props) {
  const t = useTranslations('Trophies.insights')
  const said = useSaid()
  const { stats } = props
  if (stats.insights.length === 0) return null
  return (
    <section aria-label={t('label')} className="trophy-insights-section">
      <ul className="trophy-insights">
        {stats.insights.map((insight) => {
          const { text, href } = said(insight, props)
          return (
            <li key={insight.kind} className="trophy-insight">
              <p className="readout text-[0.625rem] text-muted">{t(`kinds.${insight.kind}`)}</p>
              <p className="mt-1.5 text-sm text-pretty">{text}</p>
              {href ? (
                <Link
                  href={href}
                  className="mt-2 inline-block readout text-[0.625rem] underline-offset-4 hover:underline"
                >
                  {t('see')}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** How my ratings fall: a column for each whole point, a half step with the point below. */
function Spread({ stats, handle, q }: Props) {
  const t = useTranslations('Trophies.ratings')
  const format = useFormatter()
  const spread = stats.ratings!.spread
  const lowest = Math.min(
    1,
    spread.findIndex((count) => count > 0),
  )
  const points = spread.map((count, point) => ({ point, count })).slice(lowest)
  const busiest = Math.max(...spread)
  const scoped = stats.scope === undefined ? '' : ` status:completed completed:${stats.scope}`
  const half = (point: number) => format.number(point + 0.5, { maximumFractionDigits: 1 })
  const says = (point: number, count: number) =>
    point === 10
      ? t('spreadTen', { count })
      : t('spreadSays', { rating: String(point), half: half(point), count })
  return (
    <div className="min-w-0">
      <h3 className="readout text-[0.625rem] text-muted">
        {t('spread', { count: stats.ratings!.rated })}
      </h3>
      <div className="mt-3">
        <Columns
          emphasis={false}
          columns={points.map(({ point, count }) => ({
            key: String(point),
            label: String(point),
            value: count,
            says: says(point, count),
            href: libraryHref(handle, {
              q: withFilter(
                `${point === 10 ? 'rating:10' : `rating:${point}..${point + 0.5}`}${scoped}`,
                q,
              ),
            }),
            labelled: count > 0 && count === busiest,
          }))}
        />
      </div>
      <AsTable
        caption={t('spreadCaption')}
        head={[t('rating'), t('games')]}
        rows={points.map(({ point, count }) => [
          point === 10 ? '10' : `${point}–${half(point)}`,
          format.number(count),
        ])}
      />
    </div>
  )
}

/** Mine against IGDB's players', one dot a game: above the line they rate it higher, below it I do. */
function Versus({ stats, handle }: Props) {
  const t = useTranslations('Trophies.ratings')
  const tenths = useTenths()
  const versus = stats.ratings!.versus
  if (!versus) return null
  const gap = Math.round(versus.gap)
  // Both axes start at the same round point under the lowest rating, so the line where the
  // two agree still runs corner to corner; never above 7, so there is a square to spread on.
  const lowest = Math.min(...versus.games.flatMap((game) => [game.mine, game.theirs]))
  const from = Math.min(70, Math.floor(lowest / 10) * 10)
  const at = (rating: number) => (rating - from) / (100 - from)
  const ends = (name: string) => (
    <>
      <span>{tenths(from)}</span>
      <span>{name}</span>
      <span>{tenths(100)}</span>
    </>
  )
  return (
    <figure className="m-0 min-w-0">
      <figcaption className="readout text-[0.625rem] text-muted">
        {t('versus', { count: versus.games.length })}
      </figcaption>
      {/* The table below says the same, a link for each game, for screen readers and keyboards. */}
      <div aria-hidden="true" className="trophy-scatter-frame">
        <span className="trophy-scatter-axis readout" data-axis="y">
          {ends(t('theirs'))}
        </span>
        <div className="trophy-scatter">
          <svg className="trophy-scatter-even" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="0" y1="100" x2="100" y2="0" vectorEffect="non-scaling-stroke" />
          </svg>
          {versus.games.map((game) => (
            <Link
              key={game.slug}
              href={gameHref(handle, game.slug)}
              tabIndex={-1}
              className="trophy-dot"
              data-edge={at(game.mine) > 0.6 ? 'right' : undefined}
              style={{ '--x': at(game.mine), '--y': at(game.theirs) } as CSSProperties}
            >
              <span className="chart-tip">
                {t('dot', {
                  title: game.title,
                  mine: tenths(game.mine),
                  theirs: tenths(game.theirs),
                })}
              </span>
            </Link>
          ))}
        </div>
        <span className="trophy-scatter-axis readout" data-axis="x">
          {ends(t('mine'))}
        </span>
      </div>
      <p className="mt-2 text-sm text-muted">
        {gap === 0
          ? t('gapNone')
          : t('gap', { gap: tenths(Math.abs(gap)), direction: gap > 0 ? 'higher' : 'lower' })}
      </p>
      <AsTable
        caption={t('versusCaption')}
        head={[t('game'), t('mine'), t('theirs')]}
        rows={versus.games.map((game) => [
          <Link key="game" href={gameHref(handle, game.slug)}>
            {game.title}
          </Link>,
          tenths(game.mine),
          tenths(game.theirs),
        ])}
      />
    </figure>
  )
}

/** Games I rated well above, or well below, what IGDB's players did. */
function Gaps({ title, games, handle }: { title: string; games: RatedGame[]; handle: string }) {
  const t = useTranslations('Trophies.ratings')
  const tenths = useTenths()
  const id = useId()
  if (games.length === 0) return null
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
      <ol className="trophy-gaps">
        {games.map((game) => (
          <li key={game.slug}>
            <Link
              href={gameHref(handle, game.slug)}
              className="truncate text-sm font-medium underline-offset-4 hover:underline"
            >
              {game.title}
            </Link>
            <span className="readout text-[0.625rem] text-muted">
              {t('pair', { mine: tenths(game.mine), theirs: tenths(game.theirs) })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** My ratings: how they fall, how they stand against IGDB's, and the widest gaps. */
export function Ratings(props: Props) {
  const t = useTranslations('Trophies.ratings')
  const ratings = props.stats.ratings
  if (!ratings) return null
  return (
    <Section title={t('title')}>
      <div className="trophy-ratings">
        <Spread {...props} />
        <Versus {...props} />
        {ratings.gems.length + ratings.letdowns.length > 0 ? (
          <div className="trophy-gap-lists">
            <Gaps title={t('gems')} games={ratings.gems} handle={props.handle} />
            <Gaps title={t('letdowns')} games={ratings.letdowns} handle={props.handle} />
          </div>
        ) : null}
      </div>
    </Section>
  )
}

/** How far through each series I am: a bar each, its games under it when opened. */
export function Series({ stats, handle, q }: Props) {
  const t = useTranslations('Trophies.series')
  const status = useTranslations('Library')
  const { shown, complete } = stats.series
  if (shown.length === 0) return null
  return (
    <Section
      title={t('title')}
      aside={
        complete > 0 ? (
          <p className="readout text-[0.625rem] text-muted">{t('complete', { count: complete })}</p>
        ) : null
      }
    >
      <ol className="trophy-series-list">
        {shown.map((series) => {
          const whole = series.finished === series.total
          return (
            <li key={`${series.kind}:${series.id}`}>
              <details className="trophy-series">
                <summary
                  className="trophy-series-row"
                  style={{ '--value': series.finished / series.total } as CSSProperties}
                >
                  <span className="truncate text-sm font-medium">{series.name}</span>
                  <span className="trophy-series-figure readout text-[0.6875rem] tabular-nums">
                    {t('progress', { finished: series.finished, total: series.total })}
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="trophy-series-chevron size-3.5"
                    />
                  </span>
                  <span aria-hidden="true" className="trophy-ranked-track">
                    <span className="trophy-ranked-bar" />
                  </span>
                  {whole ? (
                    <span className="trophy-series-whole readout text-[0.5625rem]">
                      <CheckIcon aria-hidden="true" className="size-3" />
                      {t('whole')}
                    </span>
                  ) : null}
                </summary>
                <ul className="trophy-series-games">
                  {series.games.map((game) => (
                    <li key={game.slug}>
                      <StatusMark
                        status={game.status}
                        label={status(`status.${game.status}`)}
                        iconOnly
                      />
                      <Link
                        href={gameHref(handle, game.slug)}
                        className="min-w-0 truncate underline-offset-4 hover:underline"
                      >
                        {game.title}
                      </Link>
                      {game.year === undefined ? null : (
                        <span className="readout text-[0.5625rem] text-muted">{game.year}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <Link
                  href={libraryHref(handle, { q: withFilter(`${series.kind}:${series.slug}`, q) })}
                  className="mt-2 inline-block readout text-[0.625rem] underline-offset-4 hover:underline"
                >
                  {t('inLibrary')}
                </Link>
              </details>
            </li>
          )
        })}
      </ol>
    </Section>
  )
}

/** My years, oldest first: how many, what led each, and the milestones reached in it. */
export function History({ stats, handle, q }: Props) {
  const t = useTranslations('Trophies.history')
  const format = useFormatter()
  if (stats.timeline.length === 0) return null
  return (
    <Section title={t('title')}>
      <ol className="trophy-history">
        {stats.timeline.map((year) => (
          <li key={year.year} className="trophy-history-year">
            <p className="trophy-history-head">
              <Link
                href={scopeHref(handle, year.year, q, stats.by)}
                className="title text-2xl underline-offset-4 hover:underline"
              >
                {String(year.year)}
              </Link>
              <span className="readout text-[0.625rem] text-muted">
                {t('finished', { count: year.finished })}
              </span>
              {year.best ? (
                <span className="trophy-history-best readout text-[0.5625rem]">{t('best')}</span>
              ) : null}
            </p>
            {year.genre ? (
              <p className="mt-1 text-sm text-muted">
                {year.was
                  ? t('shift', { genre: year.genre.name, was: year.was })
                  : t('led', { genre: year.genre.name })}
              </p>
            ) : null}
            {year.milestones.length > 0 ? (
              <ul className="trophy-history-milestones">
                {year.milestones.map((milestone) => (
                  <li key={`${milestone.slug}-${milestone.nth ?? 'perfect'}`}>
                    <span className="readout text-[0.5625rem] text-muted">
                      {milestone.perfect ? t('perfect') : t('nth', { nth: milestone.nth! })}
                    </span>
                    <Link
                      href={gameHref(handle, milestone.slug)}
                      className="min-w-0 text-sm font-medium text-balance underline-offset-4 hover:underline"
                    >
                      {milestone.title}
                    </Link>
                    <span className="readout text-[0.5625rem] text-muted">
                      {format.dateTime(dateOf(milestone.on), {
                        dateStyle: 'medium',
                        timeZone: 'UTC',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </Section>
  )
}
