import { vi } from 'vitest'

/** `phone`: a window narrower than 40rem, as `(width < 40rem)` asks. */
type Device = { dark: boolean; reducedMotion: boolean; phone: boolean }

type Listener = (event: { matches: boolean }) => void

const state: Device = { dark: false, reducedMotion: false, phone: false }
const listeners = new Map<string, Set<Listener>>()

function matches(query: string): boolean {
  if (query.includes('prefers-color-scheme: dark')) return state.dark
  if (query.includes('prefers-reduced-motion: reduce')) return state.reducedMotion
  if (query.includes('width < 40rem')) return state.phone
  return false
}

/**
 * Sets what the simulated device prefers, and tells anything listening, the
 * way a real device does when its appearance setting changes.
 */
export function setDevice(next: Partial<Device>): void {
  Object.assign(state, next)
  for (const [query, set] of listeners) {
    for (const listener of set) listener({ matches: matches(query) })
  }
}

vi.stubGlobal('matchMedia', (query: string) => ({
  media: query,
  get matches() {
    return matches(query)
  },
  addEventListener: (_type: string, listener: Listener) => {
    if (!listeners.has(query)) listeners.set(query, new Set())
    listeners.get(query)?.add(listener)
  },
  removeEventListener: (_type: string, listener: Listener) => {
    listeners.get(query)?.delete(listener)
  },
}))
