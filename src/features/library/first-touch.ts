/**
 * Whether anyone has done anything on the page yet: a tap or click, a key, a
 * wheel, a scroll, or focus moving.
 *
 * On a phone the shelves stand side by side and one is in view. The ones
 * beside it wait for this before they fill themselves: filling them as the
 * library arrived was more than half of what a mid-range phone did at that
 * moment, for shelves that may never be looked at. A swipe starts with a
 * touch, so the shelf it brings in fills while it slides.
 *
 * A plain flag, like `pageIsLive`: what changes when it flips is told so
 * through `whenTouched`, and nothing else is drawn again.
 */
let touched = false
const waiting = new Set<() => void>()

const EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'focusin'] as const
// Capturing hears scrolls, which do not bubble, and every event before anything can stop it.
const LISTEN = { capture: true, passive: true } as const

const touch = () => {
  touched = true
  stopListening()
  const listeners = [...waiting]
  waiting.clear()
  for (const listener of listeners) listener()
}

let listening = false

const startListening = () => {
  if (listening) return
  listening = true
  for (const type of EVENTS) window.addEventListener(type, touch, LISTEN)
}

const stopListening = () => {
  if (!listening) return
  listening = false
  for (const type of EVENTS) window.removeEventListener(type, touch, LISTEN)
}

// Listened for from the start, so a touch is known about even before any shelf waits for one.
if (typeof window !== 'undefined') startListening()

export const pageTouched = (): boolean => touched

/**
 * Calls `listener` once, the first time the page is touched. Returns a
 * function that cancels it. Does nothing once the page has been touched: ask
 * `pageTouched` first.
 */
export const whenTouched = (listener: () => void): (() => void) => {
  if (touched) return () => undefined
  waiting.add(listener)
  return () => {
    waiting.delete(listener)
  }
}

/** For tests: back to a page nobody has touched. */
export const resetTouch = (): void => {
  touched = false
  waiting.clear()
  startListening()
}
