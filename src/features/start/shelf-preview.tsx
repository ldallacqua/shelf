'use client'

import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

import { CoverPlaceholder, GameCase, plastics, type CaseShape } from '@/ui/game-case'
import { Ledge, ShelfLabel } from '@/ui/ledge'

/** The cases the preview stands, in turn, as games arrive: a mix of shapes, as a real shelf has. */
const SHAPES: readonly CaseShape[] = [
  'keepCase',
  'switch',
  'bluRay',
  'jewel',
  'switch',
  'keepCase',
  'bluRay',
]

/**
 * The room's own colors, blurred, in place of covers: the preview is of the shelf taking shape and
 * of its colors, so it changes as a colorway is picked. Never a drawing of a cover.
 */
const BLUR: readonly (readonly [string, string, string])[] = [
  ['var(--accent)', 'var(--led)', 'var(--surface-raised)'],
  ['var(--led)', 'var(--surface)', 'var(--wall-deep)'],
  ['var(--text-muted)', 'var(--accent)', 'var(--surface)'],
]

/**
 * The shelf as setting it up has made it so far (spec 4.6), beside the steps on a wide window:
 * a small lit ledge in the colors chosen on this device, with a case for each game up to seven,
 * and what is true of it in words. Pictures are hidden from assistive technology; the words say
 * it all.
 */
export function ShelfPreview({
  handle,
  total,
  linked,
  shelfPublic,
}: {
  handle: string
  /** Games on the shelf; unknown until the tally is read. */
  total: number | undefined
  /** The platforms linked, by name. */
  linked: readonly string[]
  shelfPublic: boolean
}) {
  const t = useTranslations('Start.preview')
  const shown = Math.min(total ?? 0, SHAPES.length)
  return (
    <aside
      aria-labelledby="setup-preview"
      className="rounded-panel border border-line bg-surface p-4"
    >
      <h2 id="setup-preview" className="readout text-[0.6875rem] text-muted">
        {t('title')}
      </h2>
      <div
        aria-hidden="true"
        className="setup-preview mt-3 overflow-hidden rounded-control bg-wall px-3 pt-5 pb-7"
      >
        <Ledge
          itemsClassName="h-[7.5rem] flex-nowrap items-end justify-center gap-1"
          label={<ShelfLabel count={total ?? 0}>{handle}</ShelfLabel>}
        >
          {SHAPES.slice(0, shown).map((shape, index) => (
            <GameCase
              key={index}
              shape={shape}
              frame={plastics[index % 3 === 1 ? 'red' : 'black']}
              className="setup-case"
              style={{ '--arrive': index } as CSSProperties}
            >
              <CoverPlaceholder colors={BLUR[index % BLUR.length]!} />
            </GameCase>
          ))}
        </Ledge>
      </div>
      <dl className="mt-4 grid gap-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t('address')}</dt>
          <dd className="truncate font-mono text-[0.8125rem]">{t('handle', { handle })}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t('games')}</dt>
          <dd className="tabular-nums">
            {total === undefined ? t('unknown') : t('count', { count: total })}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t('linked')}</dt>
          <dd className="text-right">
            {linked.length > 0 ? linked.join(' · ') : t('nothingLinked')}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted">{t('seenBy')}</dt>
          <dd>{shelfPublic ? t('public') : t('private')}</dd>
        </div>
      </dl>
    </aside>
  )
}
