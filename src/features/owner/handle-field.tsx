'use client'

import { CheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useId, useState } from 'react'

import { HANDLE_MAX, handleProblem, type HandleProblem } from '@/domain/accounts/handle'
import { Input } from '@/ui/field'
import { Ghost } from '@/ui/ghost'

/** A short pause after typing before the server is asked. */
const PAUSE_MS = 300

export type HandleStatus =
  | { state: 'empty' }
  | { state: 'checking' }
  | { state: 'available' }
  /** The account's own handle, unchanged. */
  | { state: 'yours' }
  | { state: 'problem'; problem: HandleProblem | 'taken' }
  /** The server could not be asked: the form may still try, and hear the answer then. */
  | { state: 'unknown' }

type Answer = { available: true } | { available: false; problem: HandleProblem | 'taken' }

/**
 * Whether a handle can be had, as it is typed: its shape here at once, and
 * whether another shelf has it from the server after a pause. A newer
 * keystroke makes an older answer no one's.
 */
export const useHandleCheck = (handle: string, current?: string): HandleStatus => {
  const [answered, setAnswered] = useState<{ handle: string; status: HandleStatus }>()
  const problem = handleProblem(handle)
  const local: HandleStatus | undefined =
    handle === ''
      ? { state: 'empty' }
      : handle === current
        ? { state: 'yours' }
        : problem
          ? { state: 'problem', problem }
          : undefined
  // Known here, without asking.
  const settled = local !== undefined

  useEffect(() => {
    if (settled) return
    let wanted = true
    const timer = window.setTimeout(async () => {
      let status: HandleStatus
      try {
        const response = await fetch(`/api/v1/handles/${encodeURIComponent(handle)}`, {
          cache: 'no-store',
        })
        const answer = response.ok ? ((await response.json()) as Answer) : undefined
        status = !answer
          ? { state: 'unknown' }
          : answer.available
            ? { state: 'available' }
            : { state: 'problem', problem: answer.problem }
      } catch {
        status = { state: 'unknown' }
      }
      if (wanted) setAnswered({ handle, status })
    }, PAUSE_MS)
    return () => {
      wanted = false
      window.clearTimeout(timer)
    }
  }, [handle, settled])

  if (local) return local
  return answered?.handle === handle ? answered.status : { state: 'checking' }
}

type HandleFieldProps = {
  value: string
  onChange: (handle: string) => void
  status: HandleStatus
  disabled?: boolean
}

/**
 * A shelf's handle, the end of its address (ADR 004): shown as part of the
 * address, lowercased as it is typed, with whether it can be had said
 * beside it and read with it.
 */
export function HandleField({ value, onChange, status, disabled }: HandleFieldProps) {
  const t = useTranslations('Account.handle')
  const id = useId()
  const statusId = `${id}-status`
  const wrong = status.state === 'problem'

  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {t('label')}
      </label>
      <div className="flex items-stretch">
        <span
          aria-hidden="true"
          className="inline-flex items-center rounded-l-control border border-r-0 border-line-strong bg-surface-raised px-3 text-sm text-muted"
        >
          {t('prefix')}
        </span>
        <Input
          id={id}
          name="handle"
          value={value}
          onChange={(event) => onChange(event.target.value.toLowerCase())}
          required
          maxLength={HANDLE_MAX}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={wrong || undefined}
          aria-describedby={statusId}
          className="rounded-l-none font-normal"
        />
      </div>
      <p id={statusId} aria-live="polite" className="flex min-h-5 items-center gap-1.5 text-sm">
        <HandleSaid status={status} />
      </p>
    </div>
  )
}

function HandleSaid({ status }: { status: HandleStatus }) {
  const t = useTranslations('Account.handle')
  switch (status.state) {
    case 'empty':
      return <span className="text-muted">{t('hint')}</span>
    case 'checking':
      return (
        <>
          <span className="sr-only">{t('checking')}</span>
          <Ghost className="h-3 w-40" />
        </>
      )
    case 'available':
      return (
        <>
          <CheckIcon aria-hidden="true" className="size-4 text-accent" />
          {t('available')}
        </>
      )
    case 'yours':
      return <span className="text-muted">{t('yours')}</span>
    case 'problem':
      return <span>{t(status.problem)}</span>
    case 'unknown':
      return <span className="text-muted">{t('hint')}</span>
  }
}
