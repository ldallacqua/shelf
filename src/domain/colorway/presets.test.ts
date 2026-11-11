import { describe, expect, it } from 'vitest'

import { DEFAULT_PRESET, isPreset, presetNames } from './names'
import { parseSeeds, presets } from './presets'

describe('presets', () => {
  it("starts with Shelf's own", () => {
    expect(presetNames[0]).toBe(DEFAULT_PRESET)
  })

  it('has seeds for every name, and no others', () => {
    expect(Object.keys(presets)).toEqual([...presetNames])
  })

  it('knows a preset by its name, and nothing else', () => {
    expect(isPreset('ocean')).toBe(true)
    for (const value of ['Ocean', 'mine', 'toString', '__proto__', '', null, 3]) {
      expect(isPreset(value)).toBe(false)
    }
  })
})

describe('parseSeeds', () => {
  it('takes three #rrggbb colors, in lower case', () => {
    expect(parseSeeds({ accent: '#AABBCC', room: '#000000', led: '#ffffff' })).toEqual({
      accent: '#aabbcc',
      room: '#000000',
      led: '#ffffff',
    })
  })

  it.each([
    null,
    'ocean',
    { accent: '#abc', room: '#000000', led: '#ffffff' },
    { accent: 'red', room: '#000000', led: '#ffffff' },
    { accent: '#aabbcc', room: '#000000' },
    { accent: '#aabbcc', room: '#000000', led: '#ffffff;}body{display:none' },
  ])('refuses %j', (value) => {
    expect(parseSeeds(value)).toBeUndefined()
  })
})
