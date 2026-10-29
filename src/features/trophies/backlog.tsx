import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, useId } from 'react'

import type { WaitingCount, WaitingGame } from '@/domain/library/trophy-backlog'
import type { TrophyStats } from '@/domain/library/trophy-stats'
import { Cover } from '@/features/library/cover'
import { hoursOf } from '@/features/library/format'
import { gameHref, libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { Section, withFilter } from './chart-parts'

type Props = { stats: TrophyStats; handle: string; q?: string }

/** What is waiting, in the filter language: the backlog and Someday. */
const WAITING = 'status:backlog,someday'

/** What each list says of a game beside its title. */
type Said = 'left' | 'rating' | 'year'

/**
 * What is still to play (issue 68's backlog): how much, how long by IGDB's
 * estimate, how soon at my own pace, the games to start with, and what is
 * waiting by genre and platform. Each figure and game is a way to the games
 * behind it in the library.
 */
export function Backlog({ stats, handle, q }: Props) {
  const t = useTranslations('Trophies.backlog')
  const format = useFormatter()
  const backlog = stats.backlog
  if (!backlog) return null
  const figure = 'title text-3xl tabular-nums sm:text-4xl'
  const unit = 'ml-1.5 readout text-[0.625rem] text-muted'
  const note = 'mt-1 readout text-[0.5625rem] text-muted'
  return (
    <Section title={t('title')}>
      <dl className="trophy-figures">
        <div className="trophy-figure">
          <dt className="readout text-[0.625rem] text-muted">{t('inBacklog')}</dt>
          <dd className="mt-1.5">
            <Link
              href={libraryHref(handle, { q: withFilter('status:backlog', q) })}
              className={`${figure} underline-offset-4 hover:underline`}
            >
              {format.number(backlog.backlog)}
            </Link>
            <p className={note}>{t('someday', { count: backlog.someday })}</p>
          </dd>
        </div>
        {backlog.timed > 0 ? (
          <div className="trophy-figure">
            <dt className="readout text-[0.625rem] text-muted">{t('left')}</dt>
            <dd className="mt-1.5">
              <span className={figure}>{format.number(hoursOf(backlog.left))}</span>
              <span className={unit}>{t('hoursUnit', { count: hoursOf(backlog.left) })}</span>
              <p className={note}>{t('timed', { timed: backlog.timed, count: backlog.backlog })}</p>
            </dd>
          </div>
        ) : null}
        {backlog.months === undefined ? null : (
          <div className="trophy-figure">
            <dt className="readout text-[0.625rem] text-muted">{t('clear')}</dt>
            <dd className="mt-1.5">
              <span className={figure}>{format.number(backlog.months)}</span>
              <span className={unit}>{t('monthsUnit', { count: backlog.months })}</span>
              <p className={note}>{t('pace', { count: hoursOf(backlog.pace) })}</p>
            </dd>
          </div>
        )}
      </dl>
      <div className="trophy-backlog-lists">
        <Waiting title={t('quickest')} games={backlog.quickest} said="left" handle={handle} />
        <Waiting title={t('bestRated')} games={backlog.bestRated} said="rating" handle={handle} />
        <Waiting title={t('oldest')} games={backlog.oldest} said="year" handle={handle} />
      </div>
      <div className="trophy-kinds">
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
      </div>
      {backlog.unsorted > 0 ? (
        <p className="text-sm text-muted">
          <Link
            href={libraryHref(handle, { q: withFilter('status:unsorted', q) })}
            className="underline underline-offset-4 hover:text-text"
          >
            {t('unsorted', { count: backlog.unsorted })}
          </Link>
        </p>
      ) : null}
    </Section>
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
  const id = useId()
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
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
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
                <span className="readout text-[0.5625rem] text-muted">{sayOf(game)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
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
  const id = useId()
  if (items.length === 0) return null
  const most = Math.max(1, ...items.map((item) => item.games))
  return (
    <section aria-labelledby={id} className="min-w-0">
      <h3 id={id} className="readout text-[0.625rem] text-muted">
        {title}
      </h3>
      <ol className="trophy-ranked">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={libraryHref(handle, { q: withFilter(`${WAITING} ${filterOf(item)}`, q) })}
              aria-label={t('countSays', { name: item.name, count: item.games })}
              className="trophy-ranked-row"
              style={{ '--value': item.games / most } as CSSProperties}
            >
              <span aria-hidden="true" className="truncate text-sm font-medium">
                {item.name}
              </span>
              <span aria-hidden="true" className="readout text-[0.6875rem] tabular-nums">
                {format.number(item.games)}
              </span>
              <span aria-hidden="true" className="trophy-ranked-track">
                <span className="trophy-ranked-bar" />
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
