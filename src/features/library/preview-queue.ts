import { thumbHashToDataURL } from 'thumbhash'

/**
 * Blurred cover previews, worked out when the browser has nothing better to do.
 *
 * A preview is a ThumbHash turned into a small image. On a mid-range phone
 * that takes about 4 ms, and a shelf filling in asks for thirty at once: done
 * while drawing, that was a tenth of a second in which the page could not
 * answer a touch. So a cover asks here and is told later. Until then it shows
 * the wash of its colors, which needs no work at all.
 */

type Listener = (address: string) => void

const ready = new Map<string, string>()
const waiting = new Map<string, Set<Listener>>()
let scheduled = false

/**
 * The most one turn spends here. An idle period can be 50 ms long, and a
 * phone that is "idle" for 50 ms is a phone that ignores a touch for 50 ms.
 */
const TURN_MS = 8

const decode = (hash: string): string | undefined => {
  try {
    const bytes = Uint8Array.from(atob(hash), (char) => char.charCodeAt(0))
    return thumbHashToDataURL(bytes)
  } catch {
    return undefined
  }
}

const work = (deadline?: IdleDeadline) => {
  scheduled = false
  const started = performance.now()
  let done = 0
  for (const [hash, listeners] of waiting) {
    // Always one, so the queue cannot stall; more only while the turn is young.
    const spent = performance.now() - started
    if (done > 0 && (spent > TURN_MS || (deadline && deadline.timeRemaining() < TURN_MS))) break
    waiting.delete(hash)
    done += 1
    const address = decode(hash)
    if (!address) continue
    ready.set(hash, address)
    for (const listener of listeners) listener(address)
  }
  if (waiting.size > 0) schedule()
}

const schedule = () => {
  if (scheduled) return
  scheduled = true
  // Safari has no idle callback: a short wait between previews does the same job.
  if (typeof requestIdleCallback === 'function') requestIdleCallback(work, { timeout: 1000 })
  else setTimeout(work, 30)
}

/** A preview that has already been worked out, if it has. */
export const previewIfReady = (hash: string): string | undefined => ready.get(hash)

/**
 * Asks for a preview. `listener` is told its address once, later. The
 * function returned takes the request back: a cover whose image has arrived
 * no longer needs its blur.
 */
export const requestPreview = (hash: string, listener: Listener): (() => void) => {
  const known = ready.get(hash)
  if (known) {
    listener(known)
    return () => undefined
  }
  const listeners = waiting.get(hash) ?? new Set<Listener>()
  listeners.add(listener)
  waiting.set(hash, listeners)
  schedule()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && waiting.get(hash) === listeners) waiting.delete(hash)
  }
}

/** For tests: forget every preview and every request. */
export const resetPreviews = (): void => {
  ready.clear()
  waiting.clear()
}
