import { SparklesIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { coverSources } from '@/domain/igdb/images'

import type { DemoGame } from './demo-case'
import { Scene } from './scene'

const step = (value: number) => ({ '--step': value }) as CSSProperties

/**
 * An AI assistant asked what to play, answering from the shelf through
 * Shelf's MCP endpoint (spec 17). The answer is the example shelf's own:
 * what "Ask it anything" finds with all its filters on.
 */
export function Assistant({ picks }: { picks: readonly DemoGame[] }) {
  const t = useTranslations('Landing.assistant')
  return (
    <Scene className="rounded-panel border border-line bg-surface/70 p-4 sm:p-6">
      <p className="readout text-[0.625rem] text-muted">{t('example')}</p>
      <div className="mt-4 grid gap-4">
        <p
          className="scene-step rounded-br-sm ml-auto max-w-[85%] rounded-panel bg-accent px-4 py-3 text-sm text-pretty text-on-accent"
          style={step(0)}
        >
          {t('question')}
        </p>
        <p className="scene-step readout text-[0.625rem] text-muted" style={step(1.5)}>
          {t('reading')}
        </p>
        <div
          className="scene-step rounded-bl-sm max-w-[92%] rounded-panel border border-line bg-surface px-4 py-3 text-sm"
          style={step(3)}
        >
          <p className="flex items-center gap-2 font-medium">
            <SparklesIcon aria-hidden="true" className="size-4 text-accent" />
            {t('answer', { count: picks.length })}
          </p>
          <ul className="mt-3 grid gap-2">
            {picks.map((game) => (
              <li key={game.slug} className="flex items-center gap-3">
                {/* Covers come straight from IGDB's servers, which already resize and cache them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt=""
                  {...coverSources(game.cover, 'cover_small_2x')}
                  sizes="28px"
                  loading="lazy"
                  decoding="async"
                  className="h-10 w-7 flex-none rounded-[2px] object-cover"
                  style={{ backgroundColor: game.colors[2] }}
                />
                <span>
                  <span className="font-medium">{game.title}</span>
                  <span className="block text-xs text-muted">
                    {t('pick', { platform: game.platform, hours: game.length ?? 0 })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Scene>
  )
}
