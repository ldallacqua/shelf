import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDevice } from '@/test/device'

import { getColorway, parseColorway, setColorway, subscribeToColorway } from './colorway-store'
import { COLORS_STORAGE_KEY, colorwayWall, themeColor } from './theme'
import { setThemeChoice } from './theme-store'

const root = document.documentElement

/** Puts the page in the state the inline theme script leaves it in. */
function startPage(theme: 'light' | 'dark') {
  root.dataset.theme = theme
  root.dataset.themeChoice = theme
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = themeColor[theme]
  document.head.appendChild(meta)
}

function themeColorMeta() {
  return document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
}

describe('colorway store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    delete root.dataset.colors
    startPage('dark')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    delete root.dataset.colors
  })

  it("reads Shelf's own colors when the page names none", () => {
    expect(getColorway()).toBe('violet')
  })

  it('paints the page in a colorway and remembers it', () => {
    setColorway('ocean')

    expect(root.dataset.colors).toBe('ocean')
    expect(getColorway()).toBe('ocean')
    expect(window.localStorage.getItem(COLORS_STORAGE_KEY)).toBe('ocean')
    expect(themeColorMeta()).toBe(colorwayWall.ocean.dark)
  })

  it("forgets it, and names none, back on Shelf's own", () => {
    setColorway('ember')
    setColorway('violet')

    expect(root.dataset.colors).toBeUndefined()
    expect(window.localStorage.getItem(COLORS_STORAGE_KEY)).toBeNull()
    expect(themeColorMeta()).toBe(themeColor.dark)
  })

  it('plays the change as a change of light in the theme that is on', () => {
    setColorway('arcade')
    expect(root.dataset.themeChanging).toBe('to-dark')
    expect(root.dataset.theme).toBe('dark')

    vi.advanceTimersByTime(1200)
    expect(root.dataset.themeChanging).toBeUndefined()
  })

  it('changes at once under reduced motion', () => {
    setDevice({ reducedMotion: true })
    setColorway('crimson')

    expect(root.dataset.colors).toBe('crimson')
    expect(root.dataset.themeChanging).toBeUndefined()
  })

  it('keeps the wall in the browser chrome when the theme changes', () => {
    setColorway('graphite')
    setThemeChoice('light')

    expect(themeColorMeta()).toBe(colorwayWall.graphite.light)
  })

  it('still paints the page when storage is blocked', () => {
    const blocked = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    setColorway('ocean')
    expect(root.dataset.colors).toBe('ocean')
    blocked.mockRestore()
  })

  it('tells subscribers about a change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeToColorway(listener)

    setColorway('ember')
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
  })

  it('picks up a colorway chosen in another tab', () => {
    const unsubscribe = subscribeToColorway(() => {})

    window.localStorage.setItem(COLORS_STORAGE_KEY, 'arcade')
    window.dispatchEvent(
      new StorageEvent('storage', { key: COLORS_STORAGE_KEY, newValue: 'arcade' }),
    )

    expect(root.dataset.colors).toBe('arcade')
    // The theme is left as it was.
    expect(root.dataset.theme).toBe('dark')

    unsubscribe()
  })
})

describe('parseColorway', () => {
  it('keeps a preset', () => {
    expect(parseColorway('ocean')).toBe('ocean')
  })

  it.each([null, undefined, '', 'OCEAN', 'mine', 'toString', 42, {}])(
    "treats %j as Shelf's own colors",
    (value) => {
      expect(parseColorway(value)).toBe('violet')
    },
  )
})
