import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { ledFrom } from '@/domain/color/palette'
import { coverSources } from '@/domain/igdb/images'
import type { TrophyStats, TrophyYear } from '@/domain/library/trophies'
import { dateOf } from '@/features/library/format'

import { CountUp } from './reveals'
import { Scene } from './scene'

import '@/features/trophies/trophies.css'

/**
 * A glimpse of the trophy wall (spec 3.9) on the example shelf: its stats
 * counting up, over the year it finished games most lately, each under its
 * own light, as `/u/{handle}/trophies` draws them. The covers are plain
 * images: the wall's own covers would bring the library's script with them.
 */
export function FinishedWall({ stats, latest }: { stats: TrophyStats; latest: TrophyYear }) {
  const t = useTranslations('Landing.finished')
  const wall = useTranslations('Trophies')
  const format = useFormatter()
  const locale = useLocale()
  const figures = [
    { label: wall('stats.finished'), value: stats.finished },
    { label: wall('stats.thisYear', { year: String(stats.year) }), value: stats.thisYear },
    { label: wall('stats.hours'), value: stats.hours },
  ]
  return (
    <Scene className="rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <dl className="grid grid-cols-2 gap-4 border-b border-line pb-5 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt className="readout text-[0.625rem] text-muted">{figure.label}</dt>
            <dd className="mt-1 title text-3xl sm:text-4xl">
              <CountUp value={figure.value} text={format.number(figure.value)} locale={locale} />
            </dd>
          </div>
        ))}
        {stats.averageRating === undefined ? null : (
          <div>
            <dt className="readout text-[0.625rem] text-muted">{wall('stats.rating')}</dt>
            <dd className="mt-1">
              <span className="title text-3xl sm:text-4xl">
                {format.number(stats.averageRating / 10, { maximumFractionDigits: 1 })}
              </span>
              <span className="ml-1.5 readout text-[0.625rem] text-muted">
                {wall('stats.outOfTen')}
              </span>
            </dd>
          </div>
        )}
      </dl>
      <h3 className="mt-5 flex items-baseline gap-3">
        <span className="title text-2xl">{latest.year}</span>{' '}
        <span className="readout text-[0.625rem] text-muted">
          {wall('count', { count: latest.trophies.length })}
        </span>
      </h3>
      <ul className="trophy-grid finished-trophies mt-2" aria-label={t('wall')}>
        {latest.trophies.map((trophy, index) => (
          <li
            key={trophy.slug}
            className="trophy scene-step"
            style={
              {
                '--step': index * 0.35,
                '--case-led': trophy.colors ? ledFrom(trophy.colors[0]) : undefined,
              } as CSSProperties
            }
          >
            <span className="trophy-niche">
              <span className="trophy-cover">
                {trophy.cover ? (
                  // Covers come straight from IGDB's servers, which already resize and cache them.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt=""
                    {...coverSources(trophy.cover, 'cover_big')}
                    sizes="(min-width: 40rem) 112px, 30vw"
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                    style={{ backgroundColor: trophy.colors?.[2] }}
                  />
                ) : null}
              </span>
              <span aria-hidden="true" className="trophy-plinth" />
            </span>
            <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{trophy.title}</p>
            {trophy.completedOn ? (
              <p className="mt-0.5 readout text-[0.5625rem] text-muted">
                {wall('finishedOn', {
                  date: format.dateTime(dateOf(trophy.completedOn), {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  }),
                })}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </Scene>
  )
}
