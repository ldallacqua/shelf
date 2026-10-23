import { useEffect, useRef, type RefObject } from 'react'

/** How long a finger rests on the ledge before sliding scrubs instead of scrolling. */
const PRESS_MS = 250
/** How far a finger may wander while it rests. */
const STILL = 8

type ScrubOptions = {
  /** Only on the compact shelf, where spines are narrow. */
  enabled: boolean
  /** The title shown above the finger for the box at this position. */
  titleOf: (index: number) => string | undefined
  /** The box under the finger, which tips out; nothing once the finger lifts. */
  onHot: (index: number | undefined) => void
  /** The box the finger lifted from. */
  onPick: (index: number) => void
}

/**
 * Scrubbing along a ledge (spec 3.4): press, wait a moment, and slide. Each
 * spine tips out as the finger passes, with its title shown above it, and
 * lifting opens the one under the finger. This is how a narrow spine is
 * chosen precisely; a tap still opens a game, and a quick slide still scrolls.
 *
 * The title is written straight into `label`, and only a new box under the
 * finger asks React to draw anything.
 */
export function useScrub(
  list: RefObject<HTMLElement | null>,
  label: RefObject<HTMLElement | null>,
  { enabled, titleOf, onHot, onPick }: ScrubOptions,
) {
  const latest = useRef({ titleOf, onHot, onPick })
  useEffect(() => {
    latest.current = { titleOf, onHot, onPick }
  })

  useEffect(() => {
    const element = list.current
    if (!enabled || !element) return
    let timer = 0
    let start: { x: number; y: number } | undefined
    let scrubbing = false
    let at: number | undefined

    const indexAt = (x: number, y: number): number | undefined => {
      const box = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-index]')
      return box && element.contains(box) ? Number(box.dataset.index) : undefined
    }

    const follow = (x: number, y: number) => {
      const index = indexAt(x, y)
      if (index !== at) {
        at = index
        latest.current.onHot(index)
      }
      const shown = label.current
      if (!shown) return
      const title = index === undefined ? undefined : latest.current.titleOf(index)
      shown.hidden = !title
      if (!title) return
      shown.textContent = title
      shown.style.left = `${x}px`
      shown.style.top = `${y}px`
    }

    const stop = () => {
      window.clearTimeout(timer)
      start = undefined
      if (!scrubbing) return
      scrubbing = false
      at = undefined
      element.removeAttribute('data-scrubbing')
      if (label.current) label.current.hidden = true
      latest.current.onHot(undefined)
    }

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (event.touches.length !== 1 || !touch) return stop()
      start = { x: touch.clientX, y: touch.clientY }
      timer = window.setTimeout(() => {
        if (!start) return
        scrubbing = true
        element.setAttribute('data-scrubbing', '')
        follow(start.x, start.y)
      }, PRESS_MS)
    }

    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (!start || !touch) return
      if (scrubbing) {
        // The finger is choosing, not scrolling the page or the shelves.
        event.preventDefault()
        follow(touch.clientX, touch.clientY)
      } else if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > STILL) {
        // A slide before the press settled: the page scrolls, as it would.
        window.clearTimeout(timer)
        start = undefined
      }
    }

    const onEnd = (event: TouchEvent) => {
      if (!scrubbing) return stop()
      // The lift opens the game itself; no click should follow it.
      event.preventDefault()
      const picked = at
      stop()
      if (picked !== undefined) latest.current.onPick(picked)
    }

    // A long press must not open the browser's own menu while scrubbing.
    const onMenu = (event: Event) => {
      if (scrubbing) event.preventDefault()
    }

    element.addEventListener('touchstart', onStart, { passive: true })
    element.addEventListener('touchmove', onMove, { passive: false })
    element.addEventListener('touchend', onEnd, { passive: false })
    element.addEventListener('touchcancel', stop)
    element.addEventListener('contextmenu', onMenu)
    return () => {
      stop()
      element.removeEventListener('touchstart', onStart)
      element.removeEventListener('touchmove', onMove)
      element.removeEventListener('touchend', onEnd)
      element.removeEventListener('touchcancel', stop)
      element.removeEventListener('contextmenu', onMenu)
    }
  }, [enabled, list, label])
}
