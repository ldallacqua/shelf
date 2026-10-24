import { CheckIcon, RefreshCwIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { imageUrl } from '@/domain/igdb/images'

import type { DemoGame } from './demo-case'
import { Scene } from './scene'

const step = (value: number) => ({ '--step': value }) as CSSProperties

/**
 * Steam and Nintendo libraries coming in, played out: games arriving on the
 * shelf one by one, each with its hours and where it came from (a Switch
 * game said to be a cartridge, as Nintendo's are once asked), then the
 * count, and the promise of tomorrow's sync. A picture of the account
 * page's platform cards, with the example shelf's covers and hours.
 */
export function SyncDemo({
  steam,
  nintendo,
  count,
}: {
  /** Games a sync from Steam brings in, with their hours. */
  steam: readonly DemoGame[]
  /** Games a sync from Nintendo brings in, once each is said to be a cartridge. */
  nintendo: readonly DemoGame[]
  /** How many games they put on the shelf in all. */
  count: number
}) {
  const t = useTranslations('Landing.sync')
  const rows = [
    ...steam.map((game) => ({ game, where: t('where') })),
    ...nintendo.map((game) => ({ game, where: t('whereNintendo') })),
  ]
  return (
    <Scene>
      <figure className="min-w-0 rounded-panel border border-line bg-surface/80 p-4">
        <figcaption className="flex items-center gap-2 readout text-[0.6875rem] text-muted">
          <RefreshCwIcon aria-hidden="true" className="size-3.5" />
          {t('card')}
        </figcaption>
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-1">
          {rows.map(({ game, where }, index) => (
            <li
              key={game.slug}
              className="scene-step flex items-center gap-3 px-2 py-1.5"
              style={step(1 + index * 0.6)}
            >
              {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                src={imageUrl(game.cover, 'cover_small')}
                loading="lazy"
                decoding="async"
                className="h-12 w-9 flex-none rounded-[3px] object-cover"
                style={{ backgroundColor: game.colors[2] }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{game.title}</span>
                <span className="block text-xs text-muted">{where}</span>
              </span>
              <span className="flex-none font-mono text-xs text-muted">
                {t('hours', { hours: game.hours })}
              </span>
              <CheckIcon aria-hidden="true" className="size-4 flex-none text-accent" />
            </li>
          ))}
        </ul>
        <p
          className="scene-step mt-3 flex flex-wrap items-baseline justify-between gap-2 border-t border-line px-2 pt-3 text-sm"
          style={step(1 + rows.length * 0.6 + 0.4)}
        >
          <span className="font-medium">{t('onShelf', { count })}</span>
          <span className="text-xs text-muted">{t('daily')}</span>
        </p>
      </figure>
    </Scene>
  )
}
