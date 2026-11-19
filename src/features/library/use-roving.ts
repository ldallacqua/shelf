'use client'

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react'

import { foldedAway } from './fold-toggle'
import { revealRow } from './use-row-window'

const indexOf = (target: EventTarget | null): number | undefined => {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-index]') : null
  return element ? Number(element.dataset.index) : undefined
}

/**
 * The shelf before or after this one that shows its games (not folded away), its Tab stop
 * focused. When that game isn't drawn yet, its grid takes focus first, before anything scrolls:
 * the game focused now may leave the page as it does, and focus with it. The grid then draws its
 * stop and hands focus on (`onFocus` below).
 */
const leaveShelf = (grid: HTMLElement, direction: -1 | 1) => {
  const grids = [...document.querySelectorAll<HTMLElement>('[data-roving]')].filter(
    (each) => !foldedAway(each),
  )
  const next = grids[grids.indexOf(grid) + direction]
  if (!next) return
  const box = next.querySelector<HTMLElement>('[data-index][tabindex="0"]')
  if (box) return box.focus()
  next.focus({ preventScroll: true })
}

/**
 * One Tab stop per shelf, as the shelf view's boxes have (`shelf-grid.tsx`), for the wall, the
 * banners and the list, whose rows are windowed (`useRowWindow`): arrows move between games,
 * Home and End go to the shelf's ends, Page Up and Page Down to the shelf before or after. A game
 * whose row is not in the page is scrolled to, and focused once it is drawn. Every game was a
 * stop, so the same library took 50 Tabs in one view and over 400 in another (step 10's review,
 * 01, finding 20).
 *
 * A shelf far from the screen has no row drawn, so no game to stop at: its grid is the stop
 * then, and taking focus it draws the game and hands focus to it. Without that, Tab went from
 * the first shelf to the footer on a phone (finding 28).
 *
 * The grid carries `data-roving`, `tabIndex` (`gridTabIndex`) and `onFocus`; each game's control
 * `data-index` and `onKeyDown`.
 */
export function useRovingShelf(
  ref: RefObject<HTMLElement | null>,
  count: number,
  /** Games on a row: arrows up and down move by a row. */
  columns = 1,
) {
  const [stop, setStop] = useState(0)
  const focusNext = useRef<number | undefined>(undefined)
  /** Set when the grid's top was scrolled to, no row being drawn to measure the game's row by. */
  const roughly = useRef(false)

  // A game asked for before it was drawn takes focus as soon as it is. Scrolled roughly, the
  // grid is asked again once a row is drawn to measure by.
  useEffect(() => {
    const want = focusNext.current
    const grid = ref.current
    if (want === undefined || !grid) return
    const target = grid.querySelector<HTMLElement>(`[data-index="${want}"]`)
    if (target) {
      focusNext.current = undefined
      roughly.current = false
      target.focus()
    } else if (roughly.current && grid.querySelector('[data-cell]')) {
      roughly.current = !revealRow(grid, want)
    }
  })

  const move = (to: number) => {
    if (count === 0) return
    const target = Math.min(count - 1, Math.max(0, to))
    setStop(target)
    const grid = ref.current
    const drawn = grid?.querySelector<HTMLElement>(`[data-index="${target}"]`)
    if (drawn) {
      focusNext.current = undefined
      drawn.focus()
      return
    }
    focusNext.current = target
    if (grid) roughly.current = !revealRow(grid, target)
  }

  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const at = indexOf(event.target)
    if (at === undefined || event.altKey || event.ctrlKey || event.metaKey) return
    const keys: Record<string, () => void> = {
      ArrowRight: () => move(at + 1),
      ArrowLeft: () => move(at - 1),
      ArrowDown: () => at + columns < count && move(at + columns),
      ArrowUp: () => at - columns >= 0 && move(at - columns),
      Home: () => move(0),
      End: () => move(count - 1),
      PageDown: () => ref.current && leaveShelf(ref.current, 1),
      PageUp: () => ref.current && leaveShelf(ref.current, -1),
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }
  // One handler for every game, the same from one drawing to the next, so a game that did not
  // change is not drawn again: it reads the shelf as it is now.
  const latest = useRef(onKey)
  useEffect(() => {
    latest.current = onKey
  })
  const [onKeyDown] = useState(() => (event: KeyboardEvent<HTMLElement>) => latest.current(event))

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const grid = event.currentTarget
    if (event.target === grid) {
      // The grid itself: its stop isn't drawn. Draw it, and hand focus on: after the browser has
      // scrolled to what took focus, the middle of a tall grid, which would undo this.
      requestAnimationFrame(() => {
        if (document.activeElement === grid) move(stop)
      })
      return
    }
    const at = indexOf(event.target)
    if (at !== undefined) setStop(at)
  }

  /**
   * Where Tab stops among the games drawn, `from` to `to`: the last one focused, or, while its
   * row is out of the page, the first drawn, so a shelf always has a stop.
   */
  const tabStop = (from: number, to: number) => (stop >= from && stop < to ? stop : from)

  /** The grid is the shelf's stop while none of its games is drawn; focusable by script always. */
  const gridTabIndex = (from: number, to: number) => (to > from ? -1 : 0)

  return { onKeyDown, onFocus, tabStop, gridTabIndex }
}
