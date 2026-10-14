'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'

import type { Anchor, FallbackReason, Shelf3DHandle } from '@/features/shelf-3d/shelf-3d'

import type { Density, Dimension } from './preferences'
import { ShelfView } from './shelf-view'
import type { ViewProps } from './view-props'

/**
 * The 3D shelf is its own bundle, fetched the first time 3D opens (spec 3.6).
 * The library page's first load never contains three.js; a build check
 * fails if it does.
 */
const Shelf3D = dynamic(() => import('@/features/shelf-3d/shelf-3d'), { ssr: false })

/** The crossfade between the two views, and the whole switch under reduced motion (spec 3.6). */
const FADE_MS = 200

/**
 * Where the switch is:
 * `2d` and `3d` are at rest; `loading` has the 3D shelf being made behind
 * the 2D one; `entering` fades it in; `leaving` has the 2D shelf back
 * underneath while the 3D one flattens, and `fading` while it fades away.
 */
type Phase = '2d' | 'loading' | 'entering' | '3d' | 'leaving' | 'fading'

type ShelfStageProps = ViewProps & {
  density: Density
  /** What this device chose, or its default. */
  dimension: Dimension
  /** Set once 3D has given way to 2D on this page, and why. */
  fallback?: FallbackReason
  onFallback: (reason: FallbackReason) => void
  /** The game to keep in place going into 3D, taken from the 2D shelf as the switch was asked for. */
  anchor?: Anchor
  /** What the page can ask of the 3D shelf, such as where it is. */
  handleRef: { current: Shelf3DHandle | undefined }
}

/** The game to keep in place from the 2D shelf: the focused one, or the one nearest the middle of the window. */
export const anchorIn2d = (root: HTMLElement | null): Anchor | undefined => {
  if (!root) return undefined
  const focused = document.activeElement?.closest<HTMLElement>('.game-box[data-flip]')
  if (focused && root.contains(focused)) return { key: focused.dataset.flip!, focus: true }
  const middle = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  let best: { key: string; distance: number } | undefined
  for (const box of root.querySelectorAll<HTMLElement>('.game-box[data-flip]')) {
    const rect = box.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue
    const distance = Math.hypot(
      rect.left + rect.width / 2 - middle.x,
      rect.top + rect.height / 2 - middle.y,
    )
    if (!best || distance < best.distance) best = { key: box.dataset.flip!, distance }
  }
  return best ? { key: best.key, focus: false } : undefined
}

/**
 * The shelf, in 2D or 3D. The server always draws 2D, so the first paint is
 * the same for everyone; 3D takes over once its first frame is drawn. The
 * game in focus, or the one nearest the middle, stays on screen across the
 * switch, and nothing else about the library changes: filters, grouping,
 * the open game and the address are untouched.
 */
export function ShelfStage({
  dimension,
  fallback,
  onFallback,
  anchor,
  handleRef,
  density,
  ...view
}: ShelfStageProps) {
  const want3d = dimension === '3d' && fallback === undefined
  const [phase, setPhase] = useState<Phase>('2d')
  // Which way the phase last answered. The server draws 2D, so it starts there.
  const [answered, setAnswered] = useState(false)
  const scope = useRef<HTMLDivElement>(null)
  /** Where focus or the eye should land in 2D after leaving 3D. */
  const back = useRef<Anchor | undefined>(undefined)

  if (answered !== want3d) {
    setAnswered(want3d)
    if (want3d) {
      // Asked for 3D: made behind the 2D shelf. Asked again while leaving: it stays.
      if (phase === '2d') setPhase('loading')
      else if (phase === 'leaving' || phase === 'fading') setPhase('entering')
    } else if (fallback || phase === 'loading' || phase === 'entering') {
      // 3D gave way, or 2D was asked for before 3D was ever shown: straight back.
      setPhase('2d')
    } else if (phase === '3d') {
      // Asked for 2D: the wall flattens, fades, and the anchor is found in 2D.
      setPhase('leaving')
    }
  }

  useEffect(() => {
    if (phase !== 'leaving') return
    let cancelled = false
    const handle = handleRef.current
    back.current = handle?.anchor()
    void (handle?.leave() ?? Promise.resolve()).then(() => {
      if (!cancelled) setPhase('fading')
    })
    return () => {
      cancelled = true
      // Asked for 3D again before it was gone: the wall stands out again.
      if (want3d) handle?.stay()
    }
  }, [phase, want3d, handleRef])

  useEffect(() => {
    if (phase !== 'fading') return
    const timer = setTimeout(() => setPhase('2d'), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // Faded in: the 2D shelf can go.
  useEffect(() => {
    if (phase !== 'entering') return
    const timer = setTimeout(() => setPhase('3d'), FADE_MS)
    return () => clearTimeout(timer)
  }, [phase])

  // Back in 2D: the anchor in view, and in focus if it had focus.
  useEffect(() => {
    if (phase !== '2d' || !back.current) return
    const target = back.current
    back.current = undefined
    let tries = 0
    let frame = 0
    const land = () => {
      const box = scope.current?.querySelector<HTMLElement>(
        `.game-box[data-flip="${CSS.escape(target.key)}"]`,
      )
      if (box) {
        box.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        if (target.focus) box.focus({ preventScroll: true })
        return
      }
      // A box far down the shelf is not in the page until its row is near the screen.
      const shelf = view.shelves.findIndex((each) =>
        each.items.some(
          (item) =>
            (item.copy ? `${item.game.slug}:${item.copy.platform}` : item.game.slug) === target.key,
        ),
      )
      const section = scope.current?.querySelectorAll<HTMLElement>('.shelf-panel')[shelf]
      section?.scrollIntoView({ block: 'start', behavior: 'instant' })
      if ((tries += 1) < 6) frame = requestAnimationFrame(land)
    }
    frame = requestAnimationFrame(land)
    return () => cancelAnimationFrame(frame)
  }, [phase, view.shelves])

  const show2d = phase !== '3d'
  const show3d = phase !== '2d'
  // The 3D shelf lies over the 2D one while either is coming or going.
  const over = phase !== '2d' && phase !== '3d'
  const visible = phase === 'entering' || phase === '3d' || phase === 'leaving'

  return (
    <div ref={scope} className="relative">
      {show2d ? (
        <div inert={phase === 'entering' || phase === 'leaving' || undefined}>
          <ShelfView {...view} density={density} />
        </div>
      ) : null}
      {show3d ? (
        <div
          className={over ? 'absolute inset-x-0 top-0 z-10' : undefined}
          style={{
            opacity: visible ? 1 : 0,
            transition: `opacity ${FADE_MS}ms var(--ease-settle)`,
            pointerEvents: visible ? undefined : 'none',
          }}
          inert={phase !== '3d' || undefined}
          data-shelf-phase={phase}
        >
          <Shelf3D
            shelves={view.shelves}
            platforms={view.platforms}
            density={density}
            open={view.open}
            onOpen={view.onOpen}
            anchor={anchor}
            handleRef={handleRef}
            interactive={phase === '3d'}
            onLive={() => setPhase((now) => (now === 'loading' ? 'entering' : now))}
            onFallback={onFallback}
          />
        </div>
      ) : null}
    </div>
  )
}
