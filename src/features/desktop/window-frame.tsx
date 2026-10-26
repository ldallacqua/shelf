'use client'

import { MinusIcon, SquareIcon, XIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import { cn } from '@/ui/cn'
import { WindowRestoreIcon } from '@/ui/icons'

import { desktop, framelessWindow } from './bridge'

/**
 * Shelf for Windows' window has no Windows bar: Shelf's header is the bar
 * (ADR 005, section 8). These are its parts. In a browser, or in an app that
 * keeps Windows' bar, the header is only a header.
 */

/** Whether the window has a bar of its own never changes while a page is open. */
const unchanging = () => () => {}

const useFrameless = () => useSyncExternalStore(unchanging, framelessWindow, () => false)

/** The header, which in the app's window is the bar: its empty parts move the window. */
export function TitleBar({ className, children }: { className: string; children: ReactNode }) {
  const frameless = useFrameless()
  return (
    // Tauri's own script reads this: "deep" lets any part of the header that is not a link, a
    // button or a field move the window, and a double click maximize it.
    <header className={className} data-tauri-drag-region={frameless ? 'deep' : undefined}>
      {children}
    </header>
  )
}

const caption =
  'grid h-full w-11.5 place-items-center text-text focus-visible:-outline-offset-2 [&_svg]:size-4'

/**
 * Minimize, maximize (or restore) and close, at the header's right end, as
 * Windows draws them. Drawn for everyone and shown by CSS only in the app's
 * window, so they are there from the first paint.
 */
export function WindowControls() {
  const t = useTranslations('Shell.window')
  const frameless = useFrameless()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!frameless) return
    let current = true
    // Maximized by the button, a double click on the header, a drag to the top or Windows' keys.
    const read = () => {
      desktop.window.isMaximized().then(
        (now) => {
          if (current) setMaximized(now)
        },
        () => {},
      )
    }
    read()
    window.addEventListener('resize', read)
    return () => {
      current = false
      window.removeEventListener('resize', read)
    }
  }, [frameless])

  const act = (command: () => Promise<void>) => () => {
    if (framelessWindow()) void command().catch(() => {})
  }

  return (
    <div className="absolute inset-y-0 right-0 hidden frameless:flex">
      <button
        type="button"
        aria-label={t('minimize')}
        title={t('minimize')}
        className={cn(caption, 'hover:bg-text/10 active:bg-text/15')}
        onClick={act(desktop.window.minimize)}
      >
        <MinusIcon aria-hidden="true" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label={maximized ? t('restore') : t('maximize')}
        title={maximized ? t('restore') : t('maximize')}
        className={cn(caption, 'hover:bg-text/10 active:bg-text/15')}
        onClick={act(desktop.window.toggleMaximize)}
      >
        {maximized ? (
          <WindowRestoreIcon aria-hidden="true" strokeWidth={1.5} />
        ) : (
          <SquareIcon aria-hidden="true" strokeWidth={1.5} />
        )}
      </button>
      <button
        type="button"
        aria-label={t('close')}
        title={t('close')}
        className={cn(
          caption,
          'hover:bg-window-close hover:text-on-window-close active:bg-window-close/90 active:text-on-window-close',
        )}
        onClick={act(desktop.window.close)}
      >
        <XIcon aria-hidden="true" strokeWidth={1.5} />
      </button>
    </div>
  )
}

/** The shortest the thumb gets, so it can still be caught on a long shelf. */
const MIN_THUMB = 32

/** How long the thumb stays after the page stops scrolling. */
const LINGER_MS = 900

/**
 * The page's scrollbar in the app's window. Windows' runs the window's whole
 * height, beside the close button; this one starts below the header and lies
 * over the page, thin, shown while the page scrolls or the pointer is on it.
 * It can be dragged, and pressing its track moves a page, as Windows' does.
 * The wheel and the keyboard scroll the page as ever, so assistive technology
 * is not shown it.
 */
export function PageScrollbar() {
  const track = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = track.current
    const grip = thumb.current
    if (!bar || !grip || !framelessWindow()) return
    const page = document.documentElement
    let frame = 0
    let linger: ReturnType<typeof setTimeout> | undefined

    /** How long the thumb is, how far it can travel, and how far the page can scroll. */
    const measure = () => {
      const room = bar.clientHeight
      const view = window.innerHeight
      const reach = page.scrollHeight - view
      const size = Math.min(room, Math.max(MIN_THUMB, (room * view) / page.scrollHeight))
      return { size, travel: room - size, reach }
    }
    const draw = () => {
      frame = 0
      const { size, travel, reach } = measure()
      bar.style.visibility = reach > 0 ? '' : 'hidden'
      grip.style.height = `${size}px`
      grip.style.transform = `translateY(${reach > 0 ? (travel * window.scrollY) / reach : 0}px)`
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw)
    }
    const scrolled = () => {
      schedule()
      bar.dataset.shown = ''
      clearTimeout(linger)
      linger = setTimeout(() => delete bar.dataset.shown, LINGER_MS)
    }

    const press = (event: PointerEvent) => {
      if (event.button !== 0) return
      event.preventDefault()
      if (event.target !== grip) {
        // A page toward where the track was pressed.
        const up = event.clientY < grip.getBoundingClientRect().top
        window.scrollBy({ top: (up ? -0.875 : 0.875) * window.innerHeight, behavior: 'instant' })
        return
      }
      const { travel, reach } = measure()
      const from = { y: event.clientY, top: window.scrollY }
      bar.setPointerCapture(event.pointerId)
      bar.dataset.dragging = ''
      const move = (moved: PointerEvent) => {
        if (travel <= 0) return
        const top = from.top + ((moved.clientY - from.y) * reach) / travel
        window.scrollTo({ top, behavior: 'instant' })
      }
      const release = () => {
        delete bar.dataset.dragging
        bar.removeEventListener('pointermove', move)
        bar.removeEventListener('pointerup', release)
        bar.removeEventListener('pointercancel', release)
      }
      bar.addEventListener('pointermove', move)
      bar.addEventListener('pointerup', release)
      bar.addEventListener('pointercancel', release)
    }

    // The page grows as rows join it and the library arrives.
    const grows = new ResizeObserver(schedule)
    grows.observe(document.body)
    window.addEventListener('scroll', scrolled, { passive: true })
    window.addEventListener('resize', schedule)
    bar.addEventListener('pointerdown', press)
    draw()
    return () => {
      if (frame) cancelAnimationFrame(frame)
      clearTimeout(linger)
      grows.disconnect()
      window.removeEventListener('scroll', scrolled)
      window.removeEventListener('resize', schedule)
      bar.removeEventListener('pointerdown', press)
    }
  }, [])

  return (
    <div
      ref={track}
      aria-hidden="true"
      data-page-scrollbar=""
      className="group fixed top-14 right-0 bottom-0 z-30 hidden w-3 frameless:block"
    >
      <div
        ref={thumb}
        className="ml-auto w-1.5 rounded-full bg-muted opacity-25 transition-opacity duration-quick group-hover:w-2 group-hover:opacity-70 group-data-dragging:w-2 group-data-dragging:opacity-70 group-data-shown:opacity-70"
      />
    </div>
  )
}
