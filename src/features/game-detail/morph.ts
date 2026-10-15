import { flushSync } from 'react-dom'

/**
 * The cover growing from the shelf into the open game, and back into the
 * shelf when it closes (spec 7.2), with the browser's view transitions.
 *
 * The two ends are named for the one transition and unnamed after it: a
 * name left on a box would make every later transition capture it, and the
 * box stays on the shelf behind the game, so the same name would be in the
 * page twice. React's `<ViewTransition>` pairs names by one end leaving and
 * the other arriving, which this is not.
 *
 * Without the browser's support, or under reduced motion, the change simply
 * happens and the panel crossfades in on its own (spec 7.2's calm version).
 */

const COVER = 'game-cover'
const PANEL = 'game-panel'

type Ends = {
  /** The cover the transition starts from, in the page as it is. */
  from: () => HTMLElement | null | undefined
  /** The cover it lands on, once the change is drawn. */
  to: () => HTMLElement | null | undefined
  /** The panel the game is in, which slides in or out under the cover. */
  panel: () => HTMLElement | null | undefined
}

const canMorph = (): boolean =>
  typeof document !== 'undefined' &&
  'startViewTransition' in document &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

const name = (element: HTMLElement | null | undefined, value: string) => {
  if (element) element.style.viewTransitionName = value
}

let running: ViewTransition | undefined

// Back or Forward while the cover is still flying: it lands at once, before
// anything else hears of the move. WebKit's page crashed when history moved
// under a running transition and the page then changed.
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => running?.skipTransition(), { capture: true })
}

/** Draws `change` at once, with the cover carried across it when it can be. */
export function morph(ends: Ends, change: () => void): void {
  // A second change before the first has landed waits for it to land.
  if (running) {
    const first = running
    void first.finished.finally(() => morph(ends, change))
    return
  }
  const source = canMorph() ? ends.from() : undefined
  if (!source) {
    change()
    return
  }

  const root = document.documentElement
  name(source, COVER)
  name(ends.panel(), PANEL)
  root.dataset.morph = ''

  const transition = document.startViewTransition(() => {
    name(source, '')
    name(ends.panel(), '')
    flushSync(change)
    const target = ends.to()
    name(target, COVER)
    name(ends.panel(), PANEL)
    // The cover is in flight: it is not also left behind where it started.
    if (source !== target) source.style.visibility = 'hidden'
  })
  running = transition
  // A transition cut short by the next one rejects these; nothing is wrong.
  transition.ready.catch(() => undefined)
  transition.updateCallbackDone.catch(() => undefined)
  const done = () => {
    name(ends.to(), '')
    name(ends.panel(), '')
    name(source, '')
    source.style.visibility = ''
    if (running === transition) {
      running = undefined
      delete root.dataset.morph
    }
  }
  transition.finished.then(done, done)
}
