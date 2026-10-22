'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'

import { useReducedMotion } from '@/features/library/use-preference'
import { duration } from '@/ui/tokens/motion'

const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Where the browser cannot tie an animation to scrolling (Firefox, for now),
 * marks each `.reveal` on the page as it scrolls into view, so it rises as it
 * would elsewhere (landing.css). Parts already on screen are simply there.
 */
export function Reveals({ root }: { root: string }) {
  useEffect(() => {
    const page = document.getElementById(root)
    if (!page || CSS.supports('animation-timeline: view()') || calm()) return
    const parts = [...page.querySelectorAll<HTMLElement>('.reveal')]
    const waiting = parts.filter((part) => part.getBoundingClientRect().top > window.innerHeight)
    if (waiting.length === 0) return
    for (const part of parts) if (!waiting.includes(part)) part.dataset.shown = ''
    page.dataset.reveals = 'waiting'
    const watcher = new IntersectionObserver(
      (seen) => {
        for (const each of seen) {
          if (!each.isIntersecting) continue
          ;(each.target as HTMLElement).dataset.shown = ''
          watcher.unobserve(each.target)
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    )
    for (const part of waiting) watcher.observe(part)
    return () => watcher.disconnect()
  }, [root])
  return null
}

/**
 * True once `target` has come well into view, and from then on. A scene that
 * plays out (filters switching on, a list being matched) starts then. Under
 * reduced motion it is true at once: the scene is shown as it ends.
 */
export function useArrived(target: RefObject<HTMLElement | null>, share = 0.4): boolean {
  const reduced = useReducedMotion()
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    const element = target.current
    if (!element || arrived) return
    const watcher = new IntersectionObserver(
      ([each]) => {
        if (!each?.isIntersecting) return
        setArrived(true)
        watcher.disconnect()
      },
      { threshold: share },
    )
    watcher.observe(element)
    return () => watcher.disconnect()
  }, [target, share, arrived])
  return reduced || arrived
}

/**
 * A figure that counts up from nothing when it scrolls into view. The page
 * arrives with the true figure in it, so nothing is wrong before, without or
 * instead of the count; under reduced motion it does not run. Each frame is
 * written straight into the page: React is not asked to draw fifty figures.
 */
export function CountUp({ value, text, locale }: { value: number; text: string; locale: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element || calm()) return
    // Already on screen: counting would take it back down first.
    if (element.getBoundingClientRect().top < window.innerHeight) return
    const format = new Intl.NumberFormat(locale)
    element.textContent = format.format(0)
    let frame = 0
    const count = () => {
      const started = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - started) / (duration.cinematic * 1.5))
        // Quick at first, slowing into the final figure.
        const eased = 1 - (1 - progress) ** 3
        element.textContent = progress < 1 ? format.format(Math.round(value * eased)) : text
        if (progress < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const watcher = new IntersectionObserver(
      ([each]) => {
        if (!each?.isIntersecting) return
        watcher.disconnect()
        count()
      },
      { threshold: 1 },
    )
    watcher.observe(element)
    return () => {
      watcher.disconnect()
      cancelAnimationFrame(frame)
      element.textContent = text
    }
  }, [value, text, locale])
  return (
    <span ref={ref} className="tabular-nums">
      {text}
    </span>
  )
}
