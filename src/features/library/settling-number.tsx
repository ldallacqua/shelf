'use client'

import { useEffect, useRef } from 'react'

import { duration } from '@/ui/tokens/motion'

/**
 * A number that settles into place once, when first seen: the last stretch
 * of a count-up. The page arrives with the final number already in it, so
 * nothing is wrong before, without, or instead of the animation; with
 * reduced motion it does not run.
 *
 * Counting up from a figure already on screen would first take it back
 * down, so it waits unseen for the page to come alive (`data-settle` in
 * shelf.css). If the page is slow to, the figure simply appears, and stays
 * as it is when the page does come alive.
 *
 * The figures are written straight into the page, one frame at a time. Asking
 * React to draw each of them again was fifty redraws in the second a slow
 * phone can least spare. It is decoration: the true figure is read out by
 * the text beside it.
 */
export function SettlingNumber({
  value,
  text,
  locale,
  className = 'title text-base text-text tabular-nums sm:text-lg',
}: {
  value: number
  /** The final figure, as the page arrived with it. */
  text: string
  locale: string
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const unseen = getComputedStyle(element).visibility === 'hidden'
    const from = Math.round(value * 0.85)
    const counts =
      unseen && from !== value && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const format = new Intl.NumberFormat(locale)
    // It starts low, then shows: never the final figure first.
    if (counts) element.textContent = format.format(from)
    element.dataset.counted = ''
    if (!counts) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration.cinematic)
      // Ease out: quick at first, slowing into the final figure.
      const eased = 1 - (1 - progress) ** 3
      element.textContent =
        progress < 1 ? format.format(Math.round(from + (value - from) * eased)) : text
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      element.textContent = text
    }
    // Once, for the number the page arrived with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <span ref={ref} aria-hidden="true" data-settle="" className={className}>
      {text}
    </span>
  )
}
