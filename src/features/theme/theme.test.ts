import { describe, expect, it } from 'vitest'

import { colorsOf } from '@/domain/colorway/derive'
import { presets } from '@/domain/colorway/presets'

import { readPalette, readTheme, resolve } from '@/ui/tokens/read-tokens'

import {
  changeDirection,
  BLACK_STORAGE_KEY,
  BLACK_WALL,
  chromeProperty,
  COLORS_STORAGE_KEY,
  colorwayWall,
  OWN_COLORS_STORAGE_KEY,
  parseThemeChoice,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeColor,
} from './theme'
import { themeScript } from './theme-script'

describe('parseThemeChoice', () => {
  it('keeps the two explicit choices', () => {
    expect(parseThemeChoice('light')).toBe('light')
    expect(parseThemeChoice('dark')).toBe('dark')
  })

  it.each([null, undefined, '', 'system', 'DARK', 'sepia', 42, {}])(
    'treats %j as "follow the device"',
    (value) => {
      expect(parseThemeChoice(value)).toBe('system')
    },
  )
})

describe('resolveTheme', () => {
  it('follows the device when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignores the device when a theme is chosen', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('themeColor', () => {
  it("keeps the browser's own chrome the color of the wall", () => {
    const palette = readPalette()
    for (const theme of ['light', 'dark'] as const) {
      expect(themeColor[theme]).toBe(resolve('--wall', readTheme(theme), palette))
    }
  })
})

describe('changeDirection', () => {
  it('names which way the light is going', () => {
    expect(changeDirection('dark')).toBe('to-dark')
    expect(changeDirection('light')).toBe('to-light')
  })
})

/**
 * The inline script runs before anything else on the page, so it is tested
 * as the browser runs it: as a string, against a minimal fake page.
 */
describe('themeScript', () => {
  type Fake = {
    stored?: string | null
    storedColors?: string | null
    storedOwn?: string | null
    storedBlack?: string | null
    deviceIsDark?: boolean
    storageThrows?: boolean
    matchMediaMissing?: boolean
  }

  function run({
    stored = null,
    storedColors = null,
    storedOwn = null,
    storedBlack = null,
    deviceIsDark = false,
    storageThrows,
    matchMediaMissing,
  }: Fake) {
    const attributes = new Map<string, string>()
    const properties = new Map<string, string>()
    const metas: { name: string; content: string }[] = []
    const document = {
      documentElement: {
        setAttribute: (name: string, value: string) => attributes.set(name, value),
        style: { setProperty: (name: string, value: string) => properties.set(name, value) },
      },
      createElement: () => ({ name: '', content: '' }),
      head: { appendChild: (meta: { name: string; content: string }) => metas.push(meta) },
    }
    const localStorage = {
      getItem: (key: string) => {
        if (storageThrows) throw new Error('blocked')
        if (key === COLORS_STORAGE_KEY) return storedColors
        if (key === OWN_COLORS_STORAGE_KEY) return storedOwn
        if (key === BLACK_STORAGE_KEY) return storedBlack
        return key === THEME_STORAGE_KEY ? stored : null
      },
    }
    const matchMedia = matchMediaMissing
      ? undefined
      : (query: string) => ({
          matches: query.includes('prefers-color-scheme: dark') && deviceIsDark,
        })

    new Function('document', 'localStorage', 'matchMedia', themeScript())(
      document,
      localStorage,
      matchMedia,
    )
    return {
      theme: attributes.get('data-theme'),
      choice: attributes.get('data-theme-choice'),
      colors: attributes.get('data-colors'),
      black: attributes.has('data-black'),
      properties,
      metas,
    }
  }

  it('follows a dark device when nothing is stored', () => {
    expect(run({ deviceIsDark: true })).toMatchObject({ theme: 'dark', choice: 'system' })
  })

  it('follows a light device when nothing is stored', () => {
    expect(run({ deviceIsDark: false })).toMatchObject({ theme: 'light', choice: 'system' })
  })

  it('lets a stored choice beat the device', () => {
    expect(run({ stored: 'light', deviceIsDark: true })).toMatchObject({
      theme: 'light',
      choice: 'light',
    })
    expect(run({ stored: 'dark', deviceIsDark: false })).toMatchObject({
      theme: 'dark',
      choice: 'dark',
    })
  })

  it('ignores a stored value it does not know', () => {
    expect(run({ stored: 'sepia', deviceIsDark: true })).toMatchObject({
      theme: 'dark',
      choice: 'system',
    })
  })

  it('still works when storage is blocked', () => {
    expect(run({ storageThrows: true, deviceIsDark: true })).toMatchObject({
      theme: 'dark',
      choice: 'system',
    })
  })

  it('falls back to light when the device cannot be asked', () => {
    expect(run({ matchMediaMissing: true })).toMatchObject({ theme: 'light', choice: 'system' })
  })

  it("sets the browser's theme color to the wall", () => {
    expect(run({ deviceIsDark: true }).metas).toEqual([
      { name: 'theme-color', content: themeColor.dark },
    ])
    expect(run({ deviceIsDark: false }).metas).toEqual([
      { name: 'theme-color', content: themeColor.light },
    ])
  })

  it('paints the page in a stored colorway, and the chrome in its wall', () => {
    const page = run({ storedColors: 'ocean', deviceIsDark: true })
    expect(page).toMatchObject({ theme: 'dark', colors: 'ocean' })
    expect(page.metas).toEqual([{ name: 'theme-color', content: colorwayWall.ocean.dark }])
  })

  it.each([null, 'violet', 'sepia', 'toString', '__proto__', 'hasOwnProperty'])(
    "names no colorway for %j, so the page is Shelf's own",
    (storedColors) => {
      const page = run({ storedColors, deviceIsDark: false })
      expect(page.colors).toBeUndefined()
      expect(page.metas).toEqual([{ name: 'theme-color', content: themeColor.light }])
    },
  )

  it("leaves the walls of a colorway on <html> for the chrome, and none for Shelf's own", () => {
    expect(run({ storedColors: 'arcade' }).properties).toEqual(
      new Map([
        [chromeProperty.light, colorwayWall.arcade.light],
        [chromeProperty.dark, colorwayWall.arcade.dark],
      ]),
    )
    expect(run({ storedColors: null }).properties.size).toBe(0)
  })

  const own = { seeds: presets.ember, from: 'ember', colors: colorsOf(presets.ember) }

  it("paints the page in one's own colors, kept whole", () => {
    const page = run({ storedColors: 'own', storedOwn: JSON.stringify(own), deviceIsDark: true })

    expect(page.colors).toBe('own')
    expect(page.properties.get('--own-light-wall')).toBe(own.colors.light.wall)
    expect(page.properties.get('--own-dark-accent')).toBe(own.colors.dark.accent)
    expect(page.properties.get('--own-led')).toBe(own.colors.led)
    expect(page.properties.get(chromeProperty.dark)).toBe(own.colors.dark.wall)
    expect(page.metas).toEqual([{ name: 'theme-color', content: own.colors.dark.wall }])
  })

  it.each([
    ['nothing', null],
    ['not JSON', '{'],
    ['no colors', JSON.stringify({ seeds: own.seeds })],
    ['a color missing', JSON.stringify({ colors: { ...own.colors, led: undefined } })],
    [
      'a color that is not one',
      JSON.stringify({
        colors: { ...own.colors, light: { ...own.colors.light, wall: 'red;}html{display:none' } },
      }),
    ],
  ])("leaves the page in Shelf's own when one's own is %s", (_, storedOwn) => {
    const page = run({ storedColors: 'own', storedOwn })
    expect(page.colors).toBeUndefined()
    expect(page.properties.size).toBe(0)
    expect(page.metas).toEqual([{ name: 'theme-color', content: themeColor.light }])
  })

  it('makes the walls pure black with the lights off when the device keeps it so', () => {
    const page = run({ storedBlack: '1', storedColors: 'ocean', deviceIsDark: true })
    expect(page.black).toBe(true)
    expect(page.properties.get(chromeProperty.dark)).toBe(BLACK_WALL)
    expect(page.properties.get(chromeProperty.light)).toBe(colorwayWall.ocean.light)
    expect(page.metas).toEqual([{ name: 'theme-color', content: BLACK_WALL }])
  })

  it("makes Shelf's own colors pure black too, and leaves the lights-on wall", () => {
    const dark = run({ storedBlack: '1', deviceIsDark: true })
    expect(dark).toMatchObject({ black: true, colors: undefined })
    expect(dark.metas).toEqual([{ name: 'theme-color', content: BLACK_WALL }])
    const light = run({ storedBlack: '1', deviceIsDark: false })
    expect(light.metas).toEqual([{ name: 'theme-color', content: themeColor.light }])
  })

  it.each([null, '0', 'true'])('leaves pure black off for %j', (storedBlack) => {
    expect(run({ storedBlack, deviceIsDark: true }).black).toBe(false)
  })

  it('is one statement with no line breaks, safe to inline in <head>', () => {
    const script = themeScript()
    expect(script).not.toMatch(/[\n<]/)
    expect(script.startsWith('(function(){')).toBe(true)
  })
})
