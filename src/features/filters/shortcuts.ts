'use client'

import { useSyncExternalStore } from 'react'

/**
 * Whether single-key shortcuts are on (spec 3.11): they can be turned off
 * entirely, for this device, `/` and `?` with the letters (WCAG 2.1.4). The
 * list that turns them back on is also a button in the toolbar.
 */

const KEY = 'shelf:shortcuts'
const listeners = new Set<() => void>()

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export const setShortcutsOn = (on: boolean): void => {
  try {
    if (on) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, 'off')
  } catch {
    // Storage is blocked: the choice lasts for this page.
  }
  current = on
  for (const listener of listeners) listener()
}

let current: boolean | undefined

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const shortcutsOn = (): boolean => (current ??= read())

export const useShortcutsOn = (): boolean =>
  useSyncExternalStore(subscribe, shortcutsOn, () => true)
