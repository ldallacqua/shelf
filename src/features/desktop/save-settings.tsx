'use client'

import { FolderIcon, MonitorIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { SECTIONS, SettingsSection, titleClass } from '@/features/settings/settings-section'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Ghost, GhostText } from '@/ui/ghost'
import { NumberField } from '@/ui/number-field'

import { AppWords } from './app-words'
import { type Caps, type SavePlace, saves } from './saves'

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

/** What the app said of this computer's place, or that it is too old to keep saves (before 0.13.0). */
export type PlaceState = SavePlace | 'old' | undefined

/**
 * Where this computer's snapshots go (ADR 008, section 8): the app's own folder, until a folder of mine is
 * chosen, one a cloud client syncs, a network drive or a USB drive, and the same on each of my computers.
 */
export function SavePlaceView({
  place,
  busy = false,
  said,
  onChoose,
  onForget,
}: {
  place: PlaceState
  busy?: boolean
  said?: { tone: 'done' | 'trouble'; text: string } | undefined
  onChoose: () => void
  onForget: () => void
}) {
  const t = useTranslations('SaveSettings.place')
  return (
    <SettingsSection title={t('title')} scope="device">
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      {place === undefined ? (
        <div aria-hidden="true" className="grid max-w-xl gap-3">
          <Ghost className="h-14 rounded-control" />
          <Ghost className="h-8 w-40 rounded-control" />
        </div>
      ) : place === 'old' ? (
        <p className="max-w-xl text-pretty">{t('old')}</p>
      ) : (
        <>
          <div className="flex max-w-xl items-start gap-3 rounded-control border border-line px-4 py-3">
            {place.folder === null ? (
              <MonitorIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" />
            ) : (
              <FolderIcon aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" />
            )}
            <span className="grid min-w-0 gap-0.5">
              <span className="text-sm font-medium break-all">{place.folder ?? t('here')}</span>
              <span className="text-xs text-pretty text-muted">
                {place.folder === null
                  ? t('hereHint')
                  : place.reachable
                    ? t('thereHint')
                    : t('away')}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onChoose}>
              {place.folder === null ? t('choose') : t('change')}
            </Button>
            {place.folder === null ? null : (
              <Button variant="ghost" size="sm" disabled={busy} onClick={onForget}>
                {t('forget')}
              </Button>
            )}
          </div>
        </>
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

function SavePlaceSection() {
  const t = useTranslations('SaveSettings.place')
  const [place, setPlace] = useState<PlaceState>()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ tone: 'done' | 'trouble'; text: string }>()

  useEffect(() => {
    let current = true
    const read = () => {
      saves
        .place()
        .then((answer) => current && setPlace(answer))
        .catch(() => current && setPlace('old'))
    }
    read()
    // A drive plugged back in while the window was away.
    const onVisible = () => document.visibilityState === 'visible' && read()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const run = async (work: () => Promise<SavePlace | null>, done: string) => {
    setBusy(true)
    setSaid(undefined)
    try {
      const answer = await work()
      // Null: Windows' picker was closed, which changes nothing.
      if (answer) {
        setPlace(answer)
        setSaid({ tone: 'done', text: done })
      }
    } catch (error) {
      setSaid({ tone: 'trouble', text: error === 'wide' ? t('refused') : t('failed') })
    }
    setBusy(false)
  }

  return (
    <SavePlaceView
      place={place}
      busy={busy}
      said={said}
      onChoose={() => void run(() => saves.choosePlace(t('pickerTitle')), t('chosen'))}
      onForget={() => void run(() => saves.forgetPlace(), t('forgotten'))}
    />
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
        <SavePlaceSection />
        <SaveCaps />
      </div>
    </>
  )
}

/**
 * Games' saves, in Settings (ADR 008): where this computer's snapshots go, and the limits on them.
 * Fetched only in the app.
 */
export default function SaveSettings() {
  return (
    <AppWords>
      <Body />
    </AppWords>
  )
}
