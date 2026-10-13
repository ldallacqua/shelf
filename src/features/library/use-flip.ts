'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'

import { duration, ease } from '@/ui/tokens/motion'

/**
 * Animates boxes from where they stood to where they stand now, after a
 * regroup or a change of view (spec 6: "the reorder is animated").
 *
 * Call the returned function just before the change, to note where each box
 * is. After the change is drawn, every box still on screen slides from its
 * old place to its new one: it lifts a little, travels, and settles. Boxes
 * that were not on screen simply appear. Nothing here runs when motion is
 * not welcome; the views crossfade instead.
 */

type Place = { left: number; top: number }

const curve = (points: readonly number[]): string => `cubic-bezier(${points.join(', ')})`

const onScreen = (rect: DOMRect): boolean =>
  rect.bottom > 0 &&
  rect.top < window.innerHeight &&
  rect.right > 0 &&
  rect.left < window.innerWidth

/** At most this many boxes move; a screen rarely holds more, and more is a blur. */
const MOST = 90

export function useFlip(scope: RefObject<HTMLElement | null>, trigger: unknown): () => void {
  const before = useRef<Map<string, Place> | undefined>(undefined)

  useLayoutEffect(() => {
    const places = before.current
    before.current = undefined
    const root = scope.current
    if (!places || !root) return

    let moved = 0
    for (const element of root.querySelectorAll<HTMLElement>('[data-flip]')) {
      if (moved >= MOST) break
      const from = places.get(element.dataset.flip ?? '')
      const rect = element.getBoundingClientRect()
      if (!onScreen(rect)) continue
      const delay = Math.min(moved, 24) * 10
      moved += 1

      if (!from) {
        element.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: duration.base,
          delay,
          easing: curve(ease.settle),
          fill: 'backwards',
        })
        continue
      }

      const dx = from.left - rect.left
      const dy = from.top - rect.top
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
      element.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)` },
          { transform: `translate(${dx / 2}px, ${dy / 2 - 8}px) scale(1.03)`, offset: 0.5 },
          { transform: 'none' },
        ],
        { duration: duration.slow, delay, easing: curve(ease.glide), fill: 'backwards' },
      )
    }
  }, [scope, trigger])

  return () => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const places = new Map<string, Place>()
    for (const element of scope.current?.querySelectorAll<HTMLElement>('[data-flip]') ?? []) {
      const key = element.dataset.flip
      if (!key || places.has(key)) continue
      const rect = element.getBoundingClientRect()
      if (onScreen(rect)) places.set(key, { left: rect.left, top: rect.top })
    }
    before.current = places
  }
}
