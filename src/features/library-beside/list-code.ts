'use client'

import type * as LibraryList from './library-list'

/**
 * The list's code, fetched apart from the game's page: only a window wide
 * enough for the list, or a game opened from the library, needs it. The
 * library asks for it as a game is reached for, with the drawn page's
 * (`library-view.tsx`), so a game opened from the shelf has its list at once.
 */

let loading: Promise<typeof LibraryList> | undefined
let loaded: typeof LibraryList | undefined

export const loadList = (): Promise<typeof LibraryList> =>
  (loading ??= import('./library-list').then(
    (module) => (loaded = module),
    (error: unknown) => {
      // A failed fetch is forgotten, so the next reach for a game tries again.
      loading = undefined
      throw error
    },
  ))

/** The list's code, if it is already here: then the list is drawn in the same frame. */
export const listCode = (): typeof LibraryList | undefined => loaded
