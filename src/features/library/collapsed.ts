'use client'

import { useSyncExternalStore } from 'react'

import { COLLAPSED_KEY } from './collapsed-script'

/**
 * Shelves folded away on this device (spec 3.7), by key (`platform:167`,
 * `status:playing`), kept in the browser's storage. Until the page comes
 * alive, a style the head script writes hides them (`collapsed-script.ts`),
 * so a folded shelf never shows its games first; from then on the page
 * hides them itself. On a phone a shelf fills the screen, so nothing folds there.
 */

const NONE: ReadonlySet<string> = new Set()

const read = (): ReadonlySet<string> => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? '[]')
    return Array.isArray(stored)
      ? new Set(stored.filter((key): key is string => typeof key === 'string'))
      : NONE
  } catch {
    return NONE
  }
}

let current: ReadonlySet<string> | undefined
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  // Folded in another tab: this one follows.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLLAPSED_KEY) return
    current = undefined
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The shelves folded away on this device. The server draws none folded. */
export const useCollapsed = (): ReadonlySet<string> =>
  useSyncExternalStore(
    subscribe,
    () => (current ??= read()),
    () => NONE,
  )

export const toggleCollapsed = (key: string): void => {
  const next = new Set(current ?? read())
  if (next.has(key)) next.delete(key)
  else next.add(key)
  try {
    if (next.size === 0) window.localStorage.removeItem(COLLAPSED_KEY)
    else window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
  } catch {
    // Storage is blocked: the shelf still folds on this page.
  }
  current = next
  for (const listener of listeners) listener()
}
