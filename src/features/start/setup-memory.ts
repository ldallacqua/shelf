import { useSyncExternalStore } from 'react'

import {
  isSetupStep,
  openingStep,
  parseSetupMemory,
  writeSetupMemory,
  type SetupMemory,
} from '@/domain/setup/setup'

/**
 * Where an account's setup stands on this device, and where it plays (spec 4.6), one entry per
 * handle so two people sharing a browser each start at the beginning. Everything else the steps
 * choose is kept where it always is: the platforms on the account, the colors on the device.
 * Storage that is full, switched off or private only loses this memory, never the step.
 */
const key = (handle: string) => `shelf:setup:${handle}`

function readStored(handle: string): SetupMemory {
  try {
    return parseSetupMemory(window.localStorage.getItem(key(handle)))
  } catch {
    return parseSetupMemory(null)
  }
}

function keep(handle: string, memory: SetupMemory): void {
  try {
    window.localStorage.setItem(key(handle), writeSetupMemory(memory))
  } catch {
    // Kept for this visit only.
  }
}

/** The memory while the page is open, read once as it opens: its step is the one it opens on. */
let open: { handle: string; memory: SetupMemory } | undefined
const listeners = new Set<() => void>()

function current(handle: string): SetupMemory {
  if (open?.handle !== handle) {
    const stored = readStored(handle)
    const step = openingStep({
      hash: window.location.hash,
      backFromSteam: new URLSearchParams(window.location.search).has('steam'),
      stored: stored.step,
    })
    open = { handle, memory: { ...stored, step } }
  }
  return open.memory
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    // Closed: the next opening reads the address and the device again (Settings' `#play`).
    if (listeners.size === 0) open = undefined
  }
}

/**
 * Once the page has opened: the address is read again, as a move from another page (Settings'
 * "Set up your shelf again") draws this one before the router has put its address in the bar.
 * Then the step it opened on is kept on the device and named in the address, so Back from the
 * next step returns to it.
 */
export function settleSetupMemory(handle: string) {
  const named = window.location.hash.slice(1)
  if (isSetupStep(named) && named !== current(handle).step) {
    changeSetupMemory(handle, (memory) => ({ ...memory, step: named }))
  }
  const memory = current(handle)
  keep(handle, memory)
  const { pathname, search } = window.location
  window.history.replaceState(window.history.state, '', `${pathname}${search}#${memory.step}`)
}

/** Changes the memory, keeps it on the device, and tells the page. */
export function changeSetupMemory(handle: string, change: (memory: SetupMemory) => SetupMemory) {
  const next = change(current(handle))
  open = { handle, memory: next }
  keep(handle, next)
  for (const listener of listeners) listener()
}

/**
 * The setup's memory for this account, once in the browser: nothing while the page is drawn on
 * the server, which builds it ahead for everyone.
 */
export const useSetupMemory = (handle: string): SetupMemory | undefined =>
  useSyncExternalStore(
    subscribe,
    () => current(handle),
    () => undefined,
  )
