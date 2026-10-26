import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { startWindowFrame } from './frame'
import { setBridgeForTests } from './tauri'
import { WindowControls } from './window-controls'

/**
 * Shelf's header as the bar of Shelf for Windows' window (ADR 005, section 8),
 * with the app's window commands answered here.
 */

const app = { maximized: false }
const invoke = vi.fn(async (command: string) => {
  if (command === 'plugin:window|is_maximized') return app.maximized
  if (command === 'plugin:window|toggle_maximize') app.maximized = !app.maximized
  return null
})

/** The header as every page draws it, with the frame started over it as the app's window does. */
const header = () => {
  const drawn = renderWithIntl(
    <header data-title-bar="">
      <span>Shelf</span>
      <WindowControls />
    </header>,
  )
  const stop = startWindowFrame()
  return { ...drawn, stop }
}

let stop: (() => void) | undefined

beforeEach(() => {
  vi.clearAllMocks()
  app.maximized = false
  setBridgeForTests(invoke)
})

afterEach(() => {
  stop?.()
  stop = undefined
  setBridgeForTests(undefined)
  document.documentElement.removeAttribute('data-maximized')
})

describe('the header as the window’s bar (ADR 005, section 8)', () => {
  it('is drawn for every page, hidden but where the app’s window shows it', () => {
    renderWithIntl(<WindowControls />)
    for (const name of ['Minimize', 'Maximize', 'Close'])
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' }).parentElement).toHaveClass(
      'hidden',
      'frameless:flex',
    )
  })

  it('moves the window from its empty parts', () => {
    const drawn = header()
    stop = drawn.stop
    expect(drawn.container.querySelector('header')).toHaveAttribute(
      'data-tauri-drag-region',
      'deep',
    )
  })

  it('minimizes, maximizes, restores and closes the window', async () => {
    stop = header().stop
    await userEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|minimize', {})

    await userEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|toggle_maximize', {})
    // Windows resizes the page as the window maximizes, and the button becomes Restore.
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-maximized')

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|close', {})
  })

  it('asks for nothing but the window’s own commands', async () => {
    stop = header().stop
    const button = screen.getByRole('button', { name: 'Close' })
    button.setAttribute('data-window-command', 'set_size')
    await userEvent.click(button)
    expect(invoke).not.toHaveBeenCalledWith('plugin:window|set_size', expect.anything())
  })

  it('is undone when stopped', () => {
    const drawn = header()
    drawn.stop()
    expect(drawn.container.querySelector('header')).not.toHaveAttribute('data-tauri-drag-region')
    expect(document.querySelector('[data-page-scrollbar]')).toBeNull()
  })
})

describe('the page’s scrollbar in the app’s window', () => {
  const page = document.documentElement

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(744)
    vi.spyOn(page, 'scrollHeight', 'get').mockReturnValue(3200)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.scrollY = 0
  })

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve))
  const scrollbar = () => document.querySelector<HTMLElement>('[data-page-scrollbar]')!

  it('is as long as the share of the page in view, and follows the page', async () => {
    stop = startWindowFrame()
    const thumb = scrollbar().firstElementChild as HTMLElement
    // A quarter of the page is in view: a quarter of the track.
    expect(thumb.style.height).toBe('186px')
    expect(thumb.style.transform).toBe('translateY(0px)')

    window.scrollY = 1200
    window.dispatchEvent(new Event('scroll'))
    await nextFrame()
    // Halfway down what can be scrolled: halfway down what the thumb can travel.
    expect(thumb.style.transform).toBe('translateY(279px)')
    expect(scrollbar()).toHaveAttribute('data-shown')
    expect(scrollbar()).toHaveAttribute('aria-hidden', 'true')
  })

  it('is not there when the page does not scroll', async () => {
    vi.spyOn(page, 'scrollHeight', 'get').mockReturnValue(800)
    stop = startWindowFrame()
    await waitFor(() => expect(scrollbar().style.visibility).toBe('hidden'))
  })
})
