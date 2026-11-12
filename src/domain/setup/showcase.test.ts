import { describe, expect, it } from 'vitest'

import { ownedOn, testGame, testLibrary, testPlatform } from '@/domain/library/testing'

import { showcaseOf } from './showcase'

const SWITCH = {
  ...testPlatform(130, 'switch', 'nintendo'),
  shape: 'switch' as const,
  plastic: 'red' as const,
}

describe('the games setting a shelf up shows', () => {
  it('are the ones most played, then the latest added, each in its first copy’s case', () => {
    const library = testLibrary(
      [
        testGame('Hades', { cover: 'hades', minutes: 4000, ...ownedOn(130) }),
        testGame('Celeste', { cover: 'celeste', minutes: 300 }),
        testGame('Tunic', { cover: 'tunic', addedOn: '2026-11-12' }),
        testGame('Inside', { cover: 'inside', addedOn: '2025-01-01' }),
      ],
      { platform: [SWITCH] },
    )
    const shown = showcaseOf(library, 3)
    expect(shown.map((game) => game.title)).toEqual(['Hades', 'Celeste', 'Tunic'])
    expect(shown[0]).toMatchObject({ cover: 'hades', shape: 'switch', plastic: 'red' })
    expect(shown[1]).toMatchObject({ shape: 'keepCase', plastic: 'black' })
  })

  it('leaves out a game with no cover, a wish and a game for adults', () => {
    const library = testLibrary([
      testGame('No cover'),
      testGame('Wished', { cover: 'wished', status: 'wishlist' }),
      testGame('For adults', { cover: 'adult', adult: true }),
      testGame('Owned', { cover: 'owned' }),
    ])
    expect(showcaseOf(library, 10).map((game) => game.title)).toEqual(['Owned'])
  })

  it('is nothing for an empty shelf', () => {
    expect(showcaseOf(testLibrary([]), 8)).toEqual([])
  })
})
