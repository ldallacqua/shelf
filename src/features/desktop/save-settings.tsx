'use client'

import { CheckIcon, CloudIcon, FolderIcon, MonitorIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { type ReactNode, useEffect, useState } from 'react'

import { SECTIONS, SettingsSection, titleClass } from '@/features/settings/settings-section'
import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { Ghost, GhostText } from '@/ui/ghost'
import { NumberField } from '@/ui/number-field'

import { AppWords } from './app-words'
import {
  type Caps,
  type SavePlace,
  type SaveService,
  saves,
  serviceNames,
  signInEndOf,
} from './saves'

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

type Said = { tone: 'done' | 'trouble'; text: string }

/** One place snapshots can go: what it is, where, and what can be done with it. */
function PlaceRow({
  icon: Icon,
  name,
  detail,
  current,
  children,
}: {
  icon: typeof MonitorIcon
  name: string
  detail: ReactNode
  current: boolean
  children?: ReactNode
}) {
  const t = useTranslations('SaveSettings.place')
  return (
    <li
      aria-current={current || undefined}
      className={cn(
        'flex items-start gap-3 rounded-control border px-4 py-3',
        current ? 'border-line-strong' : 'border-line',
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 flex-none text-muted" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium">
          <span className="break-all">{name}</span>
          {current ? (
            <span className="flex items-center gap-1 text-xs font-medium text-accent">
              <CheckIcon aria-hidden="true" className="size-3.5" />
              {t('current')}
            </span>
          ) : null}
        </p>
        <div className="text-xs text-pretty text-muted">{detail}</div>
        {children ? <div className="mt-1 flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </li>
  )
}

/**
 * Where this computer's snapshots go (ADR 008, sections 8 and phase 5): the app's own folder, a folder of
 * mine (one a cloud client syncs, a network drive or a USB drive), or OneDrive or Google Drive signed in
 * from here, the same on each of my computers. A list of the places, as accounts are listed in Windows'
 * settings, the one in use marked, each with what it takes to use it: a picker, or a sign-in on the
 * service's own page.
 */
export function SavePlaceView({
  place,
  busy = false,
  signingIn,
  said,
  onChoose,
  onForget,
  onSignIn,
  onUseCloud,
  onSignOut,
  onCancelSignIn,
}: {
  place: PlaceState
  busy?: boolean
  /** The service whose page is open in the browser, waited on. */
  signingIn?: SaveService | undefined
  said?: Said | undefined
  onChoose: () => void
  onForget: () => void
  onSignIn: (service: SaveService) => void
  onUseCloud: (service: SaveService) => void
  onSignOut: (service: SaveService) => void
  onCancelSignIn: (service: SaveService) => void
}) {
  const t = useTranslations('SaveSettings.place')
  const ready = typeof place === 'object'
  const services = ready ? place.services : []
  const here = ready && place.folder === null && place.cloud === null
  const away = (why: SavePlace['away']) =>
    why === 'signed-out' ? t('signedOut') : why === 'full' ? t('full') : t('away')
  return (
    <SettingsSection title={t('title')} scope="device">
      <p className="max-w-xl text-pretty text-muted">
        {services.length > 0 ? t('introServices') : t('intro')}
      </p>
      {place === undefined ? (
        <div aria-hidden="true" className="grid max-w-xl gap-2">
          {[0, 1, 2].map((row) => (
            <Ghost key={row} order={row} className="h-16 rounded-control" />
          ))}
        </div>
      ) : place === 'old' ? (
        <p className="max-w-xl text-pretty">{t('old')}</p>
      ) : (
        <ul className="grid max-w-xl gap-2">
          <PlaceRow icon={MonitorIcon} name={t('here')} detail={t('hereHint')} current={here}>
            {here ? null : (
              <Button variant="secondary" size="sm" disabled={busy} onClick={onForget}>
                {t('forget')}
              </Button>
            )}
          </PlaceRow>
          <PlaceRow
            icon={FolderIcon}
            name={place.folder ?? t('folder')}
            detail={
              place.folder === null
                ? t('folderHint')
                : place.reachable
                  ? t('thereHint')
                  : away(place.away)
            }
            current={place.folder !== null}
          >
            <Button variant="secondary" size="sm" disabled={busy} onClick={onChoose}>
              {place.folder === null ? t('choose') : t('change')}
            </Button>
          </PlaceRow>
          {services.map(({ service, account }) => {
            const name = serviceNames[service]
            const current = place.cloud === service
            const waiting = signingIn === service
            const detail = waiting
              ? t(service === 'onedrive' ? 'waitingOnedrive' : 'waitingGoogle')
              : current && !place.reachable
                ? // In use, and the sign-in taken back, or the service out of reach or full.
                  [account, away(place.away)].filter(Boolean).join(' · ')
                : account === null
                  ? t(service === 'onedrive' ? 'onedriveHint' : 'googleHint')
                  : `${account} · ${t(service === 'onedrive' ? 'onedriveWhere' : 'googleWhere')}`
            return (
              <PlaceRow
                key={service}
                icon={CloudIcon}
                name={name}
                detail={<span aria-live="polite">{detail}</span>}
                current={current}
              >
                {waiting ? (
                  <Button variant="secondary" size="sm" onClick={() => onCancelSignIn(service)}>
                    {t('cancel')}
                  </Button>
                ) : account === null || (current && place.away === 'signed-out') ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => onSignIn(service)}
                  >
                    {current ? t('signInAgain', { service: name }) : t('signIn', { service: name })}
                  </Button>
                ) : (
                  <>
                    {current ? null : (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => onUseCloud(service)}
                      >
                        {t('use', { service: name })}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => onSignOut(service)}
                    >
                      {t('signOut', { service: name })}
                    </Button>
                  </>
                )}
              </PlaceRow>
            )
          })}
        </ul>
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
  const [signingIn, setSigningIn] = useState<SaveService>()
  const [said, setSaid] = useState<Said>()

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

  const run = async (
    work: () => Promise<SavePlace | null>,
    done: string,
    trouble: (error: unknown) => string | undefined,
  ) => {
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
      const text = trouble(error)
      if (text) setSaid({ tone: 'trouble', text })
    }
    setBusy(false)
  }

  const folderTrouble = (error: unknown) => (error === 'wide' ? t('refused') : t('failed'))

  const signIn = async (service: SaveService) => {
    const name = serviceNames[service]
    setSigningIn(service)
    await run(
      () => saves.signIn(service),
      t('signedIn', { service: name }),
      (error) => {
        const end = signInEndOf(error)
        // Cancelled, here or on the service's page: nothing to say.
        if (end === 'cancelled') return undefined
        return end === 'unreachable'
          ? t('signInUnreachable', { service: name })
          : t('signInRefused', { service: name })
      },
    )
    setSigningIn(undefined)
  }

  return (
    <SavePlaceView
      place={place}
      busy={busy}
      signingIn={signingIn}
      said={said}
      onChoose={() =>
        void run(() => saves.choosePlace(t('pickerTitle')), t('chosen'), folderTrouble)
      }
      onForget={() =>
        void run(
          () => saves.forgetPlace(),
          t('forgotten'),
          () => t('failed'),
        )
      }
      onSignIn={(service) => void signIn(service)}
      onUseCloud={(service) =>
        void run(
          () => saves.useCloud(service),
          t('used', { service: serviceNames[service] }),
          () => t('signInRefused', { service: serviceNames[service] }),
        )
      }
      onSignOut={(service) =>
        void run(
          () => saves.signOut(service),
          t('signedOutDone', { service: serviceNames[service] }),
          () => t('failed'),
        )
      }
      onCancelSignIn={(service) => void saves.cancelSignIn(service)}
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
