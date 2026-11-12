import { describe, expect, it } from 'vitest'

import { contrast, mix } from './contrast'
import { duration, ease } from './motion'
import {
  readBlack,
  readColorway,
  readColorwayNames,
  readPresetNames,
  readMotion,
  readPalette,
  readProperties,
  readTheme,
  resolve,
} from './read-tokens'

const palette = readPalette()
const themes = { light: readTheme('light'), dark: readTheme('dark') }
const themeNames = ['light', 'dark'] as const
const colorways = readPresetNames()

describe('contrast', () => {
  it('keeps the cinema captions readable over the selected media', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
    const token = (name: string) => {
      const value = new RegExp(`${name}:\\s*(#[a-f0-9]+)`, 'i').exec(css)![1]!
      return value.length === 4
        ? '#' + [...value.slice(1)].map((digit) => digit + digit).join('')
        : value
    }
    expect(contrast(token('--color-cinema'), token('--color-on-cinema'))).toBeGreaterThanOrEqual(
      4.5,
    )
  })
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

  it('glides every token a colorway sets when the room follows a game', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8')
    const transition = /html\[data-colors-changing\]\s*\{[\s\S]*?transition:([\s\S]*?);/.exec(
      css,
    )?.[1]
    expect(transition).toBeDefined()
    const set = [...readColorway(colorways[1]!, 'dark').keys()].filter(
      (name) => readColorway(colorways[1]!, 'dark').get(name) !== themes.dark.get(name),
    )
    for (const name of set) {
      expect(transition, `${name} is missing from the follow transition`).toMatch(
        new RegExp(`${name} var\\(`),
      )
    }
  })

  it('gives the LED the same resting color in both themes', () => {
    expect(resolve('--led', themes.light, palette)).toBe(resolve('--led', themes.dark, palette))
  })
})

describe('colorway tokens', () => {
  it("has Shelf's own and the other presets, then one's own", () => {
    expect(colorways[0]).toBe('violet')
    expect(colorways.length).toBeGreaterThan(1)
    expect(readColorwayNames()).toEqual([...colorways, 'own'])
  })

  it("reads one's own from <html>, and is Shelf's own where <html> has nothing", () => {
    for (const theme of themeNames) {
      const own = readColorway('own', theme)
      for (const [token, value] of own) {
        if (value === themes[theme].get(token)) continue
        const read = /^var\((--own-[\w-]+), (#[0-9a-f]{6})\)$/.exec(value)
        expect(read, `${token} in ${theme}`).not.toBeNull()
        const property = token === '--led' ? '--own-led' : `--own-${theme}-${token.slice(2)}`
        expect(read?.[1]).toBe(property)
        expect(read?.[2], `${token} falls back to Shelf's own`).toBe(
          resolve(token, themes[theme], palette),
        )
      }
    }
  })

  it.each(colorways)('%s sets the same tokens in both themes, all registered colors', (name) => {
    const properties = readProperties()
    for (const theme of themeNames) {
      const own = [...readColorway(name, theme)].filter(([token]) => !themes[theme].has(token))
      expect(own, 'a colorway sets only tokens the theme has').toEqual([])
    }
    const light = readColorway(name, 'light')
    for (const [token, value] of light) {
      if (value === themes.light.get(token)) continue
      expect(properties.get(token)?.syntax, `${token} is a registered color`).toBe('<color>')
    }
  })

  it('makes the walls fully black in pure black, for every colorway', () => {
    for (const colorway of [...colorways, 'own']) {
      const black = readBlack(colorway)
      expect(black.get('--wall'), colorway).toBe('#000000')
      expect(black.get('--wall-deep'), colorway).toBe('#000000')
    }
  })

  it("reads the followed game's colors from <html>, and is Shelf's own where <html> has nothing", async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('./colorways.css', import.meta.url), 'utf8')
    for (const theme of themeNames) {
      const body = new RegExp(String.raw`\[data-game\]\[data-theme='${theme}'\] \{([^}]*)\}`).exec(
        css,
      )?.[1]
      expect(body, theme).toBeDefined()
      for (const [, token, property, fallback] of body!.matchAll(
        /(--[\w-]+): var\((--game-[\w-]+), (#[0-9a-f]{6})\);/g,
      )) {
        const expected = token === '--led' ? '--game-led' : `--game-${theme}-${token!.slice(2)}`
        expect(property).toBe(expected)
        expect(fallback, `${token} in ${theme}`).toBe(resolve(token!, themes[theme], palette))
      }
    }
  })

  it("draws Shelf's own colors exactly as theme.css does", () => {
    for (const theme of themeNames) {
      const own = readColorway('violet', theme)
      for (const token of own.keys()) {
        expect(resolve(token, own, palette), token).toBe(resolve(token, themes[theme], palette))
      }
    }
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

  const lit = [
    ...themeNames.map((theme) => ({ name: theme, theme, tokens: themes[theme] })),
    ...colorways.flatMap((colorway) =>
      themeNames.map((theme) => ({
        name: `${colorway}, ${theme}`,
        theme,
        tokens: readColorway(colorway, theme),
      })),
    ),
    ...colorways.map((colorway) => ({
      name: `${colorway}, pure black`,
      theme: 'dark' as const,
      tokens: readBlack(colorway),
    })),
  ]

  for (const { name, tokens } of lit) {
    const color = (token: string) => resolve(token, tokens, palette)

    describe(name, () => {
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
  const lit = [
    ...themeNames.map((theme) => ({ name: theme, theme, tokens: themes[theme] })),
    ...colorways.flatMap((colorway) =>
      themeNames.map((theme) => ({
        name: `${colorway}, ${theme}`,
        theme,
        tokens: readColorway(colorway, theme),
      })),
    ),
    ...colorways.map((colorway) => ({
      name: `${colorway}, pure black`,
      theme: 'dark' as const,
      tokens: readBlack(colorway),
    })),
  ]

  for (const { name, theme, tokens } of lit) {
    const share = Number(tokens.get('--led-strength')) * Number(tokens.get('--led-wash'))

    it.each(['--text', '--text-muted'])(
      `${name}: %s stays at 4.5:1 under any LED color`,
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
