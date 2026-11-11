import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ledWash } from '@/domain/colorway/derive'
import { presetNames } from '@/domain/colorway/presets'
import { readTheme } from '@/ui/tokens/read-tokens'

import { colorsOfPreset, colorwaysCss } from './colorways-css'
import { colorwayWall } from './theme'

describe('colorways.css', () => {
  it('is what the presets make: run pnpm tokens:colorways after changing one', () => {
    const file = readFileSync(new URL('../../ui/tokens/colorways.css', import.meta.url), 'utf8')
    expect(file.replace(/\r\n/g, '\n')).toBe(colorwaysCss())
  })
})

describe('colorwayWall', () => {
  it.each(presetNames)("keeps the browser's own chrome the color of %s's wall", (name) => {
    const colors = colorsOfPreset(name)
    expect(colorwayWall[name]).toEqual({ light: colors.light.wall, dark: colors.dark.wall })
  })
})

describe('ledWash', () => {
  it.each(['light', 'dark'] as const)('is how strongly the LED washes the %s walls', (theme) => {
    const tokens = readTheme(theme)
    expect(ledWash[theme].share).toBeCloseTo(
      Number(tokens.get('--led-strength')) * Number(tokens.get('--led-wash')),
      6,
    )
  })
})
