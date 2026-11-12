import { describe, expect, it } from 'vitest'

import { DEFAULT_PRESET, isPreset, presetNames } from './names'
import { colorsOf } from './derive'
import { parseOwnColorway, parseSeeds, presets } from './presets'

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
  it('keeps pastel when it is true, and only then', () => {
    const seeds = { accent: '#aabbcc', room: '#000000', led: '#ffffff' }
    expect(parseSeeds({ ...seeds, pastel: true })).toEqual({ ...seeds, pastel: true })
    expect(parseSeeds({ ...seeds, pastel: 'yes' })).toEqual(seeds)
  })

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

describe('parseOwnColorway', () => {
  const own = { seeds: presets.arcade, from: 'arcade', colors: colorsOf(presets.arcade) }

  it('takes one kept whole', () => {
    expect(parseOwnColorway(JSON.parse(JSON.stringify(own)))).toEqual(own)
  })

  it.each([
    ['nothing', null],
    ['no seeds', { ...own, seeds: undefined }],
    ['a preset it could not start from', { ...own, from: 'own' }],
    ['no colors', { ...own, colors: undefined }],
    [
      'a token missing',
      { ...own, colors: { ...own.colors, dark: { ...own.colors.dark, text: undefined } } },
    ],
    ['a color that is not one', { ...own, colors: { ...own.colors, led: 'url(x)' } }],
  ])('refuses one with %s', (_, value) => {
    expect(parseOwnColorway(value)).toBeUndefined()
  })
})
