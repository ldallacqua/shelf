'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import { SettingsSection } from '@/features/settings/settings-section'
import { Link } from '@/i18n/navigation'
import { Switch } from '@/ui/checkbox'
import { Ghost, GhostText } from '@/ui/ghost'

import { desktop, type Starting } from './bridge'

/** What the app said, or that it is too old to say (before 0.12.0). */
export type StartingState = Starting | 'old' | undefined

/**
 * Starting with Windows, in the tray (ADR 005, section 12), so a game opened from Steam counts
 * without opening Shelf first. On from the first start; until issue 152 only the tray's menu could
 * turn it off. The tray's check and this switch say the same, whichever changed it.
 */
export function StartWithWindowsView({
  state,
  busy = false,
  failed = false,
  onChange,
}: {
  state: StartingState
  busy?: boolean
  failed?: boolean
  onChange: (on: boolean) => void
}) {
  const t = useTranslations('AppSettings.startWithWindows')
  const id = useId()

  return (
    <SettingsSection title={t('title')} scope="device">
      <p id={`${id}-body`} className="max-w-xl text-pretty text-muted">
        {t.rich('body', {
          link: (chunks) => (
            <Link
              href={{ pathname: '/', hash: 'faq-hours' }}
              className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
            >
              {chunks}
            </Link>
          ),
        })}
      </p>
      {state === undefined ? (
        <div aria-hidden="true" className="flex max-w-xl items-center gap-3">
          <Ghost className="h-6 w-10 rounded-full" />
          <GhostText className="w-48 text-sm" />
        </div>
      ) : state === 'old' ? (
        <p className="max-w-xl text-pretty">{t('old')}</p>
      ) : (
        <>
          <div className="flex max-w-xl items-center gap-3">
            <Switch
              id={id}
              checked={state.on}
              disabled={busy || !state.available}
              aria-describedby={`${id}-body`}
              onChange={(event) => onChange(event.target.checked)}
            />
            <label htmlFor={id} className="text-sm font-medium">
              {t('label')}
            </label>
          </div>
          {state.available ? null : (
            <p className="max-w-xl text-sm text-pretty text-muted">{t('unavailable')}</p>
          )}
        </>
      )}
      {failed ? (
        <p role="alert" className="max-w-xl rounded-control border border-line-strong px-4 py-3">
          {t('failed')}
        </p>
      ) : null}
    </SettingsSection>
  )
}

export function StartWithWindows() {
  const [state, setState] = useState<StartingState>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    const read = () => {
      desktop
        .startWithWindows()
        .then((answer) => current && setState(answer))
        .catch(() => current && setState('old'))
    }
    read()
    // The tray's menu may have changed it while the window was away.
    const onVisible = () => document.visibilityState === 'visible' && read()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      current = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return (
    <StartWithWindowsView
      state={state}
      busy={busy}
      failed={failed}
      onChange={async (on) => {
        setBusy(true)
        setFailed(false)
        try {
          setState(await desktop.setStartWithWindows(on))
        } catch {
          setFailed(true)
        }
        setBusy(false)
      }}
    />
  )
}
