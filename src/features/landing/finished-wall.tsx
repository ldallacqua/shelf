import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { coverSources } from '@/domain/igdb/images'
import type { LibraryStats } from '@/domain/library/stats'

import type { DemoGame } from './demo-case'
import { CountUp } from './reveals'
import { Scene } from './scene'

/** How many finished games the wall shows: two rows of six, three of four on a phone. */
const SHOWN = 12

/**
 * How far one got: the library's own line (games, finished, hours) counting
 * up to the example shelf's figures, over the games finished, as a wall of
 * covers, as `status:completed` shows them.
 */
export function FinishedWall({
  games,
  stats,
}: {
  games: readonly DemoGame[]
  stats: LibraryStats
}) {
  const t = useTranslations('Landing.finished')
  const format = useFormatter()
  const locale = useLocale()
  const figures = [
    { key: 'games', value: stats.games },
    { key: 'finished', value: stats.finished },
    { key: 'hours', value: stats.hours },
  ] as const
  return (
    <Scene className="rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <dl className="grid grid-cols-3 gap-4 border-b border-line pb-5">
        {figures.map((figure) => (
          <div key={figure.key}>
            <dt className="readout text-[0.625rem] text-muted">{t(figure.key)}</dt>
            <dd className="mt-1 title text-3xl sm:text-4xl">
              <CountUp value={figure.value} text={format.number(figure.value)} locale={locale} />
            </dd>
          </div>
        ))}
      </dl>
      <ul className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label={t('wall')}>
        {games.slice(0, SHOWN).map((game, index) => (
          <li
            key={game.slug}
            className="scene-step"
            style={{ '--step': index * 0.35 } as CSSProperties}
          >
            {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={game.title}
              {...coverSources(game.cover, 'cover_big')}
              sizes="(min-width: 40rem) 96px, 80px"
              loading="lazy"
              decoding="async"
              className="aspect-3/4 w-full rounded-[3px] object-cover shadow-panel"
              style={{ backgroundColor: game.colors[2] }}
            />
          </li>
        ))}
      </ul>
    </Scene>
  )
}
