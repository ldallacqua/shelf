import { useSyncExternalStore } from 'react'

const queries = ['(prefers-reduced-motion: reduce)', '(width < 40rem)', '(pointer: coarse)']
type Connection = EventTarget & { saveData?: boolean }
const connection = () => (navigator as Navigator & { connection?: Connection }).connection
const automatic = () =>
  !queries.some((query) => window.matchMedia(query).matches) && !connection()?.saveData
const subscribe = (listener: () => void) => {
  const media = queries.map((query) => window.matchMedia(query))
  for (const query of media) query.addEventListener('change', listener)
  connection()?.addEventListener('change', listener)
  return () => {
    for (const query of media) query.removeEventListener('change', listener)
    connection()?.removeEventListener('change', listener)
  }
}

/** The server assumes a calm device; a saved preference never overrides motion or data saving. */
export const useAllowsAutoplay = () => useSyncExternalStore(subscribe, automatic, () => false)
