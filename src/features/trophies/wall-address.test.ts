import { describe, expect, it } from 'vitest'

import { seenAnotherWay, wallAddress } from './wall-address'

describe('the trophy page’s address (issue 68)', () => {
  it('takes a year with something to finish in it, a filter, a ranking and a rarity', () => {
    expect(
      wallAddress({ year: '2025', q: ' genre:rpg ', by: 'hours', rarity: 'ultra' }, 2026),
    ).toEqual({
      scope: 2025,
      q: 'genre:rpg',
      by: 'hours',
      rarity: 'ultra',
    })
  })

  it('leaves out what it cannot use: a year out of reach, an empty filter, an unknown ranking or rarity', () => {
    expect(wallAddress({ year: '1969', q: '  ', by: 'fame', rarity: 'legendary' }, 2026)).toEqual(
      {},
    )
    expect(wallAddress({ year: '2028' }, 2026)).toEqual({})
    expect(wallAddress({ year: ['2025', '2024'], by: ['hours'] }, 2026)).toEqual({})
  })

  it('needs nothing for games finished, the page’s own ranking', () => {
    expect(wallAddress({ by: 'finished' }, 2026)).toEqual({})
  })

  it('keeps a long filter to the length the library takes', () => {
    expect(wallAddress({ q: 'a'.repeat(1200) }, 2026).q).toHaveLength(1000)
  })

  it('tells a year from the wall seen another way, which is not listed', () => {
    const at = (query: Record<string, string>) => seenAnotherWay(wallAddress(query, 2026))
    expect(at({})).toBe(false)
    expect(at({ year: '2025' })).toBe(false)
    expect(at({ year: '2025', by: 'finished' })).toBe(false)
    expect(at({ q: 'genre:rpg' })).toBe(true)
    expect(at({ year: '2025', by: 'hours' })).toBe(true)
    expect(at({ rarity: 'rare' })).toBe(true)
  })
})
