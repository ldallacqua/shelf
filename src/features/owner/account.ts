'use client'

import { useSyncExternalStore } from 'react'

/**
 * Who is signed in (architecture, section 9; ADR 004). Pages are built ahead
 * for everyone, so they never ask the server who is reading; the browser
 * asks, once, and only when the hint cookie set at sign-in is there. Edit
 * controls wait for the answer, and appear only on the account's own shelf:
 * a visitor is never shown one, not even for a moment.
 */

export type SignedIn = {
  status: 'signed-in'
  /** The handle in its shelf's address, `/u/{handle}`. */
  handle: string
  name: string
  image?: string
  shelfPublic: boolean
  /** How many of its games wait for a status (spec 4.5), for the header's count; unknown until said. */
  waiting?: number
}

export type AccountState =
  | { status: 'visitor' }
  /** The hint is there; the answer is on its way. */
  | { status: 'checking' }
  | SignedIn

const HINT = 'shelf_signed_in'
const VISITOR: AccountState = { status: 'visitor' }
const CHECKING: AccountState = { status: 'checking' }

let state: AccountState | undefined
let asking: Promise<void> | undefined
const listeners = new Set<() => void>()

const set = (next: AccountState) => {
  state = next
  for (const listener of listeners) listener()
}

const hinted = (): boolean => document.cookie.split(/;\s*/).includes(`${HINT}=1`)

type Answer =
  | {
      signedIn: true
      handle: string
      name: string
      image?: string
      shelfPublic: boolean
      waiting?: number
    }
  | { signedIn: false }

const ask = () => {
  asking ??= fetch('/api/v1/me', { cache: 'no-store' })
    .then((response): Promise<Answer> | Answer =>
      response.ok ? (response.json() as Promise<Answer>) : { signedIn: false },
    )
    .then((answer: Answer) => set(answer.signedIn ? signedIn(answer) : VISITOR))
    .catch(() => set(VISITOR))
  return asking
}

const signedIn = ({
  handle,
  name,
  image,
  shelfPublic,
  waiting,
}: Omit<SignedIn, 'status'>): SignedIn => ({
  status: 'signed-in',
  handle,
  name,
  shelfPublic,
  ...(image ? { image } : {}),
  ...(waiting === undefined ? {} : { waiting }),
})

const current = (): AccountState => {
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
export const useAccount = (): AccountState =>
  useSyncExternalStore(subscribe, current, () => VISITOR)

/** Whether the shelf with this handle is the signed-in account's own: where edit controls go. */
export const useIsMine = (handle: string | undefined): boolean => {
  const account = useAccount()
  return account.status === 'signed-in' && handle !== undefined && account.handle === handle
}

/** The signed-in account, for code outside React. */
export const signedInAccount = (): SignedIn | undefined => {
  const now = current()
  return now.status === 'signed-in' ? now : undefined
}

/** After the account page saved a change: the new name, handle or visibility, everywhere at once. */
export const accountChanged = (next: Omit<SignedIn, 'status'>) =>
  set(signedIn({ waiting: state?.status === 'signed-in' ? state.waiting : undefined, ...next }))

/**
 * After games were placed, or the library changed under them: how many wait now, for the
 * header's count. The library and the page for placing say so as they learn it.
 */
export const waitingChanged = (waiting: number) => {
  if (state?.status === 'signed-in' && state.waiting !== waiting) set({ ...state, waiting })
}

/** After signing out, or deleting the account: a visitor again, at once. */
export const forgetAccount = () => {
  asking = undefined
  set(VISITOR)
}

/**
 * Opens a page of the site as a whole new page, after signing in, up or out
 * of everywhere: every part of it, the header included, asks afresh who is
 * here. A move within the site would keep what the old page knew.
 */
export const openAfresh = (path: string) => window.location.assign(path)

/** Ends the session. False when the server could not be reached. */
export const signOut = async (): Promise<boolean> => {
  try {
    const response = await fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (response.ok) forgetAccount()
    return response.ok
  } catch {
    return false
  }
}
