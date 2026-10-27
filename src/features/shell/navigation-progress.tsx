'use client'

import { useEffect, useRef } from 'react'

/** How long a page may take before the bar shows: one that opens at once shows nothing. */
const SHOW_AFTER_MS = 150

/** How long the bar waits for a page before it gives up and goes. */
const GIVE_UP_MS = 20_000

/**
 * A thin accent line across the top of the window while the page a link
 * leads to is on its way. A page the browser has not been sent ahead of time
 * opens only once the server answers, and that can take seconds: a smart
 * shelf or the other language on their first visit after the library
 * changed. Until then nothing on screen moved.
 *
 * It follows clicks on the links Next.js opens in place (they prevent the
 * browser's own move), and ends when the address changes, which the router
 * does as it draws the new page. Back and Forward, and a page opened afresh,
 * have the browser's own signs.
 */
export function NavigationProgress() {
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const line = bar.current
    if (!line) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let frame = 0

    const stop = () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
    const finish = () => {
      stop()
      // Shown, it runs to the end and fades; never shown, it stays away.
      line.dataset.state = line.dataset.state === 'loading' ? 'done' : ''
    }
    const start = (from: string) => {
      stop()
      line.dataset.state = ''
      const began = performance.now()
      timer = setTimeout(() => (line.dataset.state = 'loading'), SHOW_AFTER_MS)
      const watch = () => {
        if (location.href !== from || performance.now() - began > GIVE_UP_MS) finish()
        else frame = requestAnimationFrame(watch)
      }
      frame = requestAnimationFrame(watch)
    }

    // After React's own listener, so a link Next.js took is known by its prevented default.
    const onClick = (event: MouseEvent) => {
      if (!event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self')) return
      const to = new URL(link.href)
      // Another site, or this very page (a mark on it, or the same address).
      if (to.origin !== location.origin) return
      if (to.pathname === location.pathname && to.search === location.search) return
      start(location.href)
    }
    window.addEventListener('click', onClick)
    return () => {
      stop()
      window.removeEventListener('click', onClick)
    }
  }, [])

  return <div ref={bar} aria-hidden="true" className="navigation-progress" />
}
