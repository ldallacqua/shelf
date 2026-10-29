import { StarIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type CSSProperties, useId } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { AchievementStats, AchievementWall } from '@/domain/library/trophy-achievements'
import type { Trophy, TrophyStats, TrophyWall } from '@/domain/library/trophies'
import { Cover } from '@/features/library/cover'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { gameHref, trophiesHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import { Dashboard, TrophyFilters } from './dashboard'
import './trophies.css'

/** How wide a trophy's cover is drawn, for the browser to choose a file by. */
const SIZES = '(min-width: 64rem) 176px, (min-width: 40rem) 152px, 40vw'

/** The covers fetched at once: about the first screen's worth. */
const EAGER = 6

/** One finished game, face-out under its own light: its cover, title, the day, the hours, my rating. */
function TrophyCase({ trophy, handle, eager }: { trophy: Trophy; handle: string; eager: boolean }) {
  const t = useTranslations('Trophies')
  const format = useFormatter()
  const hours = hoursOf(trophy.minutes)
  const rating =
    trophy.rating === undefined
      ? undefined
      : format.number(outOfTen(trophy.rating), { maximumFractionDigits: 1 })
  return (
    <li
      className="trophy"
      data-adult={trophy.adult ? '' : undefined}
      style={
        { '--case-led': trophy.colors ? ledFrom(trophy.colors[0]) : undefined } as CSSProperties
      }
    >
      <Link href={gameHref(handle, trophy.slug)} className="trophy-link">
        <span className="trophy-niche">
          <span className="trophy-cover">
            <Cover
              cover={trophy.cover}
              colors={trophy.colors}
              hash={trophy.hash}
              title={trophy.title}
              sizes={SIZES}
              eager={eager}
            />
          </span>
          <span aria-hidden="true" className="trophy-plinth" />
        </span>
        {/* The cover's own text names the link; this says it again for the eye. */}
        <span aria-hidden="true" className="mt-3 line-clamp-2 text-sm font-medium text-text">
          {trophy.title}
        </span>
      </Link>
      {trophy.completedOn ? (
        <p className="mt-1 readout text-[0.625rem] text-muted">
          {t('finishedOn', {
            date: format.dateTime(dateOf(trophy.completedOn), {
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            }),
          })}
        </p>
      ) : null}
      {hours > 0 || rating ? (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 readout text-[0.625rem] text-muted">
          {hours > 0 ? <span>{t('hours', { count: hours })}</span> : null}
          {rating ? (
            <span className="inline-flex items-center gap-1">
              <StarIcon aria-hidden="true" className="size-3 fill-current" />
              <span className="sr-only">{t('rating', { value: rating })}</span>
              <span aria-hidden="true">{rating}</span>
            </span>
          ) : null}
        </p>
      ) : null}
    </li>
  )
}

function Year({
  year,
  trophies,
  handle,
  eager,
}: {
  year?: number
  trophies: readonly Trophy[]
  handle: string
  /** How many of this year's covers to fetch at once. */
  eager: number
}) {
  const t = useTranslations('Trophies')
  const id = useId()
  return (
    <section aria-labelledby={id} className="trophy-year mt-10 sm:mt-14">
      <h2 id={id} className="wall-label">
        <span className="title text-2xl sm:text-3xl">{year ?? t('undated')}</span>{' '}
        <span className="readout text-[0.625rem] text-muted">
          {t('count', { count: trophies.length })}
        </span>
      </h2>
      <ul className="trophy-grid mt-4">
        {trophies.map((trophy, index) => (
          <TrophyCase key={trophy.slug} trophy={trophy} handle={handle} eager={index < eager} />
        ))}
      </ul>
    </section>
  )
}

/** The figures, and above them which trophies they are of. */
function Figures({
  stats,
  achievements,
  handle,
  q,
}: {
  stats: TrophyStats
  achievements?: AchievementStats
  handle: string
  q?: string
}) {
  return (
    <>
      <TrophyFilters stats={stats} handle={handle} q={q} />
      <Dashboard stats={stats} achievements={achievements} handle={handle} q={q} />
    </>
  )
}

/** A year or a filter that leaves nothing: said, with the way back to every trophy. */
function NoneMatch({ handle }: { handle: string }) {
  const t = useTranslations('Trophies.filters')
  return (
    <p className="mt-10 text-pretty text-muted">
      {t('none')}{' '}
      <Link href={trophiesHref(handle)} className="text-text underline underline-offset-4">
        {t('allTime')}
      </Link>
    </p>
  )
}

/**
 * The trophy page (spec 3.9, issue 68): which trophies, the figures, then
 * every finished game, face-out, each under its own light, by the year it was
 * finished. Drawn on the server for a public shelf, and in its own browser for
 * a private one. `q` is the filter the wall was worked out with, and the
 * achievements' too.
 */
export function TrophyWallView({
  wall,
  achievements,
  handle,
  q,
}: {
  wall: TrophyWall
  /** Its games' achievements, worked out on the server (issue 68). */
  achievements?: AchievementWall
  handle: string
  q?: string
}) {
  const t = useTranslations('Trophies')
  // How many trophies stand before each year's, for the first screen's covers to come first.
  const before = wall.years.map((_, index) =>
    wall.years.slice(0, index).reduce((sum, { trophies }) => sum + trophies.length, 0),
  )
  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      {wall.hidden ? (
        // Both, and CSS shows the one this device's choice asks for (spec 3.13), from the first paint.
        <>
          <div data-when-adult="shown">
            <Figures stats={wall.stats} achievements={achievements?.stats} handle={handle} q={q} />
          </div>
          <div data-when-adult="hidden">
            <Figures
              stats={wall.hidden}
              achievements={achievements?.hidden}
              handle={handle}
              q={q}
            />
          </div>
        </>
      ) : (
        <Figures stats={wall.stats} achievements={achievements?.stats} handle={handle} q={q} />
      )}
      {wall.years.length === 0 ? <NoneMatch handle={handle} /> : null}
      {wall.years.map(({ year, trophies }, index) => (
        <Year
          key={year ?? 'undated'}
          year={year}
          trophies={trophies}
          handle={handle}
          eager={Math.max(0, EAGER - before[index]!)}
        />
      ))}
    </>
  )
}
