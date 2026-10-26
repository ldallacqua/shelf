import { describe, expect, it } from 'vitest'

import { emptyLibrary, type Library, type LibraryGame } from './library'
import { onlyReady, readySlugs } from './ready'

/** Ready to play (spec 7.7): what this computer can start, of my games. */

const games = [
  { slug: 'grim-dawn', entryId: 'e-grim', steam: ['219990'] },
  { slug: 'bloodborne', entryId: 'e-blood', steam: [] },
  { slug: 'skyrim', entryId: 'e-sky', steam: ['72850', '489830'] },
  { slug: 'hades', entryId: 'e-hades', steam: ['1145360'] },
]

describe('ready to play', () => {
  it('is a game with a file still there, or with any of its apps on Steam installed', () => {
    const here = { entries: ['e-blood', 'e-gone'], steam: ['489830', '10'] }
    expect([...readySlugs(games, here)].sort()).toEqual(['bloodborne', 'skyrim'])
  })

  it('is nothing on a computer with no file chosen and nothing of Steam’s', () => {
    expect(readySlugs(games, { entries: [], steam: [] }).size).toBe(0)
  })

  it('leaves only the ready games in the library, and the same library for the same two', () => {
    const library: Library = {
      ...emptyLibrary(4),
      games: games.map(({ slug }) => ({ slug }) as LibraryGame),
    }
    const ready = new Set(['skyrim'])
    const only = onlyReady(library, ready)
    expect(only.games.map((game) => game.slug)).toEqual(['skyrim'])
    expect(only.version).toBe(4)
    expect(onlyReady(library, ready)).toBe(only)
    expect(onlyReady(library, new Set(['hades']))).not.toBe(only)
  })
})
