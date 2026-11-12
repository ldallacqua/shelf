import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { colorsOf } from '@/domain/colorway/derive'
import { presets, type OwnColorway } from '@/domain/colorway/presets'
import { setDevice } from '@/test/device'

import {
  getColorway,
  getOwnColorway,
  parseColorway,
  setColorway,
  setOwnColorway,
  subscribeToColorway,
} from './colorway-store'
import { chromeProperty, COLORS_STORAGE_KEY, OWN_COLORS_STORAGE_KEY, themeColor } from './theme'
import { colorwayWall } from './colorway-walls'
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
    root.removeAttribute('style')
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

describe("one's own colorway", () => {
  const own: OwnColorway = {
    seeds: presets.ocean,
    from: 'ocean',
    colors: colorsOf(presets.ocean),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    delete root.dataset.colors
    startPage('light')
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    delete root.dataset.colors
    root.removeAttribute('style')
  })

  it('paints the page in it, lays its colors on <html>, and keeps it whole', () => {
    setOwnColorway(own)

    expect(getColorway()).toBe('own')
    expect(root.style.getPropertyValue('--own-light-wall')).toBe(own.colors.light.wall)
    expect(root.style.getPropertyValue('--own-dark-text')).toBe(own.colors.dark.text)
    expect(root.style.getPropertyValue('--own-led')).toBe(own.colors.led)
    expect(window.localStorage.getItem(COLORS_STORAGE_KEY)).toBe('own')
    expect(getOwnColorway()).toEqual(own)
    expect(themeColorMeta()).toBe(own.colors.light.wall)
  })

  it('plays as a change of light when chosen, and follows at once while its colors change', () => {
    setOwnColorway(own)
    expect(root.dataset.themeChanging).toBe('to-light')
    vi.advanceTimersByTime(1200)

    const picked = { ...own, seeds: { ...own.seeds, accent: '#ff0000' } }
    setOwnColorway({ ...picked, colors: colorsOf(picked.seeds) })
    expect(root.dataset.themeChanging).toBeUndefined()
    expect(getOwnColorway()?.seeds.accent).toBe('#ff0000')
  })

  it("keeps the wall of one's own in the browser chrome when the theme changes", () => {
    setOwnColorway(own)
    setThemeChoice('dark')

    expect(themeColorMeta()).toBe(own.colors.dark.wall)
  })

  it('is kept for coming back to when a preset is chosen', () => {
    setOwnColorway(own)
    setColorway('ember')

    expect(getColorway()).toBe('ember')
    expect(root.style.getPropertyValue(chromeProperty.light)).toBe(colorwayWall.ember.light)
    expect(getOwnColorway()).toEqual(own)
  })

  it("leaves no walls on <html> back on Shelf's own", () => {
    setOwnColorway(own)
    setColorway('violet')

    expect(root.style.getPropertyValue(chromeProperty.light)).toBe('')
    expect(themeColorMeta()).toBe(themeColor.light)
  })

  it('is kept on the page when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    const writing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked)
    const reading = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked)
    setOwnColorway(own)

    expect(getColorway()).toBe('own')
    expect(getOwnColorway()).toEqual(own)
    writing.mockRestore()
    reading.mockRestore()
  })

  it('reads nothing from what is not one', () => {
    window.localStorage.setItem(OWN_COLORS_STORAGE_KEY, '{"colors":')
    expect(getOwnColorway()).toBeUndefined()
    window.localStorage.setItem(OWN_COLORS_STORAGE_KEY, JSON.stringify({ ...own, from: 'mine' }))
    expect(getOwnColorway()).toBeUndefined()
  })

  it("picks up one's own changed in another tab", () => {
    const unsubscribe = subscribeToColorway(() => {})

    window.localStorage.setItem(OWN_COLORS_STORAGE_KEY, JSON.stringify(own))
    window.localStorage.setItem(COLORS_STORAGE_KEY, 'own')
    window.dispatchEvent(new StorageEvent('storage', { key: OWN_COLORS_STORAGE_KEY }))

    expect(getColorway()).toBe('own')
    expect(root.style.getPropertyValue('--own-light-accent')).toBe(own.colors.light.accent)

    unsubscribe()
  })

  it("falls back to Shelf's own when another tab names one's own but kept none", () => {
    const unsubscribe = subscribeToColorway(() => {})
    root.dataset.colors = 'ocean'

    window.localStorage.removeItem(OWN_COLORS_STORAGE_KEY)
    window.localStorage.setItem(COLORS_STORAGE_KEY, 'own')
    window.dispatchEvent(new StorageEvent('storage', { key: COLORS_STORAGE_KEY }))

    expect(getColorway()).toBe('violet')

    unsubscribe()
  })
})
