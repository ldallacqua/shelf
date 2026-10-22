import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { Ledge, ShelfLabel } from '@/ui/ledge'

import { DemoCase, type DemoGame } from './demo-case'
import { Scene } from './scene'

const SIZES = '(min-width: 40rem) 100px, 84px'

const step = (value: number) => ({ '--step': value }) as CSSProperties

/**
 * One game owned three ways: each copy in the case its platform comes in,
 * with where and how it is owned above it; then the same game as the
 * shelf stands it, once, with a count of its copies.
 */
export function EveryCopy({ copies }: { copies: readonly DemoGame[] }) {
  const t = useTranslations('Landing.copies')
  const [first] = copies
  if (!first) return null
  return (
    <Scene className="grid grid-cols-[minmax(0,1fr)] items-end gap-x-8 gap-y-12 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <figure className="min-w-0">
        <Ledge
          className="copy-shelf"
          itemsClassName="justify-center gap-[calc(var(--mm)*16)]"
          label={<ShelfLabel count={copies.length}>{t('yours')}</ShelfLabel>}
        >
          {copies.map((copy, index) => (
            <span
              key={`${copy.platform}-${copy.format}`}
              className="scene-step flex flex-col items-center gap-2"
              style={step(index)}
            >
              <span className="readout text-center text-[0.5625rem] whitespace-nowrap text-muted">
                {copy.platform}
                {' · '}
                {t(copy.format)}
              </span>
              <DemoCase game={copy} sizes={SIZES} />
            </span>
          ))}
        </Ledge>
      </figure>
      <figure className="scene-step min-w-0" style={step(copies.length + 0.5)}>
        <Ledge
          className="copy-shelf"
          itemsClassName="justify-center"
          label={<ShelfLabel count={1}>{t('onShelf')}</ShelfLabel>}
        >
          <span className="relative">
            <DemoCase game={first} sizes={SIZES} />
            <span className="game-count">{copies.length}</span>
          </span>
        </Ledge>
        <figcaption className="mt-9 text-center text-sm text-muted">
          {t('together', { count: copies.length })}
        </figcaption>
      </figure>
    </Scene>
  )
}
