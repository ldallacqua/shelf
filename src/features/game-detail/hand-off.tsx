'use client'

import { useParams } from 'next/navigation'
import {
  Activity,
  useLayoutEffect,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react'

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
const landed = new Set<(drawn: boolean) => void>()

/** The library is opening this game: its page is drawn from this until the page's own arrives. */
export const handOff = (handOff: HandOff): void => {
  latest = handOff
}

/** The game handed off from the library, if it is this one. */
export const handedOff = (handle: string | undefined, slug: string | undefined) =>
  latest && latest.handle === handle && latest.slug === slug ? latest.page : undefined

/**
 * Whether a game's page is drawn, handed off or its own, within `ms`: what
 * the cover's flight waits for before it takes the page's new picture.
 */
export const pageDrawn = (ms: number): Promise<boolean> =>
  new Promise((resolve) => {
    const done = (drawn: boolean) => {
      landed.delete(done)
      clearTimeout(timer)
      resolve(drawn)
    }
    const timer = setTimeout(() => done(false), ms)
    landed.add(done)
  })

/**
 * Tells whatever waits for the page that it is drawn: as it is put in the
 * document, since a transition holding the old picture holds the frames
 * that a later effect would wait for.
 */
function useLanded(): void {
  useLayoutEffect(() => {
    for (const done of [...landed]) done(true)
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

/*
 * A game opened beside another, from the list or its steps (ADR 009, phase 2),
 * that the router has not drawn. The router draws a game's page at once only
 * while it knows the frame of one, and it forgets it: five minutes after it
 * learned it (Next.js's `staleTimes.static`, which nothing renews early), and
 * whenever a server action changes the library. Then it asks the server for
 * the whole page and holds the one it leaves until that comes, one to four
 * seconds. So the layout around the games draws the handed-off page itself
 * when the router hasn't within `SOON_MS`, over the page being left, until the
 * router lands anywhere.
 */

/** How long the router has to draw the game before the layout does: well inside the cover's 300 ms. */
export const SOON_MS = 100

let waiting: HandOff | undefined
let arriving: HandOff | undefined
const arrivals = new Set<() => void>()

const told = () => {
  for (const listener of [...arrivals]) listener()
}

const listen = (listener: () => void) => {
  arrivals.add(listener)
  return () => {
    arrivals.delete(listener)
  }
}

/** This game is no longer on its way: the router landed, went elsewhere, or history moved. */
const arrived = (handOff: HandOff | undefined = arriving) => {
  if (waiting === handOff) waiting = undefined
  if (!handOff || arriving !== handOff) return
  arriving = undefined
  told()
}

// Back or Forward while a game is on its way: history decides what is shown, not the click.
if (typeof window !== 'undefined') {
  const moved = () => {
    waiting = undefined
    arrived()
  }
  window.addEventListener('popstate', moved, { capture: true })
}

/**
 * The list is opening this game beside the one shown: called as the router is
 * asked for it. If no page is drawn within `SOON_MS`, `Arriving` draws this one.
 */
export const arriveSoon = (handOff: HandOff): void => {
  waiting = handOff
  void pageDrawn(SOON_MS).then((drawn) => {
    if (drawn || waiting !== handOff) return
    arriving = handOff
    told()
  })
}

/** The game the layout is drawing while the router fetches it, if it is on this shelf. */
export const useArriving = (handle: string | undefined): string | undefined =>
  useSyncExternalStore(
    listen,
    () => (arriving && arriving.handle === handle ? arriving.slug : undefined),
    () => undefined,
  )

/**
 * Around every game's page on a shelf, in the layout the list stands in: the
 * page the router shows, or, while it waits for the server, the game being
 * opened, drawn from the hand-off. The page being left is kept as it was,
 * hidden, as the router keeps a page left behind, and comes back if Back
 * cancels the move. It reads no address until a game is on its way, so the
 * layout is built ahead whole.
 */
export function Arriving({ children }: { children: ReactNode }) {
  const shown = useSyncExternalStore(
    listen,
    () => arriving,
    () => undefined,
  )
  return (
    <>
      {shown ? <OnItsWay key={shown.slug} handOff={shown} /> : null}
      <Activity mode={shown ? 'hidden' : 'visible'}>{children}</Activity>
    </>
  )
}

/** The game on its way, until the router shows any page here: this game's, or another. */
function OnItsWay({ handOff }: { handOff: HandOff }) {
  const params = useParams<{ handle?: string; slug?: string }>()
  const handle = decoded(params.handle)
  const slug = decoded(params.slug)

  // Before the screen is painted, so the page the router lands on is never hidden for a frame.
  // Leaving the games hides this layout, which ends the wait too.
  useLayoutEffect(() => {
    if (slug === handOff.slug) arrived(handOff)
    return () => arrived(handOff)
  }, [handle, slug, handOff])

  // The router puts a new page's top in view as it lands; the drawing stands in for it.
  useLayoutEffect(() => {
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }, [])

  return handOff.page
}
