import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, useId } from 'react'

import type { AchievementInsight } from '@/domain/library/trophy-achievements'
import type { TrophyStats } from '@/domain/library/trophy-stats'
import { INSIGHTS_SHOWN, type Insight, type RatedGame } from '@/domain/library/trophy-taste'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { StatusMark } from '@/features/library/status-mark'
import { Link } from '@/i18n/navigation'

import { AsTable, BoardTitle, Columns, Panel, scopeHref, withFilter } from './chart-parts'

/**
 * The trophy page's second phase (issue 68): what the figures say, in a few
 * sentences; my ratings, and how they stand against IGDB's players'; and how
 * far through each series I am. Drawn without a script, as the first phase
 * is. My years and their milestones are the timeline's rows.
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

/** An achievement's insight in words, and where its game is. */
function useSaidOfAchievements() {
  const t = useTranslations('Trophies.insights')
  const format = useFormatter()
  return (
    insight: AchievementInsight,
    handle: string,
  ): { text: string; href?: Parameters<typeof Link>[0]['href'] } => {
    switch (insight.kind) {
      case 'unlocks':
        return {
          text: insight.best
            ? t('unlocksBest', {
                count: insight.count,
                best: insight.than.count,
                bestYear: String(insight.than.year),
              })
            : t('unlocksAhead', {
                count: insight.count,
                last: insight.than.count,
                lastYear: String(insight.than.year),
              }),
        }
      case 'close':
        return {
          text: t('close', { count: insight.left, title: insight.game.title }),
          href: { ...gameHref(handle, insight.game.slug), hash: 'achievements' },
        }
      case 'rarest':
        return {
          text: t('rarest', {
            name: insight.unlock.name,
            title: insight.unlock.game.title,
            share: format.number(insight.unlock.rate! / 100, {
              style: 'percent',
              maximumFractionDigits: 1,
            }),
          }),
          href: { ...gameHref(handle, insight.unlock.game.slug), hash: 'achievements' },
        }
    }
  }
}

/**
 * What the figures say, in a few sentences, each with the way to its games:
 * the library's, and up to two of its achievements' (more where the library
 * has less to say).
 */
export function Insights({
  achievements = [],
  ...props
}: Props & { achievements?: readonly AchievementInsight[] }) {
  const t = useTranslations('Trophies.insights')
  const said = useSaid()
  const saidOfAchievements = useSaidOfAchievements()
  const titleId = useId()
  const { stats } = props
  const more = achievements.slice(0, Math.max(2, INSIGHTS_SHOWN - stats.insights.length))
  const shown = [
    ...stats.insights.slice(0, INSIGHTS_SHOWN - more.length).map((insight) => ({
      kind: insight.kind,
      ...said(insight, props),
    })),
    ...more.map((insight) => ({
      kind: insight.kind,
      ...saidOfAchievements(insight, props.handle),
    })),
  ]
  if (shown.length === 0) return null
  return (
    <section aria-labelledby={titleId} className="trophy-group">
      <BoardTitle id={titleId}>{t('label')}</BoardTitle>
      <ul className="trophy-insights">
        {shown.map(({ kind, text, href }) => (
          // With a way to its games, the whole card is the way: its link reaches across it.
          <li key={kind} className="trophy-insight" data-linked={href ? '' : undefined}>
            <p className="readout text-[0.625rem] text-muted">{t(`kinds.${kind}`)}</p>
            <p className="trophy-insight-text">{text}</p>
            {href ? (
              <Link href={href} className="trophy-insight-link">
                {t('see')}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** How my ratings fall: a column for each whole point, a half step with the point below. */
function Spread({ stats, handle, q, wide }: Props & { wide: boolean }) {
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
    <Panel title={t('spread', { count: stats.ratings!.rated })} span={wide ? 12 : 7}>
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
      <div className="trophy-panel-foot">
        <AsTable
          caption={t('spreadCaption')}
          head={[t('rating'), t('games')]}
          rows={points.map(({ point, count }) => [
            point === 10 ? '10' : `${point}–${half(point)}`,
            format.number(count),
          ])}
        />
      </div>
    </Panel>
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
    <Panel
      title={t('versus', { count: versus.games.length })}
      caption={
        gap === 0
          ? t('gapNone')
          : t('gap', { gap: tenths(Math.abs(gap)), direction: gap > 0 ? 'higher' : 'lower' })
      }
      span={5}
      rows={2}
    >
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
      <div className="trophy-panel-foot">
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
      </div>
    </Panel>
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
      <h4 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h4>
      <ol className="trophy-gaps">
        {games.map((game) => (
          <li key={game.slug}>
            <Link
              href={gameHref(handle, game.slug)}
              className="truncate text-sm font-medium underline-offset-4 hover:underline"
            >
              {game.title}
            </Link>
            <span className="trophy-gaps-pair">
              {t('pair', { mine: tenths(game.mine), theirs: tenths(game.theirs) })}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * My ratings, as panels: how they fall, and under it the games furthest from
 * IGDB's players', beside the square of mine against theirs.
 */
export function Ratings(props: Props) {
  const t = useTranslations('Trophies.ratings')
  const ratings = props.stats.ratings
  if (!ratings) return null
  const wide = !ratings.versus
  return (
    <>
      <Spread {...props} wide={wide} />
      <Versus {...props} />
      {ratings.gems.length + ratings.letdowns.length > 0 ? (
        <Panel title={t('gaps')} span={wide ? 12 : 7}>
          <div className="trophy-gap-lists">
            <Gaps title={t('gems')} games={ratings.gems} handle={props.handle} />
            <Gaps title={t('letdowns')} games={ratings.letdowns} handle={props.handle} />
          </div>
        </Panel>
      ) : null}
    </>
  )
}

/** How far through each series I am: a bar each, its games under it when opened. */
export function Series({ stats, handle, q }: Props) {
  const t = useTranslations('Trophies.series')
  const status = useTranslations('Library')
  const { shown, complete } = stats.series
  if (shown.length === 0) return null
  return (
    <Panel
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
                  className="trophy-more-link"
                >
                  {t('inLibrary')}
                </Link>
              </details>
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}
