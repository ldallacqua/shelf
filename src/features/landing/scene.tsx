'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A scene that plays out once, when it scrolls well into view: its
 * `.scene-step`s arrive in turn, each after the one before (`--step`, in
 * landing.css). The page arrives with every step showing, so without a
 * script, under reduced motion, or already on screen, it is simply there.
 */
export function Scene({
  children,
  className,
  share = 0.35,
}: {
  children: ReactNode
  className?: string
  /** How much of it must be in view to start. */
  share?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (element.getBoundingClientRect().top < window.innerHeight) return
    element.dataset.scene = 'waiting'
    const watcher = new IntersectionObserver(
      ([each]) => {
        if (!each?.isIntersecting) return
        element.dataset.scene = 'shown'
        watcher.disconnect()
      },
      { threshold: share },
    )
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [share])
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
