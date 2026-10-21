'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether the owner is here (architecture, section 9). Pages are built ahead
 * for everyone, so they never ask the server who is reading; the browser
 * asks, once, and only when the hint cookie set at sign-in is there. Edit
 * controls wait for the answer: a visitor is never shown one, not even for
 * a moment.
 */

export type OwnerState =
  | { status: 'visitor' }
  /** The hint is there; the answer is on its way. */
  | { status: 'checking' }
  | { status: 'owner'; name: string; image?: string }

const HINT = 'shelf_owner_hint'
const VISITOR: OwnerState = { status: 'visitor' }
const CHECKING: OwnerState = { status: 'checking' }

let state: OwnerState | undefined
let asking: Promise<void> | undefined
const listeners = new Set<() => void>()

const set = (next: OwnerState) => {
  state = next
  for (const listener of listeners) listener()
}

const hinted = (): boolean => document.cookie.split(/;\s*/).includes(`${HINT}=1`)

type Answer = { owner: true; name: string; image?: string } | { owner: false }

const ask = () => {
  asking ??= fetch('/api/v1/me', { cache: 'no-store' })
    .then((response): Promise<Answer> | Answer =>
      response.ok ? (response.json() as Promise<Answer>) : { owner: false },
    )
    .then((answer: Answer) =>
      set(
        answer.owner
          ? { status: 'owner', name: answer.name, ...(answer.image ? { image: answer.image } : {}) }
          : VISITOR,
      ),
    )
    .catch(() => set(VISITOR))
  return asking
}

const current = (): OwnerState => {
  if (!state) {
    state = hinted() ? CHECKING : VISITOR
    if (state === CHECKING) void ask()
  }
  return state
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** A visitor while the page is drawn on the server and until the browser knows better. */
export const useOwner = (): OwnerState => useSyncExternalStore(subscribe, current, () => VISITOR)

/** Whether the owner is here, for code outside React. */
export const ownerIsHere = (): boolean => current().status === 'owner'

/** After signing out: a visitor again, at once. */
export const forgetOwner = () => {
  asking = undefined
  set(VISITOR)
}

/** Ends the session. False when the server could not be reached. */
export const signOut = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (response.ok) forgetOwner()
    return response.ok
  } catch {
    return false
  }
}
