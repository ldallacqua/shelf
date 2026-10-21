'use client'

import { useSyncExternalStore } from 'react'

/**
 * The library just changed, here, by the owner: its new version, and the
 * game it was about. The library page listens, fetches the new file, and
 * brings that game into view (spec 4.1, "Afterwards").
 */

export type LibraryChange = {
  /** Counts up with every change made on this page. */
  id: number
  version: number
  /** The game added or changed, by its address. */
  slug?: string
  title?: string
  /** Takes the change back: offered again if the library has to say more about it. */
  undo?: () => Promise<void>
}

let last: LibraryChange | undefined
let next = 1
const listeners = new Set<() => void>()

export const announceChange = (change: Omit<LibraryChange, 'id'>) => {
  last = { ...change, id: next++ }
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useLibraryChange = (): LibraryChange | undefined =>
  useSyncExternalStore(
    subscribe,
    () => last,
    () => undefined,
  )
