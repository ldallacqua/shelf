'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Which rows of a grid are near the screen. The grid's own CSS decides how
 * many items fit on a row; this reads that, and how tall a row is, and works
 * out the first and last row worth having in the page. A thousand games then
 * cost no more to scroll than fifty.
 */
export type RowWindow = {
  /** Items per row, as the browser laid them out. */
  columns: number
  /** Height of one row, in pixels. */
  pitch: number
  /** How many rows the items fill in all. */
  rows: number
  /** First row in the page, and one past the last. */
  start: number
  end: number
}

const same = (a: RowWindow | undefined, b: RowWindow): boolean =>
  a !== undefined &&
  a.columns === b.columns &&
  a.pitch === b.pitch &&
  a.rows === b.rows &&
  a.start === b.start &&
  a.end === b.end

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** An ancestor that scrolls by itself (a shelf on a phone), if there is one. */
const scrollRootOf = (element: HTMLElement): HTMLElement | undefined => {
  const root = element.closest<HTMLElement>('[data-scroll-root]')
  if (!root) return undefined
  const overflow = getComputedStyle(root).overflowY
  return overflow === 'auto' || overflow === 'scroll' ? root : undefined
}

export function useRowWindow(
  ref: RefObject<HTMLElement | null>,
  itemCount: number,
  /** Rows kept ready above and below what is visible. */
  overscan = 2,
): RowWindow | undefined {
  const [rowWindow, setRowWindow] = useState<RowWindow>()
  const lastPitch = useRef(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    let frame = 0
    const measure = () => {
      frame = 0
      const style = getComputedStyle(element)
      const columns = Math.max(1, style.gridTemplateColumns.split(' ').filter(Boolean).length)

      // A shelf states its row height. A wall's rows follow its covers, so one is measured.
      let pitch = Number.parseFloat(style.gridAutoRows)
      if (!Number.isFinite(pitch) || pitch <= 0) {
        const cell = element.querySelector<HTMLElement>('[data-cell]')
        pitch = cell
          ? cell.getBoundingClientRect().height + (Number.parseFloat(style.rowGap) || 0)
          : lastPitch.current
      }
      if (!pitch) return
      lastPitch.current = pitch

      const rows = Math.ceil(itemCount / columns)
      const box = element.getBoundingClientRect()
      const root = scrollRootOf(element)?.getBoundingClientRect()
      const top = Math.max(0, root?.top ?? 0)
      const bottom = Math.min(window.innerHeight, root?.bottom ?? window.innerHeight)

      let start = clamp(Math.floor((top - box.top) / pitch) - overscan, 0, rows)
      let end = clamp(Math.ceil((bottom - box.top) / pitch) + overscan, start, rows)

      // A shelf more than a screen away sideways (another shelf on a phone) keeps one row ready.
      const sideways = box.right < -window.innerWidth || box.left > window.innerWidth * 2
      if (sideways) {
        start = 0
        end = Math.min(rows, 1)
      }

      const next = { columns, pitch, rows, start, end }
      setRowWindow((current) => (same(current, next) ? current : next))
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }

    schedule()
    const observer = new ResizeObserver(schedule)
    observer.observe(element)
    // Scrolling does not bubble, but it can be caught on its way down: one
    // listener hears the page and every shelf that scrolls by itself.
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
    }
  }, [ref, itemCount, overscan])

  return rowWindow
}
