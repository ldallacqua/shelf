import { describe, expect, it } from 'vitest'

import { contrast, mix } from './contrast'
import { colorsOf, ledWash, requiredPairs } from './derive'
import { fromOklch, toOklch } from './oklch'
import { presetNames } from './names'
import { colorTokens, presets, type Colors, type Seeds, type Theme } from './presets'

const themes: Theme[] = ['light', 'dark']

/** Every pair the interface may use, and text on a wall washed by any LED, in both themes. */
function failures(colors: Colors): string[] {
  return themes.flatMap((theme) => {
    const tokens = colors[theme]
    const pairs = requiredPairs.flatMap(([foreground, backgrounds, ratio]) =>
      backgrounds
        .filter((background) => contrast(tokens[foreground], tokens[background]) < ratio)
        .map((background) => `${theme}: ${foreground} on ${background}`),
    )
    const { share, worst } = ledWash[theme]
    const washed = (['text', 'text-muted'] as const).flatMap((text) =>
      (['wall', 'wall-deep'] as const)
        .filter((wall) => contrast(tokens[text], mix(tokens[wall], worst, share)) < 4.5)
        .map((wall) => `${theme}: ${text} on a washed ${wall}`),
    )
    return [...pairs, ...washed]
  })
}

/** A small, repeatable source of colors, so a failure names the same seeds every run. */
function* seededColors(count: number): Generator<string> {
  let state = 206
  for (let index = 0; index < count; index += 1) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    yield `#${(state % 0x1000000).toString(16).padStart(6, '0')}`
  }
}

describe('colorsOf', () => {
  it.each(presetNames)('makes %s readable in both themes', (name) => {
    expect(failures(colorsOf(presets[name]))).toEqual([])
  })

  it('makes any three colors readable in both themes', () => {
    const colors = [...seededColors(600)]
    for (let index = 0; index + 2 < colors.length; index += 3) {
      const seeds: Seeds = {
        accent: colors[index]!,
        room: colors[index + 1]!,
        led: colors[index + 2]!,
      }
      expect(failures(colorsOf(seeds)), JSON.stringify(seeds)).toEqual([])
    }
  })

  it.each([
    ['black', '#000000'],
    ['white', '#ffffff'],
    ['yellow', '#ffff00'],
    ['pure blue', '#0000ff'],
    ['mid gray', '#808080'],
  ])('makes %s, as every seed, readable', (_, color) => {
    expect(failures(colorsOf({ accent: color, room: color, led: color }))).toEqual([])
  })

  it('sets every token, in both themes, as #rrggbb', () => {
    const colors = colorsOf(presets.ocean)
    for (const theme of themes) {
      expect(Object.keys(colors[theme]).sort()).toEqual([...colorTokens].sort())
      for (const value of Object.values(colors[theme])) expect(value).toMatch(/^#[0-9a-f]{6}$/)
    }
    expect(colors.led).toMatch(/^#[0-9a-f]{6}$/)
  })

  it("keeps a gray room gray, and tints the walls in a colorful room's hue", () => {
    const gray = colorsOf({ ...presets.ocean, room: '#808080' })
    expect(toOklch(gray.light.wall).c).toBeLessThan(0.002)

    const blue = colorsOf({ ...presets.ocean, room: '#2c4a66' })
    const wall = toOklch(blue.dark.wall)
    expect(wall.c).toBeGreaterThan(0.015)
    expect(Math.abs(wall.h - toOklch('#2c4a66').h)).toBeLessThan(15)
  })

  it('keeps the shelves black and the walls the lightness of Shelf’s own', () => {
    const arcade = colorsOf(presets.arcade)
    expect(toOklch(arcade.light.ledge).l).toBeLessThan(0.3)
    expect(toOklch(arcade.dark.ledge).l).toBeLessThan(0.3)
    expect(toOklch(arcade.light.wall).l).toBeCloseTo(0.949, 1)
    expect(toOklch(arcade.dark.wall).l).toBeCloseTo(0.159, 1)
  })

  it('keeps the accent’s hue, deeper with the lights on and paler with them off', () => {
    const ocean = colorsOf(presets.ocean)
    const seed = toOklch(presets.ocean.accent)
    for (const theme of themes) {
      expect(Math.abs(toOklch(ocean[theme].accent).h - seed.h)).toBeLessThan(12)
    }
    expect(toOklch(ocean.dark.accent).l).toBeGreaterThan(toOklch(ocean.light.accent).l)
    expect(ocean.light.focus).toBe(ocean.light.accent)
  })

  it('makes a gray light a cool white, and any other bright enough to read as light', () => {
    expect(toOklch(colorsOf({ ...presets.ocean, led: '#808080' }).led).l).toBeGreaterThan(0.75)
    expect(toOklch(colorsOf({ ...presets.ocean, led: '#200010' }).led).l).toBeGreaterThan(0.55)
  })
})

describe('oklch', () => {
  it.each(['#000000', '#ffffff', '#7c5cff', '#0a6b3a', '#eceef2', '#ff3b3b'])(
    'turns %s into OKLCH and back',
    (hex) => {
      expect(fromOklch(toOklch(hex))).toBe(hex)
    },
  )

  it('matches known values', () => {
    const white = toOklch('#ffffff')
    expect(white.l).toBeCloseTo(1, 3)
    expect(white.c).toBeCloseTo(0, 3)
    const red = toOklch('#ff0000')
    expect(red.l).toBeCloseTo(0.628, 2)
    expect(red.c).toBeCloseTo(0.2577, 2)
    expect(red.h).toBeCloseTo(29.23, 0)
  })

  it('lowers the chroma of a color sRGB cannot show, keeping its lightness', () => {
    const hex = fromOklch({ l: 0.7, c: 0.4, h: 150 })
    expect(hex).toMatch(/^#[0-9a-f]{6}$/)
    expect(toOklch(hex).l).toBeCloseTo(0.7, 1)
  })
})
