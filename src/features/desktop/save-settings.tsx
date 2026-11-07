'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { SECTIONS, SettingsSection, titleClass } from '@/features/settings/settings-section'
import { cn } from '@/ui/cn'
import { Ghost, GhostText } from '@/ui/ghost'
import { NumberField } from '@/ui/number-field'

import { AppWords } from './app-words'
import { type Caps, saves } from './saves'

/** The bounds the app keeps the caps within (`Caps` in `desktop/src/saves/mod.rs`). */
export const FEWEST_KEPT = 3
const MOST_KEPT = 200
const SMALLEST_MB = 10
const LARGEST_MB = 10_240

/** What the app said, or that it is too old to keep saves (before 0.13.0). */
export type CapsState = Caps | 'old' | undefined

/**
 * The limits on every game's snapshots (ADR 008, section 4): how many are kept, and how large one may
 * be. Shelf sets no quota of its own; these keep a game's history from filling the disk by surprise.
 */
export function SaveCapsView({
  caps,
  said,
  onChange,
}: {
  caps: CapsState
  said?: { tone: 'done' | 'trouble'; text: string } | undefined
  onChange: (caps: Caps) => void
}) {
  const t = useTranslations('SaveSettings')
  const format = useFormatter()
  const whole = (value: number) => format.number(value, { maximumFractionDigits: 0 })

  return (
    <SettingsSection title={t('title')} scope="device">
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      {caps === undefined ? (
        <div aria-hidden="true" className="grid max-w-md gap-5">
          {[0, 1].map((row) => (
            <div key={row} className="grid gap-1.5">
              <GhostText order={row} className="w-40 text-sm" />
              <Ghost order={row} className="h-10 w-40 rounded-control" />
            </div>
          ))}
        </div>
      ) : caps === 'old' ? (
        <p className="max-w-xl text-pretty">{t('old')}</p>
      ) : (
        <div className="grid max-w-md gap-5">
          <NumberField
            label={t('kept')}
            value={caps.kept}
            min={FEWEST_KEPT}
            max={MOST_KEPT}
            format={whole}
            decreaseLabel={t('fewer')}
            increaseLabel={t('more')}
            hint={t('keptHint', { fewest: FEWEST_KEPT })}
            onCommit={(kept) => onChange({ ...caps, kept: kept ?? caps.kept })}
          />
          <NumberField
            label={t('most')}
            value={caps.mostMb}
            min={SMALLEST_MB}
            max={LARGEST_MB}
            step={50}
            unit={t('megabytes')}
            format={whole}
            decreaseLabel={t('smaller')}
            increaseLabel={t('larger')}
            hint={t('mostHint')}
            onCommit={(mostMb) => onChange({ ...caps, mostMb: mostMb ?? caps.mostMb })}
          />
        </div>
      )}
      {said ? (
        <p
          role={said.tone === 'trouble' ? 'alert' : 'status'}
          className={
            said.tone === 'trouble'
              ? 'max-w-xl rounded-control border border-line-strong px-4 py-3'
              : 'text-sm text-muted'
          }
        >
          {said.text}
        </p>
      ) : null}
    </SettingsSection>
  )
}

function SaveCaps() {
  const t = useTranslations('SaveSettings')
  const [caps, setCaps] = useState<CapsState>()
  const [said, setSaid] = useState<{ tone: 'done' | 'trouble'; text: string }>()

  useEffect(() => {
    let current = true
    saves
      .caps()
      .then((answer) => current && setCaps(answer))
      .catch(() => current && setCaps('old'))
    return () => {
      current = false
    }
  }, [])

  return (
    <SaveCapsView
      caps={caps}
      said={said}
      onChange={async (next) => {
        setSaid(undefined)
        try {
          setCaps(await saves.setCaps(next))
          setSaid({ tone: 'done', text: t('saved') })
        } catch {
          setSaid({ tone: 'trouble', text: t('failed') })
        }
      }}
    />
  )
}

function Body() {
  const t = useTranslations('AppSettings')
  return (
    <>
      <h1 className={titleClass}>{t('pages.saves.title')}</h1>
      <div className={cn('mt-8', SECTIONS)}>
        <SaveCaps />
      </div>
    </>
  )
}

/** Games' saves, in Settings (ADR 008): the limits on their snapshots. Fetched only in the app. */
export default function SaveSettings() {
  return (
    <AppWords>
      <Body />
    </AppWords>
  )
}
