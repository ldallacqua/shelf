import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDevice } from '@/test/device'

import { THEME_STORAGE_KEY, themeColor } from './theme'
import { getTheme, getThemeChoice, setThemeChoice, subscribeToTheme } from './theme-store'

const root = document.documentElement

/** Puts the page in the state the inline theme script leaves it in. */
function startPage(theme: 'light' | 'dark', choice: 'system' | 'light' | 'dark' = 'system') {
  root.dataset.theme = theme
  root.dataset.themeChoice = choice
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = themeColor[theme]
  document.head.appendChild(meta)
}

function themeColorMeta() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
}

describe('theme store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    startPage('light')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('reads the state the theme script left on the page', () => {
    expect(getThemeChoice()).toBe('system')
    expect(getTheme()).toBe('light')
  })

  it('applies and remembers a choice', () => {
    setThemeChoice('dark')

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.themeChoice).toBe('dark')
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(themeColorMeta()).toBe(themeColor.dark)
  })

  it('forgets the stored choice when set back to system', () => {
    setThemeChoice('dark')
    setThemeChoice('system')

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    expect(root.dataset.themeChoice).toBe('system')
    expect(root.dataset.theme).toBe('light')
  })

  it('plays the lighting change for about a second, then clears it', () => {
    setThemeChoice('dark')
    expect(root.dataset.themeChanging).toBe('to-dark')

    vi.advanceTimersByTime(1000)
    expect(root.dataset.themeChanging).toBe('to-dark')

    vi.advanceTimersByTime(200)
    expect(root.dataset.themeChanging).toBeUndefined()

    setThemeChoice('light')
    expect(root.dataset.themeChanging).toBe('to-light')
  })

  it('does not animate when the theme on screen stays the same', () => {
    setThemeChoice('light')
    expect(root.dataset.themeChanging).toBeUndefined()
  })

  it('changes at once under reduced motion', () => {
    setDevice({ reducedMotion: true })
    setThemeChoice('dark')

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.themeChanging).toBeUndefined()
  })

  it('still applies the choice when storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setThemeChoice('dark')
    expect(root.dataset.theme).toBe('dark')
    blocked.mockRestore()
  })

  it('tells subscribers about a change, and stops when they leave', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTheme(listener)

    setThemeChoice('dark')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    setThemeChoice('light')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('applies the stored choice itself when the theme script never ran', () => {
    delete root.dataset.theme
    delete root.dataset.themeChoice
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    const unsubscribe = subscribeToTheme(() => {})

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.themeChoice).toBe('dark')
    // It is a first paint, not a change: nothing animates.
    expect(root.dataset.themeChanging).toBeUndefined()

    unsubscribe()
  })

  it('follows the device while the choice is system', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToTheme(listener)

    setDevice({ dark: true })
    expect(root.dataset.theme).toBe('dark')
    expect(listener).toHaveBeenCalled()

    unsubscribe()
  })

  it('ignores the device once a theme is chosen', () => {
    const unsubscribe = subscribeToTheme(() => {})
    setThemeChoice('light')

    setDevice({ dark: true })
    expect(root.dataset.theme).toBe('light')

    unsubscribe()
  })

  it('picks up a choice made in another tab', () => {
    const unsubscribe = subscribeToTheme(() => {})

    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' }))

    expect(root.dataset.theme).toBe('dark')
    expect(root.dataset.themeChoice).toBe('dark')

    unsubscribe()
  })
})
