import { StarIcon } from 'lucide-react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { type CSSProperties, type ReactNode, useId } from 'react'

import { ledFrom } from '@/domain/color/palette'
import type { Trophy, TrophyStats, TrophyWall } from '@/domain/library/trophies'
import { Cover } from '@/features/library/cover'
import { dateOf, hoursOf, outOfTen } from '@/features/library/format'
import { SettlingNumber } from '@/features/library/settling-number'
import { gameHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

import './trophies.css'

/** How wide a trophy's cover is drawn, for the browser to choose a file by. */
const SIZES = '(min-width: 64rem) 176px, (min-width: 40rem) 152px, 40vw'

/** The covers fetched at once: about the first screen's worth. */
const EAGER = 6

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="readout text-[0.625rem] text-muted">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  )
}

/** A whole number that counts up into place once, when first seen. The true figure is what is read out. */
function Counted({ value }: { value: number }) {
  const format = useFormatter()
  const locale = useLocale()
  const text = format.number(value)
  return (
    <>
      <span className="sr-only">{text}</span>
      <SettlingNumber
        value={value}
        text={text}
        locale={locale}
        className="title text-3xl tabular-nums sm:text-4xl"
      />
    </>
  )
}

/** The stats at the top of the wall (spec 3.9). What cannot be known yet is left out, not shown as nothing. */
function Stats({ stats, handle }: { stats: TrophyStats; handle: string }) {
  const t = useTranslations('Trophies.stats')
  const format = useFormatter()
  return (
    <div role="group" aria-label={t('label')} className="mt-8 border-y border-line py-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
        <Figure label={t('finished')}>
          <Counted value={stats.finished} />
        </Figure>
        <Figure label={t('thisYear', { year: String(stats.year) })}>
          <Counted value={stats.thisYear} />
        </Figure>
        <Figure label={t('hours')}>
          <Counted value={stats.hours} />
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
        {stats.finishedShare === undefined ? null : (
          <Figure label={t('share')}>
            <span className="title text-xl sm:text-2xl">
              {t('shareValue', {
                share: format.number(stats.finishedShare, {
                  style: 'percent',
                  maximumFractionDigits: 0,
                }),
              })}
            </span>
          </Figure>
        )}
        {stats.longest ? (
          <Figure label={t('longest')}>
            <Link
              href={gameHref(handle, stats.longest.slug)}
              className="line-clamp-2 title text-xl text-balance underline-offset-4 hover:underline sm:text-2xl"
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
            <span className="line-clamp-2 title text-xl text-balance sm:text-2xl">
              {stats.platform.name}
            </span>
            <span className="readout text-[0.625rem] text-muted">
              {t('hoursOf', { count: hoursOf(stats.platform.minutes) })}
            </span>
          </Figure>
        ) : null}
      </dl>
    </div>
  )
}

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

/**
 * The trophy wall (spec 3.9): the stats, then every finished game, face-out,
 * each under its own light, by the year it was finished. Drawn on the server
 * for a public shelf, and in its own browser for a private one.
 */
export function TrophyWallView({ wall, handle }: { wall: TrophyWall; handle: string }) {
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
            <Stats stats={wall.stats} handle={handle} />
          </div>
          <div data-when-adult="hidden">
            <Stats stats={wall.hidden} handle={handle} />
          </div>
        </>
      ) : (
        <Stats stats={wall.stats} handle={handle} />
      )}
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
