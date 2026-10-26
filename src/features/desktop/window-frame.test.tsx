import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { renderWithIntl } from '@/test/render'

import { setBridgeForTests } from './tauri'
import { PageScrollbar, TitleBar, WindowControls } from './window-frame'

/**
 * Shelf's header as the bar of Shelf for Windows' window (ADR 005, section 8),
 * with the app's window commands answered here.
 */

const theWindow = { maximized: false }
const invoke = vi.fn(async (command: string) => {
  if (command === 'plugin:window|is_maximized') return theWindow.maximized
  if (command === 'plugin:window|toggle_maximize') theWindow.maximized = !theWindow.maximized
  return null
})

const frame = () =>
  renderWithIntl(
    <TitleBar className="header">
      <span>Shelf</span>
      <WindowControls />
    </TitleBar>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  theWindow.maximized = false
  setBridgeForTests(invoke)
  document.documentElement.setAttribute('data-window', 'frameless')
})

afterEach(() => {
  setBridgeForTests(undefined)
  document.documentElement.removeAttribute('data-window')
})

describe('the header as the window’s bar (ADR 005, section 8)', () => {
  it('moves the window from its empty parts', () => {
    const { container } = frame()
    expect(container.querySelector('header')).toHaveAttribute('data-tauri-drag-region', 'deep')
  })

  it('minimizes, maximizes, restores and closes the window', async () => {
    frame()
    await userEvent.click(screen.getByRole('button', { name: 'Minimize' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|minimize', {})

    await userEvent.click(screen.getByRole('button', { name: 'Maximize' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|toggle_maximize', {})
    // Windows resizes the page as the window maximizes, and the button becomes Restore.
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(invoke).toHaveBeenCalledWith('plugin:window|close', {})
  })

  it('is only a header in an app that keeps Windows’ bar, and in a browser', async () => {
    document.documentElement.removeAttribute('data-window')
    const { container, unmount } = frame()
    expect(container.querySelector('header')).not.toHaveAttribute('data-tauri-drag-region')
    await userEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }))
    expect(invoke).not.toHaveBeenCalled()
    unmount()

    document.documentElement.setAttribute('data-window', 'frameless')
    setBridgeForTests(null)
    const browser = frame()
    expect(browser.container.querySelector('header')).not.toHaveAttribute('data-tauri-drag-region')
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

  it('is as long as the share of the page in view, and follows the page', async () => {
    const { container } = renderWithIntl(<PageScrollbar />)
    const thumb = container.querySelector<HTMLElement>('[data-page-scrollbar] > div')!
    // A quarter of the page is in view: a quarter of the track.
    expect(thumb.style.height).toBe('186px')
    expect(thumb.style.transform).toBe('translateY(0px)')

    window.scrollY = 1200
    window.dispatchEvent(new Event('scroll'))
    await nextFrame()
    // Halfway down what can be scrolled: halfway down what the thumb can travel.
    expect(thumb.style.transform).toBe('translateY(279px)')
    expect(container.querySelector('[data-page-scrollbar]')).toHaveAttribute('data-shown')
  })

  it('is not there when the page does not scroll', async () => {
    vi.spyOn(page, 'scrollHeight', 'get').mockReturnValue(800)
    const { container } = renderWithIntl(<PageScrollbar />)
    await waitFor(() =>
      expect(container.querySelector<HTMLElement>('[data-page-scrollbar]')!.style.visibility).toBe(
        'hidden',
      ),
    )
  })
})
