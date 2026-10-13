import { describe, expect, it } from 'vitest'

import { contrast, mix } from './contrast'
import { duration, ease } from './motion'
import { readMotion, readPalette, readProperties, readTheme, resolve } from './read-tokens'

const palette = readPalette()
const themes = { light: readTheme('light'), dark: readTheme('dark') }
const themeNames = ['light', 'dark'] as const

describe('contrast', () => {
  it('matches known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })
})

describe('theme tokens', () => {
  it('defines the same tokens in both themes', () => {
    expect([...themes.dark.keys()].sort()).toEqual([...themes.light.keys()].sort())
  })

  it('registers every token that changes with the theme, with the light value as its start', () => {
    const properties = readProperties()
    const changing = [...themes.light.keys()].filter(
      (name) => themes.light.get(name) !== themes.dark.get(name),
    )
    for (const name of changing) {
      expect(properties.has(name), `${name} is not registered in properties.css`).toBe(true)
      expect(properties.get(name)?.initial, `${name} initial value`).toBe(
        resolve(name, themes.light, palette),
      )
    }
  })

  it('animates every registered token when the theme changes', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')
    const transition = /html\[data-theme-changing\]\s*\{[\s\S]*?transition:([\s\S]*?);/.exec(
      css,
    )?.[1]
    expect(transition).toBeDefined()
    for (const name of readProperties().keys()) {
      expect(transition, `${name} is missing from the theme-change transition`).toMatch(
        new RegExp(`${name} var\\(`),
      )
    }
  })

  it('gives the LED the same resting color in both themes', () => {
    expect(resolve('--led', themes.light, palette)).toBe(resolve('--led', themes.dark, palette))
  })
})

/**
 * The accessibility contract for color. Text needs 4.5:1; anything that is
 * not text but must be seen (a control's edge, the focus ring, a marker)
 * needs 3:1. Every pair the interface is allowed to use is listed here; a
 * pair that is not listed is not allowed.
 */
describe('contrast requirements', () => {
  const walls = ['--wall', '--wall-deep']
  const text: [string, string[]][] = [
    ['--text', [...walls, '--surface', '--surface-raised']],
    ['--text-muted', [...walls, '--surface', '--surface-raised']],
    ['--accent', [...walls, '--surface', '--surface-raised']],
    ['--marker', [...walls, '--surface', '--surface-raised']],
    ['--on-accent', ['--accent']],
    ['--on-ledge', ['--ledge']],
  ]
  const graphics: [string, string[]][] = [
    ['--line-strong', ['--wall', '--surface', '--surface-raised']],
    ['--focus', [...walls, '--surface', '--surface-raised']],
  ]

  for (const theme of themeNames) {
    const color = (name: string) => resolve(name, themes[theme], palette)

    describe(theme, () => {
      it.each(text.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg])))(
        'text %s on %s is at least 4.5:1',
        (fg, bg) => {
          expect(contrast(color(fg as string), color(bg as string))).toBeGreaterThanOrEqual(4.5)
        },
      )

      it.each(graphics.flatMap(([fg, bgs]) => bgs.map((bg) => [fg, bg])))(
        'graphic %s on %s is at least 3:1',
        (fg, bg) => {
          expect(contrast(color(fg as string), color(bg as string))).toBeGreaterThanOrEqual(3)
        },
      )
    })
  }
})

/**
 * The LED can be any color, because it follows the game in focus. Where its
 * light washes the wall, text must stay readable whatever that color is. The
 * worst case is the color that moves the wall furthest toward the text: white
 * light on the dark wall, and no light at all (black) on the pale one.
 */
describe('text on a wall washed by the LED', () => {
  const worstLed = { light: '#000000', dark: '#ffffff' }

  for (const theme of themeNames) {
    const tokens = themes[theme]
    const share = Number(tokens.get('--led-strength')) * Number(tokens.get('--led-wash'))

    it.each(['--text', '--text-muted'])(
      `${theme}: %s stays at 4.5:1 under any LED color`,
      (name) => {
        for (const wall of ['--wall', '--wall-deep']) {
          const washed = mix(resolve(wall, tokens, palette), worstLed[theme], share)
          expect(contrast(resolve(name, tokens, palette), washed)).toBeGreaterThanOrEqual(4.5)
        }
      },
    )
  }

  it('is lit more strongly with the room lights off than on', () => {
    expect(Number(themes.dark.get('--led-strength'))).toBeGreaterThan(
      Number(themes.light.get('--led-strength')),
    )
  })
})

describe('motion tokens', () => {
  const { durations, curves } = readMotion()

  it('has the same lengths in CSS and TypeScript', () => {
    const fromCss = Object.fromEntries(
      [...durations].map(([name, value]) => [name.replace('--motion-', ''), parseInt(value, 10)]),
    )
    expect(fromCss).toEqual(duration)
  })

  it('has the same curves in CSS and TypeScript', () => {
    const fromCss = Object.fromEntries(
      [...curves].map(([name, value]) => [
        name.replace('--ease-', ''),
        value
          .replace(/^cubic-bezier\(|\)$/g, '')
          .split(',')
          .map(Number),
      ]),
    )
    expect(fromCss).toEqual(ease)
  })

  it('never overshoots: nothing in Shelf bounces', () => {
    for (const [, y1, , y2] of Object.values(ease)) {
      expect(y1).toBeGreaterThanOrEqual(0)
      expect(y1).toBeLessThanOrEqual(1)
      expect(y2).toBeGreaterThanOrEqual(0)
      expect(y2).toBeLessThanOrEqual(1)
    }
  })
})
