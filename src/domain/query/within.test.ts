import { describe, expect, it } from 'vitest'

import { filterWithin } from './within'

describe('a filter within another', () => {
  it('is the filter alone when there is no other', () => {
    expect(filterWithin('genre:rpg')).toBe('genre:rpg')
    expect(filterWithin('genre:rpg', '  ')).toBe('genre:rpg')
  })

  it('joins both, each part once, in one order', () => {
    expect(filterWithin('genre:action', 'genre:rpg')).toBe('genre:action genre:rpg')
    expect(filterWithin('genre:rpg', 'genre:action')).toBe('genre:action genre:rpg')
    expect(filterWithin('status:completed year:2010..2019', 'genre:rpg')).toBe(
      'genre:rpg status:completed year:2010..2019',
    )
  })

  it('leads back to the page when the part is already there', () => {
    expect(filterWithin('genre:rpg', 'genre:action genre:rpg')).toBe('genre:action genre:rpg')
  })

  it('keeps a group joined by OR whole', () => {
    expect(filterWithin('genre:rpg', 'platform:pc OR platform:ps5')).toBe(
      'genre:rpg (platform:pc OR platform:ps5)',
    )
  })

  it('leaves out what the language does not understand, as the page did', () => {
    expect(filterWithin('genre:rpg', 'genre:action )')).toBe('genre:action genre:rpg')
  })

  it('ends, however long links are followed', () => {
    // The links a crawler followed: each genre on a wall filtered by the last.
    const genres = ['rpg', 'action', 'adventure', 'indie', 'strategy']
    const seen = new Set<string>()
    let q = ''
    for (let step = 0; step < 200; step += 1) {
      q = filterWithin(`genre:${genres[(step * 7) % genres.length]}`, q)
      seen.add(q)
    }
    expect(q).toBe('genre:action genre:adventure genre:indie genre:rpg genre:strategy')
    expect(seen.size).toBeLessThanOrEqual(genres.length)
  })
})
