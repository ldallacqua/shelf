import { describe, expect, it } from 'vitest'

import {
  extractPalette,
  fromHex,
  fromHsl,
  isHex,
  ledFrom,
  NEUTRAL_PALETTE,
  toHex,
  toHsl,
  type Rgb,
} from '@/domain/color/palette'

/** An image of flat color areas: `[color, how many pixels]`. */
const image = (...areas: [Rgb, number][]): Uint8Array => {
  const bytes: number[] = []
  for (const [[r, g, b], count] of areas) {
    for (let i = 0; i < count; i += 1) bytes.push(r, g, b, 255)
  }
  return new Uint8Array(bytes)
}

const NAVY: Rgb = [16, 24, 64]
const ORANGE: Rgb = [240, 120, 20]
const WHITE: Rgb = [245, 245, 245]

describe('hex and HSL', () => {
  it('round-trips a color through hex', () => {
    expect(toHex(fromHex('#7c5cff'))).toBe('#7c5cff')
    expect(toHex([0, 128, 255])).toBe('#0080ff')
  })

  it('round-trips a color through HSL', () => {
    for (const color of [NAVY, ORANGE, WHITE, [0, 0, 0] as Rgb, [12, 200, 90] as Rgb]) {
      expect(toHex(fromHsl(toHsl(color)))).toBe(toHex(color))
    }
  })

  it('recognizes a six-digit hex color and nothing else', () => {
    expect(isHex('#a1B2c3')).toBe(true)
    expect(isHex('#abc')).toBe(false)
    expect(isHex('red')).toBe(false)
    expect(isHex(undefined)).toBe(false)
  })
})

describe('extractPalette', () => {
  it('names the largest area as the base', () => {
    const [, , base] = extractPalette(image([NAVY, 700], [ORANGE, 200], [WHITE, 100]))
    expect(base).toBe(toHex(NAVY))
  })

  it('names the most colorful sizeable area as the accent', () => {
    const [accent] = extractPalette(image([NAVY, 700], [ORANGE, 200], [WHITE, 100]))
    expect(accent).toBe(toHex(ORANGE))
  })

  it('does not let a speck of bright color become the accent', () => {
    const speck: Rgb = [255, 0, 0]
    const teal: Rgb = [20, 150, 140]
    const [accent] = extractPalette(image([NAVY, 780], [teal, 215], [speck, 5]))
    expect(accent).toBe(toHex(teal))
  })

  it('picks a second color that is neither of the other two', () => {
    const [accent, second, base] = extractPalette(image([NAVY, 600], [ORANGE, 200], [WHITE, 200]))
    expect(second).toBe(toHex(WHITE))
    expect(new Set([accent, second, base]).size).toBe(3)
  })

  it('ignores transparent pixels', () => {
    const bytes = new Uint8Array([255, 0, 0, 0, ...Array.from(image([NAVY, 10]))])
    expect(extractPalette(bytes)[2]).toBe(toHex(NAVY))
  })

  it('answers with neutral grays when there is nothing to read', () => {
    expect(extractPalette(new Uint8Array(0))).toEqual(NEUTRAL_PALETTE)
    expect(extractPalette(new Uint8Array([0, 0, 0, 0]))).toEqual(NEUTRAL_PALETTE)
  })

  it('always returns three hex colors', () => {
    for (const colors of [extractPalette(image([NAVY, 3])), extractPalette(image([WHITE, 500]))]) {
      expect(colors).toHaveLength(3)
      for (const color of colors) expect(isHex(color)).toBe(true)
    }
  })

  it('gives the same answer for the same pixels', () => {
    const pixels = image([NAVY, 300], [ORANGE, 300], [WHITE, 300])
    expect(extractPalette(pixels)).toEqual(extractPalette(pixels))
  })
})

describe('ledFrom', () => {
  it('keeps the hue and makes the color bright enough to be light', () => {
    const [hueIn] = toHsl(fromHex('#5a1010'))
    const [hueOut, saturation, lightness] = toHsl(fromHex(ledFrom('#5a1010')))
    expect(Math.abs(hueOut - hueIn)).toBeLessThan(3)
    expect(saturation).toBeGreaterThanOrEqual(0.7)
    expect(lightness).toBeGreaterThanOrEqual(0.55)
    expect(lightness).toBeLessThanOrEqual(0.67)
  })

  it('tones down a color that is too pale to read as colored light', () => {
    const [, , lightness] = toHsl(fromHex(ledFrom('#ffe0e0')))
    expect(lightness).toBeLessThanOrEqual(0.67)
  })

  it('gives a gray cover a cool white light', () => {
    expect(ledFrom('#808080')).toBe('#cdd5ff')
    expect(ledFrom('#101010')).toBe('#cdd5ff')
  })
})
