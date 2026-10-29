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
import { buttonVariants } from '@/ui/button'

import { Panel } from './chart-parts'
import { ChapterNav, chaptersOf, Dashboard, TrophyFilters, WALL } from './dashboard'
import { ShareButton } from './share-button'
import './trophies.css'

/** How wide a trophy's cover is drawn, for the browser to choose a file by. */
const SIZES = '(min-width: 64rem) 176px, (min-width: 40rem) 152px, 40vw'

/** The covers fetched at once: about the first screen's worth. */
const EAGER = 6

/** The figures drawn for a device that hides adult games, when the page draws both: see `chapterId`. */
const SAFE = '-safe'

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
        <p className="trophy-meta">
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
        <p className="trophy-meta">
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
    <section aria-labelledby={id} className="trophy-year">
      <h3 id={id} className="wall-label">
        <span className="title text-2xl sm:text-3xl">{year ?? t('undated')}</span>{' '}
        <span className="readout text-[0.625rem] text-muted">
          {t('count', { count: trophies.length })}
        </span>
      </h3>
      <ul className="trophy-grid mt-4">
        {trophies.map((trophy, index) => (
          <TrophyCase key={trophy.slug} trophy={trophy} handle={handle} eager={index < eager} />
        ))}
      </ul>
    </section>
  )
}

/** A public shelf's trophy card: its address, and what it shows in words. */
export type CardOf = { src: string; alt: string }

/**
 * The card a link to this page shows where it is shared, of all time or a
 * year's recap (issue 68), and the ways to share the link and keep the card.
 */
function Share({ card, scope }: { card: CardOf; scope?: number }) {
  const t = useTranslations('Trophies.share')
  return (
    <div className="trophy-board trophy-share-board">
      <Panel title={scope === undefined ? t('title') : t('yearTitle', { year: String(scope) })}>
        <div className="trophy-share">
          {/* Drawn by the server as an image, for other apps: next/image would only add a request. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.src}
            alt={card.alt}
            width={1200}
            height={630}
            loading="lazy"
            decoding="async"
            className="trophy-share-card"
          />
          <div className="grid content-start gap-3">
            <p className="max-w-prose text-sm text-pretty text-muted">{t('body')}</p>
            <div className="flex flex-wrap items-center gap-3">
              <ShareButton />
              <a
                href={card.src}
                download={scope === undefined ? 'trophies.png' : `trophies-${scope}.png`}
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                {t('save')}
              </a>
            </div>
          </div>
        </div>
      </Panel>
    </div>
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

/** One set of figures: which trophies they are of, and their chapters. */
type Set = { stats: TrophyStats; achievements?: AchievementStats; suffix?: string }

/**
 * The trophy page (spec 3.9, issue 68): which trophies, the links to its
 * chapters, the figures chapter by chapter, then the wall: every finished
 * game, face-out, each under its own light, by the year it was finished.
 * Drawn on the server for a public shelf, and in its own browser for a
 * private one. `q` is the filter the wall was worked out with, and the
 * achievements' too. A public shelf's page ends with its card, to share.
 */
export function TrophyWallView({
  wall,
  achievements,
  handle,
  q,
  card,
}: {
  wall: TrophyWall
  /** Its games' achievements, worked out on the server (issue 68). */
  achievements?: AchievementWall
  handle: string
  q?: string
  /** A public shelf's card for this page: none for a private one, nor for a filtered page. */
  card?: CardOf
}) {
  const t = useTranslations('Trophies')
  const chapters = useTranslations('Trophies.chapters')
  // How many trophies stand before each year's, for the first screen's covers to come first.
  const before = wall.years.map((_, index) =>
    wall.years.slice(0, index).reduce((sum, { trophies }) => sum + trophies.length, 0),
  )
  const standing = wall.years.length > 0
  // Both, when some games are adult, and CSS shows the one this device's choice asks for (spec 3.13),
  // from the first paint. The chapter links stay in view to the page's end, so they stand beside the
  // figures rather than in them, each set's own.
  const sets: { when?: 'shown' | 'hidden'; set: Set }[] = wall.hidden
    ? [
        { when: 'shown', set: { stats: wall.stats, achievements: achievements?.stats } },
        {
          when: 'hidden',
          set: { stats: wall.hidden, achievements: achievements?.hidden, suffix: SAFE },
        },
      ]
    : [{ set: { stats: wall.stats, achievements: achievements?.stats } }]
  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      {sets.map(({ when, set }) => (
        <div key={when ?? 'all'} data-when-adult={when}>
          <TrophyFilters stats={set.stats} handle={handle} q={q} />
        </div>
      ))}
      {sets.map(({ when, set }) => (
        <ChapterNav
          key={when ?? 'all'}
          when={when}
          chapters={chaptersOf(set.stats, set.achievements, standing)}
          suffix={set.suffix}
        />
      ))}
      {sets.map(({ when, set }) => (
        <div key={when ?? 'all'} data-when-adult={when}>
          <Dashboard
            stats={set.stats}
            achievements={set.achievements}
            handle={handle}
            q={q}
            suffix={set.suffix}
          />
        </div>
      ))}
      {standing ? (
        <section id={WALL} aria-labelledby={`${WALL}-title`} className="trophy-chapter">
          <div className="trophy-chapter-head">
            <div className="min-w-0">
              <h2 id={`${WALL}-title`} className="title text-2xl sm:text-3xl">
                {chapters('wall.title')}
              </h2>
              <p className="trophy-chapter-lede">{chapters('wall.lede')}</p>
            </div>
          </div>
          {wall.years.map(({ year, trophies }, index) => (
            <Year
              key={year ?? 'undated'}
              year={year}
              trophies={trophies}
              handle={handle}
              eager={Math.max(0, EAGER - before[index]!)}
            />
          ))}
          {card ? <Share card={card} scope={wall.stats.scope} /> : null}
        </section>
      ) : (
        <NoneMatch handle={handle} />
      )}
    </>
  )
}
