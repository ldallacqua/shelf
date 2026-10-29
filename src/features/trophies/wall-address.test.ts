import { describe, expect, it } from 'vitest'

import { wallAddress } from './wall-address'

describe('the trophy page’s address (issue 68)', () => {
  it('takes a year with something to finish in it, a filter and a ranking', () => {
    expect(wallAddress({ year: '2025', q: ' genre:rpg ', by: 'hours' }, 2026)).toEqual({
      scope: 2025,
      q: 'genre:rpg',
      by: 'hours',
    })
  })

  it('leaves out what it cannot use: a year out of reach, an empty filter, an unknown ranking', () => {
    expect(wallAddress({ year: '1969', q: '  ', by: 'fame' }, 2026)).toEqual({})
    expect(wallAddress({ year: '2028' }, 2026)).toEqual({})
    expect(wallAddress({ year: ['2025', '2024'], by: ['hours'] }, 2026)).toEqual({})
  })

  it('needs nothing for games finished, the page’s own ranking', () => {
    expect(wallAddress({ by: 'finished' }, 2026)).toEqual({})
  })

  it('keeps a long filter to the length the library takes', () => {
    expect(wallAddress({ q: 'a'.repeat(1200) }, 2026).q).toHaveLength(1000)
  })
})
