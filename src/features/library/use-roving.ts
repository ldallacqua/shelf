'use client'

import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'

import { revealRow } from './use-row-window'

const indexOf = (target: EventTarget | null): number | undefined => {
  const element = target instanceof Element ? target.closest<HTMLElement>('[data-index]') : null
  return element ? Number(element.dataset.index) : undefined
}

/**
 * The shelf before or after this one that shows its games (not folded away), its Tab stop
 * focused: scrolled to first when none of its rows are in the page yet.
 */
const leaveShelf = (grid: HTMLElement, direction: -1 | 1) => {
  const grids = [...document.querySelectorAll<HTMLElement>('[data-roving]')].filter(
    (each) => !each.closest('[hidden]'),
  )
  const next = grids[grids.indexOf(grid) + direction]
  if (!next) return
  const stop = () => next.querySelector<HTMLElement>('[data-index][tabindex="0"]')
  const box = stop()
  if (box) return box.focus()
  next.scrollIntoView({ block: 'start', behavior: 'instant' })
  // Its rows are drawn once the window has measured the scroll.
  requestAnimationFrame(() => requestAnimationFrame(() => stop()?.focus()))
}

/**
 * One Tab stop per shelf, as the shelf view's boxes have (`shelf-grid.tsx`), for the wall, the
 * banners and the list, whose rows are windowed (`useRowWindow`): arrows move between games,
 * Home and End go to the shelf's ends, Page Up and Page Down to the shelf before or after. A game
 * whose row is not in the page is scrolled to, and focused once it is drawn. Every game was a
 * stop, so the same library took 50 Tabs in one view and over 400 in another (step 10's review,
 * 01, finding 20).
 *
 * The grid carries `data-roving` and `onFocus`; each game's control `data-index` and `onKeyDown`.
 */
export function useRovingShelf(
  ref: RefObject<HTMLElement | null>,
  count: number,
  /** Games on a row: arrows up and down move by a row. */
  columns = 1,
) {
  const [stop, setStop] = useState(0)
  const focusNext = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (focusNext.current === undefined) return
    const target = ref.current?.querySelector<HTMLElement>(`[data-index="${focusNext.current}"]`)
    if (target) {
      focusNext.current = undefined
      target.focus()
    }
  })

  const move = (to: number) => {
    const target = Math.min(count - 1, Math.max(0, to))
    focusNext.current = target
    setStop(target)
    const grid = ref.current
    if (grid && !grid.querySelector(`[data-index="${target}"]`)) revealRow(grid, target)
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

  const onFocus = (event: { target: EventTarget | null }) => {
    const at = indexOf(event.target)
    if (at !== undefined) setStop(at)
  }

  /**
   * Where Tab stops among the games drawn, `from` to `to`: the last one focused, or, while its
   * row is out of the page, the first drawn, so a shelf always has a stop.
   */
  const tabStop = (from: number, to: number) => (stop >= from && stop < to ? stop : from)

  return { onKeyDown, onFocus, tabStop }
}
