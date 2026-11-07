'use client'

import { SaveIcon } from 'lucide-react'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import { DEVICE_NAME_MAX, type Device } from '@/domain/library/devices'
import { callApi } from '@/features/owner/call-api'
import { SectionHead } from '@/features/settings/settings-section'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

import { desktop } from './bridge'
import { ThisComputerGhost } from './download-sources-ghost'

/** Said after saving, under the field. */
export type ComputerSaid = { tone: 'done' | 'trouble'; text: string }

/**
 * This computer's name, in Settings, in Shelf for Windows alone (ADR 005, section 12): the page
 * notes which computer each session came from, and the name I give it is how I tell them apart.
 * Until I name it, it is called by its place among my computers, never by Windows' own name for it,
 * which often holds a person's. The others are listed under it, so that place makes sense.
 */
export function ThisComputerView({
  number,
  name,
  others,
  busy = false,
  said,
  onSave,
}: {
  /** Its place among my computers. */
  number: number
  name?: string
  others: readonly Device[]
  busy?: boolean
  said?: ComputerSaid
  onSave: (name: string) => void
}) {
  const t = useTranslations('ThisComputer')
  const format = useFormatter()
  const now = useNow({ updateInterval: 60_000 })
  const id = useId()
  const [text, setText] = useState(name ?? '')
  const [from, setFrom] = useState(name)
  // A saved name replaces what is in the field.
  if (name !== from) {
    setFrom(name)
    setText(name ?? '')
  }
  const unnamed = t('unnamed', { number })
  const changed = text.trim() !== (name ?? '')

  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <SectionHead title={t('title')} scope="device" />
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      <form
        className="grid max-w-md gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (changed && !busy) onSave(text.trim())
        }}
      >
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            {t('name')}
          </label>
          <Input
            id={`${id}-name`}
            name="computer"
            value={text}
            placeholder={unnamed}
            maxLength={DEVICE_NAME_MAX}
            autoComplete="off"
            disabled={busy}
            aria-describedby={`${id}-hint`}
            onChange={(event) => setText(event.target.value)}
          />
          <p id={`${id}-hint`} className="text-xs text-pretty text-muted">
            {t('hint', { unnamed })}
          </p>
        </div>
        {said ? (
          <p
            role={said.tone === 'trouble' ? 'alert' : 'status'}
            className={
              said.tone === 'trouble'
                ? 'rounded-control border border-line-strong px-4 py-3'
                : 'text-sm text-muted'
            }
          >
            {said.text}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="primary" disabled={busy || !changed}>
            <SaveIcon aria-hidden="true" />
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
      {others.length > 0 ? (
        <div className="grid max-w-md gap-2">
          <h3 className="text-sm font-medium">{t('others')}</h3>
          <ul className="grid gap-1 text-sm">
            {others.map((device) => (
              <li key={device.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="wrap-anywhere">
                  {device.name ?? t('unnamed', { number: device.number })}
                </span>
                <span className="text-muted">
                  {device.lastSeenAt
                    ? t('lastPlayed', {
                        when: format.relativeTime(new Date(device.lastSeenAt), now),
                      })
                    : t('nothingYet')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

/** Asks the app which computer this is, and Shelf what it knows of my computers. */
export function ThisComputer() {
  const t = useTranslations('ThisComputer')
  const [known, setKnown] = useState<{ id: string; devices: Device[] } | null>()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<ComputerSaid>()

  useEffect(() => {
    let current = true
    void Promise.all([
      desktop.info().catch(() => undefined),
      callApi<{ devices: Device[] }>('GET', '/api/v1/me/devices'),
    ]).then(([info, answer]) => {
      if (!current) return
      // An app older than computers' ids has nothing to name; a failed read draws nothing either.
      setKnown(
        info?.device && answer.ok ? { id: info.device, devices: answer.value.devices } : null,
      )
    })
    return () => {
      current = false
    }
  }, [])

  if (known === undefined) return <ThisComputerGhost />
  if (known === null) return null
  const here = known.devices.find((device) => device.id === known.id)
  // Not heard from yet, it is the next one.
  const number = here?.number ?? known.devices.length + 1

  return (
    <ThisComputerView
      number={number}
      name={here?.name}
      others={known.devices.filter((device) => device.id !== known.id)}
      busy={busy}
      said={said}
      onSave={async (name) => {
        setBusy(true)
        setSaid(undefined)
        const answer = await callApi('PUT', `/api/v1/me/devices/${encodeURIComponent(known.id)}`, {
          name: name || null,
        })
        if (answer.ok) {
          const named = { id: known.id, number, ...(name ? { name } : {}) }
          setKnown({
            id: known.id,
            devices: here
              ? known.devices.map((device) =>
                  device.id === known.id
                    ? { ...device, ...named, name: name || undefined }
                    : device,
                )
              : [...known.devices, named],
          })
          setSaid({ tone: 'done', text: t('saved') })
        } else {
          setSaid({ tone: 'trouble', text: t('failed') })
        }
        setBusy(false)
      }}
    />
  )
}
