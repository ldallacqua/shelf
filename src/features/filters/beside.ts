'use client'

import { useSyncExternalStore } from 'react'

/**
 * Where the filters stand in a column of their own beside the library, rather than in a sheet
 * (issue #62). The column and its gap take 20.5rem; from 96rem the library keeps about 70rem
 * beside it, as much as a 1200-pixel laptop gives it today, and the page itself widens there
 * (`--page-width` in `globals.css`), so a 1080p screen shows more of the shelf than before, not
 * less. Narrower, the sheet stays. The `filters-beside` variant in `globals.css` is the same
 * query, for the styles.
 */
export const FILTERS_BESIDE = '(width >= 96rem)'

const subscribe = (listener: () => void) => {
  const query = window.matchMedia(FILTERS_BESIDE)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

/**
 * Whether the filters stand beside the library now. Undefined until the page comes alive: the
 * server cannot tell, and the column holds ghosts until it is known.
 */
export function useFiltersBeside(): boolean | undefined {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(FILTERS_BESIDE).matches,
    () => undefined,
  )
}
