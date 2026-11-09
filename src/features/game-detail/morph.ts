import { HERO_COVER } from './hero'
import { pageDrawn } from './hand-off'

/**
 * The cover growing from the shelf into the game's page (spec 7.2), with the
 * browser's view transitions. It does not fly back on Back: WebKit's page
 * crashed under that flight (architecture, section 25).
 *
 * The two ends are named for the one transition and unnamed after it: a
 * name left on a box would make every later transition capture it. React's
 * `<ViewTransition>` would pair a name on every box of the shelf with the
 * page's, and the browser would take a picture of each.
 *
 * The page is a move between routes, which the router makes in its own
 * time: the transition holds the shelf's picture until the game's page is
 * drawn (`hand-off.tsx`), which is at once when the router knows the page's
 * frame. A page later than `WAIT_MS` gets no flight: the cover would fly
 * toward a page that isn't there yet. Without the browser's support, or under
 * reduced motion, the page simply changes.
 */

const COVER = 'game-cover'
/** The longest the shelf's picture is held for the page: past it, the page just comes when it comes. */
const WAIT_MS = 300

const canMorph = (): boolean =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const name = (element: HTMLElement | null | undefined, value: string) => {
  if (element) element.style.viewTransitionName = value
}

/**
 * The cover on the game's page now shown: a page visited and left stays in
 * the document, hidden by the router (`display: none`), with a cover of its
 * own, and a transition can't land on what isn't drawn.
 */
const heroCover = (): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(`[${HERO_COVER}]`)].find(
    (cover) => !cover.closest('[style*="display: none"]'),
  )

let running: ViewTransition | undefined

// Back or Forward while the cover is still flying: it lands at once, before
// anything else hears of the move. WebKit's page crashed when history moved
// under a running transition and the page then changed.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => running?.skipTransition(), { capture: true })
}

/** Goes to the game's page, with the cover carried from `from` when it can be. */
export function morph(from: HTMLElement | undefined, go: () => void): void {
  if (running || !from || !canMorph()) {
    go()
    return
  }

  name(from, COVER)
  const transition = document.startViewTransition(async () => {
    name(from, '')
    const drawn = pageDrawn(WAIT_MS)
    go()
    if (await drawn) name(heroCover(), COVER)
    else transition.skipTransition()
  })
  running = transition
  // A transition cut short rejects these; nothing is wrong.
  transition.ready.catch(() => undefined)
  transition.updateCallbackDone.catch(() => undefined)
  const done = () => {
    name(heroCover(), '')
    name(from, '')
    running = undefined
  }
  transition.finished.then(done, done)
}
