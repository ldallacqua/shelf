import { describe, expect, it } from 'vitest'

import { cellFor, cellStillFits, fileFor } from './covers'

describe('the size a cover is drawn at', () => {
  it('fetches the smallest file at least as wide as the box on screen, as the 2D shelf does', () => {
    expect(fileFor(80)).toBe('cover_small')
    expect(fileFor(95)).toBe('cover_small_2x')
    expect(fileFor(180)).toBe('cover_small_2x')
    expect(fileFor(190)).toBe('cover_big')
    // Nothing larger is packed into the atlas: the pulled box has its own.
    expect(fileFor(400)).toBe('cover_big')
  })

  it('cuts cells the size the box is drawn, in the shape of a cover, within what a file holds', () => {
    expect(cellFor(166.4)).toEqual({ width: 166, height: 235 })
    expect(cellFor(10)).toEqual({ width: 48, height: 68 })
    expect(cellFor(600)).toEqual({ width: 264, height: 374 })
  })

  it('keeps its cells while they are no smaller, and not much larger, than needed', () => {
    expect(cellStillFits(166, 166)).toBe(true)
    expect(cellStillFits(166, 140)).toBe(true)
    // Grown: the covers would be stretched.
    expect(cellStillFits(166, 180)).toBe(false)
    // Shrunk by more than a quarter: the GPU would skip texels.
    expect(cellStillFits(166, 110)).toBe(false)
  })
})
