import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import type { WaitingCount, WaitingGame } from '@/domain/library/trophy-backlog'
import type { TrophyStats } from '@/domain/library/trophy-stats'
import { Cover } from '@/features/library/cover'
import { hoursOf } from '@/features/library/format'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { Chapter, Kpi, Kpis, Panel, RankedHead, RankedRows, withFilter } from './chart-parts'

type Props = { stats: TrophyStats; handle: string; q?: string }

/** What is waiting, in the filter language: the backlog and Someday. */
const WAITING = 'status:backlog,someday'

/** What each list says of a game beside its title. */
type Said = 'left' | 'rating' | 'year'

/**
 * What is still to play (issue 68's backlog), as the page's last chapter of
 * figures: how much, how long by IGDB's estimate, how soon at my own pace,
 * the games to start with, and what is waiting by genre and platform. Each
 * figure and game is a way to the games behind it in the library.
 */
export function Backlog({ stats, handle, q, id }: Props & { id: string }) {
  const t = useTranslations('Trophies.backlog')
  const chapters = useTranslations('Trophies.chapters')
  const format = useFormatter()
  const locale = useLocale()
  const backlog = stats.backlog
  if (!backlog) return null
  const figures = 1 + (backlog.timed > 0 ? 1 : 0) + (backlog.months === undefined ? 0 : 1)
  const hours = hoursOf(backlog.left)
  const hastyHours = hoursOf(backlog.leftHasty)
  const months = backlog.months ?? 0
  const hastyMonths = backlog.monthsHasty ?? months
  // From a hasty playthrough to a normal one: a range, wherever the two differ once rounded.
  const ranged = hastyHours < hours
  /** A range as the page's language writes it, and in words for a screen reader. */
  const range = (low: number, high: number) =>
    low < high ? (
      <span className="trophy-kpi-number">
        <span aria-hidden="true">{new Intl.NumberFormat(locale).formatRange(low, high)}</span>
        <span className="sr-only">
          {t('range', { low: format.number(low), high: format.number(high) })}
        </span>
      </span>
    ) : (
      <span className="trophy-kpi-number">{format.number(high)}</span>
    )
  return (
    <Chapter id={id} title={t('title')} lede={chapters('backlog.lede')}>
      <Kpis columns={figures}>
        <Kpi
          label={t('inBacklog')}
          value={
            <Link
              href={libraryHref(handle, { q: withFilter('status:backlog', q) })}
              className="trophy-kpi-number trophy-kpi-link"
            >
              {format.number(backlog.backlog)}
            </Link>
          }
          note={t('someday', { count: backlog.someday })}
          wide={figures === 1 || figures === 3 || ranged}
        />
        {backlog.timed > 0 ? (
          <Kpi
            label={t('left')}
            value={range(hastyHours, hours)}
            unit={t('hoursUnit', { count: hours })}
            note={
              ranged
                ? t('timedRange', { timed: backlog.timed, count: backlog.backlog })
                : t('timed', { timed: backlog.timed, count: backlog.backlog })
            }
            // A range is wider than a figure: on a phone each takes the row.
            wide={ranged}
          />
        ) : null}
        {backlog.months === undefined ? null : (
          <Kpi
            label={t('clear')}
            value={range(hastyMonths, months)}
            unit={t('monthsUnit', { count: months })}
            note={t('pace', { count: hoursOf(backlog.pace) })}
            wide={ranged}
          />
        )}
      </Kpis>
      <Waiting title={t('quickest')} games={backlog.quickest} said="left" handle={handle} />
      <Waiting title={t('bestRated')} games={backlog.bestRated} said="rating" handle={handle} />
      <Waiting title={t('oldest')} games={backlog.oldest} said="year" handle={handle} />
      <Counts
        title={t('genres')}
        items={backlog.genres}
        filterOf={(item) => `genre:${item.slug}`}
        handle={handle}
        q={q}
      />
      <Counts
        title={t('platforms')}
        items={backlog.platforms}
        filterOf={(item) => `owned:${item.slug}`}
        handle={handle}
        q={q}
      />
      {backlog.unsorted > 0 ? (
        <p className="trophy-board-note">
          <Link
            href={libraryHref(handle, { q: withFilter('status:unsorted', q) })}
            className="underline underline-offset-4 hover:text-text"
          >
            {t('unsorted', { count: backlog.unsorted })}
          </Link>
        </p>
      ) : null}
    </Chapter>
  )
}

/** A few games waiting, each with its cover and what the list is of. */
function Waiting({
  title,
  games,
  said,
  handle,
}: {
  title: string
  games: readonly WaitingGame[]
  said: Said
  handle: string
}) {
  const t = useTranslations('Trophies.backlog')
  const format = useFormatter()
  if (games.length === 0) return null
  const sayOf = (game: WaitingGame) =>
    said === 'left'
      ? game.left! < 60
        ? t('underAnHour')
        : t('hoursLeft', { count: hoursOf(game.left!) })
      : said === 'rating'
        ? t('igdbRating', {
            value: format.number(game.igdbRating! / 10, { maximumFractionDigits: 1 }),
          })
        : String(game.year)
  return (
    <Panel title={title} span={4}>
      <ol className="trophy-waiting-list">
        {games.map((game) => (
          <li key={game.slug} className="min-w-0">
            <Link
              href={gameHref(handle, game.slug)}
              aria-label={t('gameSays', { title: game.title, said: sayOf(game) })}
              className="trophy-waiting"
            >
              <span aria-hidden="true" className="trophy-waiting-cover">
                <Cover
                  cover={game.cover}
                  colors={game.colors}
                  hash={game.hash}
                  title={game.title}
                  sizes="40px"
                  small
                />
              </span>
              <span aria-hidden="true" className="grid min-w-0 gap-0.5">
                <span className="line-clamp-2 text-sm font-medium text-balance">{game.title}</span>
                <span className="trophy-waiting-said">{sayOf(game)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/** What is waiting of each genre or on each platform, the most first, each a way to those games. */
function Counts({
  title,
  items,
  filterOf,
  handle,
  q,
}: {
  title: string
  items: readonly WaitingCount[]
  filterOf: (item: WaitingCount) => string
  handle: string
  q?: string
}) {
  const t = useTranslations('Trophies.backlog')
  const format = useFormatter()
  if (items.length === 0) return null
  const most = Math.max(1, ...items.map((item) => item.games))
  return (
    <Panel title={title} span={6}>
      <RankedRows figures={1}>
        <RankedHead figure={t('gamesHead')} />
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={libraryHref(handle, { q: withFilter(`${WAITING} ${filterOf(item)}`, q) })}
              aria-label={t('countSays', { name: item.name, count: item.games })}
              className="trophy-ranked-row"
              style={{ '--value': item.games / most } as CSSProperties}
            >
              <span aria-hidden="true" className="trophy-ranked-name">
                {item.name}
              </span>
              <span aria-hidden="true" className="trophy-ranked-figure">
                {format.number(item.games)}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
            </Link>
          </li>
        ))}
      </RankedRows>
    </Panel>
  )
}
