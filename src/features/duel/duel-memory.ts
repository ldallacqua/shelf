import { useSyncExternalStore } from 'react'

import { parseDuelMemory, writeDuelMemory, type DuelMemory } from '@/domain/duel/memory'

/**
 * Where an account's duel stands on this device (spec 3.14), one entry per handle so two people
 * sharing a browser each keep their own: the statuses drawn from, the games chosen, and the duel
 * under way or just won. A reload, a look at a game's page or Back finds it as it was left.
 * Storage that is full, switched off or private only loses the memory, never the duel on screen.
 */
const key = (handle: string) => `shelf:duel:${handle}`

function readStored(handle: string): DuelMemory {
  try {
    return parseDuelMemory(window.localStorage.getItem(key(handle)))
  } catch {
    return parseDuelMemory(null)
  }
}

function keep(handle: string, memory: DuelMemory): void {
  try {
    window.localStorage.setItem(key(handle), writeDuelMemory(memory))
  } catch {
    // Kept for this visit only.
  }
}

/** The memory while the page is open, read once as it opens. */
let open: { handle: string; memory: DuelMemory } | undefined
const listeners = new Set<() => void>()

function current(handle: string): DuelMemory {
  if (open?.handle !== handle) open = { handle, memory: readStored(handle) }
  return open.memory
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // Closed: the next opening reads the device again.
    if (listeners.size === 0) open = undefined
  }
}

/** Changes the memory, keeps it on the device, and tells the page. */
export function changeDuelMemory(handle: string, change: (memory: DuelMemory) => DuelMemory) {
  const next = change(current(handle))
  open = { handle, memory: next }
  keep(handle, next)
  for (const listener of listeners) listener()
}

/** This account's duel memory; undefined while the page is drawn ahead, with no device to read. */
export function useDuelMemory(handle: string | undefined): DuelMemory | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (handle === undefined ? undefined : current(handle)),
    () => undefined,
  )
}
