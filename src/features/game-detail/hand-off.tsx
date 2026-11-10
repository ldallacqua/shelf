'use client'

import { useParams } from 'next/navigation'
import {
  Activity,
  useEffect,
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
  /**
   * The same page with the library beside it, as the layout around a shelf's games draws it:
   * what a shelf's page draws in its place for a game the router is still fetching.
   */
  withList: ReactElement
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
 * A game opened on a shelf or the wall, or beside another from the list or its
 * steps (ADR 009), that the router has not drawn. The router draws a game's
 * page at once only while it knows the frame of one, and it forgets it: five
 * minutes after it learned it (Next.js's `staleTimes.static`, which nothing
 * renews early), and whenever a server action changes the library. Then it
 * asks the server for the whole page and holds the one it leaves until that
 * comes, one to four seconds. So the page it is opened from draws the
 * handed-off page itself when the router hasn't within `SOON_MS`, until the
 * router lands anywhere: the layout around the games, in place of the game
 * being left, or a shelf's page, in the shelf's place, with the list beside
 * it as the router would draw it.
 */

/** How long the router has to draw the game before the page left does: well inside the cover's 300 ms. */
export const SOON_MS = 100

/** Where a game on its way is drawn: in the layout around the games, or in a shelf's page. */
type Around = 'games' | 'shelf'

/**
 * A game drawn while the router fetches it: where, and how far down the window
 * stood as it was drawn.
 */
type Arrival = { handOff: HandOff; around: Around; scrolled: number }

let waiting: HandOff | undefined
let arriving: Arrival | undefined
/** How many layouts around the games are on screen: one while a game is, none on a shelf. */
let gamesShown = 0
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
const arrived = (handOff: HandOff | undefined = arriving?.handOff) => {
  if (waiting === handOff) waiting = undefined
  if (!handOff || arriving?.handOff !== handOff) return
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
 * A shelf or the list is opening this game: called as the router is asked for
 * it. If no page is drawn within `SOON_MS`, `Arriving` draws this one: around
 * the games while a game is on screen, else in the shelf's place.
 */
export const arriveSoon = (handOff: HandOff): void => {
  waiting = handOff
  void pageDrawn(SOON_MS).then((drawn) => {
    if (drawn || waiting !== handOff) return
    // Read while the page left still stands, before hiding it shortens the document.
    arriving = { handOff, around: gamesShown > 0 ? 'games' : 'shelf', scrolled: window.scrollY }
    told()
  })
}

/** The game drawn while the router fetches it, if it is on this shelf: the one the list marks. */
export const useArriving = (handle: string | undefined): string | undefined =>
  useSyncExternalStore(
    listen,
    () => (arriving && arriving.handOff.handle === handle ? arriving.handOff.slug : undefined),
    () => undefined,
  )

/**
 * Around the page a game is opened from: the page the router shows, or, while
 * it waits for the server, the game being opened, drawn from the hand-off. In
 * the layout around a shelf's games (`around="games"`, the default), that is
 * the page beside the list; around a shelf's page (`around="shelf"`), the page
 * with the list beside it, in the shelf's place, as the router would draw it.
 * The page being left is kept as it was, hidden, as the router keeps a page
 * left behind, and comes back if Back cancels the move. It reads no address
 * until a game is on its way, so the page around it is built ahead whole.
 */
export function Arriving({ around = 'games', children }: { around?: Around; children: ReactNode }) {
  const shown = useSyncExternalStore(
    listen,
    () => (arriving?.around === around ? arriving : undefined),
    () => undefined,
  )
  // A layout around the games that the router keeps hidden behind a shelf no longer counts.
  useLayoutEffect(() => {
    if (around !== 'games') return
    gamesShown += 1
    return () => {
      gamesShown -= 1
    }
  }, [around])

  let drawn: ReactNode = null
  if (shown?.around === 'games') drawn = <BesideTheList handOff={shown.handOff} />
  if (shown?.around === 'shelf') drawn = <InTheShelfsPlace handOff={shown.handOff} />
  return (
    <>
      {shown ? (
        // Drawn where the window stands rather than scrolled to: the browser records how far
        // down the page left was as the router puts the game's address up, which is where Back
        // finds it again. The router puts the game's top in view as it lands.
        <div key={shown.handOff.slug} style={{ marginTop: shown.scrolled }}>
          {drawn}
        </div>
      ) : null}
      <Activity mode={shown ? 'hidden' : 'visible'}>{children}</Activity>
    </>
  )
}

/** The game on its way beside the list, until the router shows any page here: this game's, or another. */
function BesideTheList({ handOff }: { handOff: HandOff }) {
  const params = useParams<{ handle?: string; slug?: string }>()
  const handle = decoded(params.handle)
  const slug = decoded(params.slug)

  // Before the screen is painted, so the page the router lands on is never hidden for a frame.
  // Leaving the games hides this layout, which ends the wait too.
  useLayoutEffect(() => {
    if (slug === handOff.slug) arrived(handOff)
    return () => arrived(handOff)
  }, [handle, slug, handOff])

  useOnItsWay(handOff)
  return handOff.page
}

/**
 * The game on its way in a shelf's place, until the router shows any page:
 * it hides the shelf's page as it lands, which ends the wait.
 */
function InTheShelfsPlace({ handOff }: { handOff: HandOff }) {
  useLayoutEffect(() => () => arrived(handOff), [handOff])
  useOnItsWay(handOff)
  return handOff.withList
}

/** Whether a link leads to the game on its way: following it changes nothing. */
const leadsTo = (link: HTMLAnchorElement, { handle, slug }: HandOff) =>
  link.pathname.endsWith(`/u/${encodeURIComponent(handle)}/game/${encodeURIComponent(slug)}`)

/** What a game drawn on its way does, wherever it stands. */
function useOnItsWay(handOff: HandOff) {
  // A link followed meanwhile goes where it leads, as it would from the page left: the router
  // drops the game's move, and may land on the very page left, which would not end the wait.
  // After React's own listener, so a link Next.js took is known by its prevented default.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // The click handed off another game, from the list beside this one: that one is on its way.
      if (latest !== handOff) return
      if (!event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self')) return
      if (link.origin !== location.origin || leadsTo(link, handOff)) return
      arrived(handOff)
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [handOff])
}
