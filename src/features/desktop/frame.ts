import { appWindow, call } from './tauri'

/**
 * What makes Shelf's header the bar of Shelf for Windows' window (ADR 005,
 * section 8), fetched only in that window (`window-frame.tsx`): the header
 * moves the window, its controls (`window-controls.tsx`) act, the maximize
 * button follows the window, and the page gets a scrollbar of Shelf's.
 */

/** The window commands the header's controls may name. */
const COMMANDS = new Set(['minimize', 'toggle_maximize', 'close'])

/** Starts it all; what it returns undoes it. */
export const startWindowFrame = (): (() => void) => {
  const header = document.querySelector<HTMLElement>('header[data-title-bar]')
  const stops = [followMaximized(), pageScrollbar()]
  if (header) {
    // Tauri's own script reads this: "deep" lets any part of the header that is not a link, a
    // button or a field move the window, and a double click maximize it.
    header.setAttribute('data-tauri-drag-region', 'deep')
    const press = (event: MouseEvent) => {
      const command = (event.target as Element)
        .closest<HTMLElement>('[data-window-command]')
        ?.getAttribute('data-window-command')
      if (command && COMMANDS.has(command)) void call(`plugin:window|${command}`).catch(() => {})
    }
    header.addEventListener('click', press)
    stops.push(() => {
      header.removeEventListener('click', press)
      header.removeAttribute('data-tauri-drag-region')
    })
  }
  return () => {
    for (const stop of stops) stop()
  }
}

/**
 * Maximized by the button, a double click on the header, a drag to the top
 * or Windows' keys: `data-maximized` on <html> shows the restore button's
 * drawing (the `maximized` variant), and the button is named for what it does.
 */
const followMaximized = () => {
  let current = true
  const read = () => {
    appWindow.isMaximized().then(
      (maximized) => {
        if (!current) return
        document.documentElement.toggleAttribute('data-maximized', maximized)
        const button = document.querySelector<HTMLElement>(
          '[data-window-command="toggle_maximize"]',
        )
        const label = button?.getAttribute(maximized ? 'data-label-restore' : 'data-label-maximize')
        if (button && label) {
          button.setAttribute('aria-label', label)
          button.setAttribute('title', label)
        }
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
}

/** The shortest the thumb gets, so it can still be caught on a long shelf. */
const MIN_THUMB = 32

/** How long the thumb stays after the page stops scrolling. */
const LINGER_MS = 900

/**
 * The page's scrollbar in the app's window. Windows' runs the window's whole
 * height, beside the close button, so `globals.css` hides it there; this one
 * starts below the header and lies over the page, thin, faint until the page
 * scrolls or the pointer is on it. It can be dragged, and pressing its track
 * moves a page, as Windows' does. The wheel and the keyboard scroll the page
 * as ever, so assistive technology is not shown it.
 */
const pageScrollbar = () => {
  const bar = document.createElement('div')
  bar.setAttribute('aria-hidden', 'true')
  bar.setAttribute('data-page-scrollbar', '')
  bar.className = 'group fixed top-14 right-0 bottom-0 z-30 w-3'
  const grip = document.createElement('div')
  grip.className =
    'ml-auto w-1.5 rounded-full bg-muted opacity-25 transition-opacity duration-quick group-hover:w-2 group-hover:opacity-70 group-data-dragging:w-2 group-data-dragging:opacity-70 group-data-shown:opacity-70'
  bar.append(grip)
  document.body.append(bar)

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
    bar.setAttribute('data-shown', '')
    clearTimeout(linger)
    linger = setTimeout(() => bar.removeAttribute('data-shown'), LINGER_MS)
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
    bar.setAttribute('data-dragging', '')
    const move = (moved: PointerEvent) => {
      if (travel <= 0) return
      window.scrollTo({
        top: from.top + ((moved.clientY - from.y) * reach) / travel,
        behavior: 'instant',
      })
    }
    const release = () => {
      bar.removeAttribute('data-dragging')
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
    bar.remove()
  }
}
