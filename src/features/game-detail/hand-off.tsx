'use client'

import { useParams } from 'next/navigation'
import { useLayoutEffect, type ReactElement, type ReactNode } from 'react'

/**
 * A game opened from the library, handed to its page (spec 7.2). The page is
 * built on the server, and a move to it waits for that; the library already
 * knows the game's cover, title, status and copies, so it hands the page over
 * drawn from those, and the page shows it at once in place of its ghosts
 * until the rest arrives. The cover grows into it (`morph.ts`), which needs
 * the cover to be there when the page changes.
 *
 * The drawn page is made by the library, whose code for it was fetched as a
 * game was reached for: the game's page itself carries none of it.
 */

type HandOff = {
  handle: string
  slug: string
  /** The game's page as the library can draw it, without what only the page knows. */
  page: ReactElement
}

let latest: HandOff | undefined
const landed = new Set<() => void>()

/** The library is opening this game: its page is drawn from this until the page's own arrives. */
export const handOff = (handOff: HandOff): void => {
  latest = handOff
}

/** The game handed off from the library, if it is this one. */
export const handedOff = (handle: string | undefined, slug: string | undefined) =>
  latest && latest.handle === handle && latest.slug === slug ? latest.page : undefined

/**
 * Resolves once a game's page is drawn, handed off or its own, or after `ms`
 * whatever happened: what the cover's flight waits for before it takes the
 * page's new picture.
 */
export const pageDrawn = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    const done = () => {
      landed.delete(done)
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(done, ms)
    landed.add(done)
  })

/**
 * Tells whatever waits for the page that it is drawn: as it is put in the
 * document, since a transition holding the old picture holds the frames
 * that a later effect would wait for.
 */
function useLanded(): void {
  useLayoutEffect(() => {
    for (const done of [...landed]) done()
  }, [])
}

/**
 * Stands in a game's page, the server's and the one handed off alike: the
 * router may show either first, and the cover lands on whichever it is.
 */
export function PageDrawn() {
  useLanded()
  return null
}

/** The address's slug: a segment may come encoded. */
const decoded = (value: string | string[] | undefined): string | undefined => {
  if (typeof value !== 'string') return undefined
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

/**
 * The game's page as the library handed it off, while the page's own is on
 * its way; anything else waits as `children`, its ghosts.
 */
export function FromLibrary({ children }: { children: ReactNode }) {
  const params = useParams<{ handle?: string; slug?: string }>()
  const page = handedOff(decoded(params.handle), decoded(params.slug))
  return page ?? children
}
