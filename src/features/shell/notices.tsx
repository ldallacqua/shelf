'use client'

import { XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { Tip } from '@/ui/tooltip'

/**
 * Short messages after something changed, with a way to take it back:
 * "Added Hades. Undo." One at a time, at the foot of the screen. A notice
 * stays while a pointer or focus is on it, and leaves on its own after
 * that. Screen readers hear it once, politely.
 */

export type NoticeAction = { label: string; run: () => void | Promise<void> }

export type Notice = {
  id: number
  message: string
  actions?: readonly NoticeAction[]
}

/** Long enough to read a sentence and reach for Undo. */
const STAYS_MS = 10_000

let current: Notice | undefined
let next = 1
const listeners = new Set<() => void>()

const set = (notice: Notice | undefined) => {
  current = notice
  for (const listener of listeners) listener()
}

/** Shows a notice in place of any other. Returns its id. */
export const notify = (notice: Omit<Notice, 'id'>): number => {
  const id = next++
  set({ ...notice, id })
  return id
}

export const dismissNotice = (id?: number) => {
  if (id === undefined || current?.id === id) set(undefined)
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const read = () => current

/** Where notices appear: once, in the layout. */
export function Notices() {
  const t = useTranslations('Shell')
  const notice = useSyncExternalStore(subscribe, read, () => undefined)
  const [held, setHeld] = useState(false)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!notice || held) return
    const timer = window.setTimeout(() => dismissNotice(notice.id), STAYS_MS)
    return () => window.clearTimeout(timer)
  }, [notice, held])

  return (
    // The live region is always there, so a notice added to it is announced.
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-start sm:px-6 lg:px-10"
    >
      {notice ? (
        <div
          ref={box}
          key={notice.id}
          data-notice=""
          className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-panel border border-line-strong bg-surface-raised py-2 pr-2 pl-4 text-sm text-text shadow-panel motion-safe:animate-fade-in"
          onPointerEnter={() => setHeld(true)}
          onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(event) => {
            if (!box.current?.contains(event.relatedTarget as Node | null)) setHeld(false)
          }}
        >
          <p className="min-w-0 flex-1 py-1.5 text-pretty">{notice.message}</p>
          {notice.actions?.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              className="min-h-10 flex-none rounded-control px-3 font-semibold text-accent hover:bg-text/8 disabled:opacity-50 pointer-coarse:min-h-11"
              onClick={async () => {
                setBusy(true)
                try {
                  await action.run()
                } finally {
                  setBusy(false)
                }
              }}
            >
              {action.label}
            </button>
          ))}
          <Tip label={t('dismiss')}>
            <button
              type="button"
              aria-label={t('dismiss')}
              className="inline-flex size-10 flex-none items-center justify-center rounded-control text-muted hover:bg-text/8 hover:text-text pointer-coarse:size-11"
              onClick={() => dismissNotice(notice.id)}
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          </Tip>
        </div>
      ) : null}
    </div>
  )
}
