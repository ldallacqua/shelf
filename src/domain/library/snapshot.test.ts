import { describe, expect, it } from 'vitest'

import { emptyLibrary, type Library, type LibraryGame } from '@/domain/library/library'
import {
  dayToNumber,
  decodeLibrary,
  encodeLibrary,
  numberToDay,
  SNAPSHOT_FORMAT,
  SnapshotFormatError,
  type SnapshotFile,
} from '@/domain/library/snapshot'
import { testGame, testLibrary } from '@/domain/library/testing'
import { statuses } from '@/domain/library/values'

const full: LibraryGame = {
  slug: 'the-elder-scrolls-v-skyrim',
  title: 'The Elder Scrolls V: Skyrim',
  status: 'completed',
  rating: 90,
  addedOn: '2021-03-04',
  completedOn: '2021-06-30',
  minutes: 6400,
  releasedOn: '2011-11-10',
  year: 2011,
  igdbRating: 84,
  igdbRatingCount: 4364,
  length: 6407,
  kind: 'main',
  cover: 'co1tnw',
  coverRatio: 75,
  colors: ['#74bddb', '#9d7d61', '#2c231c'],
  hash: '3/cJPQyYeI93qIenaYJXl3eAZgdo',
  featured: true,
  hasNotes: true,
  copies: [
    { platform: 6, format: 'digital' },
    { platform: 130, format: 'physical', cover: 'co2abc' },
  ],
  genres: [12, 31],
  themes: [1, 17],
  modes: [1],
  perspectives: [1, 2],
  platforms: [6, 9, 12, 130],
  franchises: [456],
  series: [6],
  developers: [80],
  publishers: [80],
  tags: [0, 2],
}

/** A game with nothing optional: a wishlist entry IGDB knows little about. */
const bare: LibraryGame = {
  slug: 'unknown-game',
  title: 'Unknown Game',
  status: 'wishlist',
  addedOn: '2026-01-01',
  minutes: 0,
  igdbRatingCount: 0,
  kind: 'other',
  featured: false,
  hasNotes: false,
  copies: [],
  genres: [],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [],
  franchises: [],
  series: [],
  developers: [],
  publishers: [],
  tags: [],
}

const library: Library = {
  version: 42,
  games: [full, bare],
  names: {
    ...emptyLibrary().names,
    genre: [{ id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }],
    company: [{ id: 80, name: 'Bethesda Game Studios', slug: 'bethesda-game-studios' }],
    platform: [
      {
        id: 130,
        key: 'switch',
        name: 'Nintendo Switch',
        short: 'Switch',
        family: 'nintendo',
        generation: 8,
        shape: 'switch',
        plastic: 'red',
      },
      {
        id: 6,
        key: 'pc',
        name: 'PC',
        short: 'PC',
        family: 'pc',
        shape: 'keepCase',
        plastic: 'black',
      },
    ],
    tag: [
      { name: '100%', slug: '100' },
      { name: 'comfort game', slug: 'comfort-game' },
      { name: 'replay someday', slug: 'replay-someday' },
    ],
  },
}

describe('the library file', () => {
  it('survives a round trip unchanged', () => {
    expect(decodeLibrary(encodeLibrary(library))).toEqual(library)
  })

  it('survives being sent as JSON', () => {
    const sent = JSON.parse(JSON.stringify(encodeLibrary(library))) as SnapshotFile
    expect(decodeLibrary(sent)).toEqual(library)
  })

  it('keeps a rating of zero apart from no rating', () => {
    const zero = { ...full, rating: 0 }
    const [decoded] = decodeLibrary(encodeLibrary({ ...library, games: [zero] })).games
    expect(decoded?.rating).toBe(0)
    expect(decodeLibrary(encodeLibrary({ ...library, games: [bare] })).games[0]).not.toHaveProperty(
      'rating',
    )
  })

  it('carries its format and the library version', () => {
    const file = encodeLibrary(library)
    expect(file.format).toBe(SNAPSHOT_FORMAT)
    expect(file.version).toBe(42)
  })

  it('carries the platforms a wishlist game is wanted on, last, and only when there are any', () => {
    const wished = { ...bare, status: 'wishlist' as const, wanted: [130, 6] }
    const file = encodeLibrary({ ...library, games: [wished, bare] })
    expect(decodeLibrary(file).games).toEqual([wished, bare])
    expect(file.games[0]).toHaveLength(29)
    expect(file.games[1]).toHaveLength(28)
  })

  it('carries each board’s age rating, as positions after the wishlist’s platforms (spec 5.1)', () => {
    const rated = { ...bare, ages: ['esrb-m', 'pegi-18'] }
    const wished = { ...rated, status: 'wishlist' as const, wanted: [130] }
    const file = encodeLibrary({ ...library, games: [rated, wished, bare] })
    expect(decodeLibrary(file).games).toEqual([rated, wished, bare])
    // Positions in the list, not words; an empty wishlist's place kept before them.
    expect(file.games[0]?.[28]).toEqual([])
    expect(file.games[0]?.[29]).toEqual([expect.any(Number), expect.any(Number)])
    expect(file.games[2]).toHaveLength(28)
  })

  it('carries IGDB’s hasty time last, after empty places for the wishlist and the ages', () => {
    const hasty = { ...bare, length: 1200, hastyShare: 75 }
    const file = encodeLibrary({ ...library, games: [hasty, bare] })
    expect(decodeLibrary(file).games).toEqual([hasty, bare])
    expect(file.games[0]?.slice(28)).toEqual([[], [], 75])
    // A file from before it reads as it always did.
    expect(file.games[1]).toHaveLength(28)
  })

  it('carries that a game is for adults (spec 3.13)', () => {
    const adult = { ...bare, adult: true as const }
    expect(decodeLibrary(encodeLibrary({ ...library, games: [adult, bare] })).games).toEqual([
      adult,
      bare,
    ])
  })

  it('carries that a game is only its owner’s (spec 11.1)', () => {
    const hidden = { ...bare, private: true as const }
    expect(decodeLibrary(encodeLibrary({ ...library, games: [hidden, bare] })).games).toEqual([
      hidden,
      bare,
    ])
  })

  it('numbers each status as it always has, a new one after the rest', () => {
    const codes = statuses.map((status) => {
      const file = encodeLibrary({ ...library, games: [{ ...bare, status }] })
      expect(decodeLibrary(file).games[0]?.status).toBe(status)
      return [status, file.games[0]?.[2]]
    })
    expect(Object.fromEntries(codes)).toEqual({
      playing: 0,
      backlog: 1,
      completed: 2,
      dropped: 3,
      wishlist: 4,
      unsorted: 5,
      someday: 6,
      retired: 7,
    })
  })

  it('writes games as rows, with no field names repeated per game', () => {
    const text = JSON.stringify(encodeLibrary(library).games)
    expect(text).not.toContain('"title"')
    expect(text).not.toContain('"status"')
  })

  it('refuses a file in another format', () => {
    const file = { ...encodeLibrary(library), format: SNAPSHOT_FORMAT + 1 }
    expect(() => decodeLibrary(file)).toThrow(SnapshotFormatError)
  })

  it('encodes an empty library', () => {
    expect(decodeLibrary(encodeLibrary(emptyLibrary(7)))).toEqual(emptyLibrary(7))
  })
})

describe('days as numbers', () => {
  it.each(['1970-01-01', '1985-09-13', '2000-02-29', '2026-10-13'])('round-trips %s', (day) => {
    expect(numberToDay(dayToNumber(day))).toBe(day)
  })

  it('counts whole days since 1970', () => {
    expect(dayToNumber('1970-01-02')).toBe(1)
    expect(dayToNumber('1969-12-31')).toBe(-1)
  })
})

describe('stores in the library file', () => {
  const round = (game: LibraryGame) =>
    decodeLibrary(JSON.parse(JSON.stringify(encodeLibrary(testLibrary([game]))))).games[0]!

  it('keeps which store a copy is from, with or without a cover of its own', () => {
    const game = testGame('A', {
      copies: [
        { platform: 6, format: 'digital', stores: ['steam', 'gog'] },
        { platform: 14, format: 'digital', cover: 'co1', stores: ['battlenet'] },
        { platform: 130, format: 'physical' },
      ],
    })
    expect(round(game).copies).toEqual(game.copies)
  })

  it('keeps which store I would buy it from, whatever else the row has', () => {
    const game = testGame('A', { status: 'wishlist', wanted: [6], wantedStores: ['epic'] })
    const back = round(game)
    expect(back.wanted).toEqual([6])
    expect(back.wantedStores).toEqual(['epic'])
    expect(back.hastyShare).toBeUndefined()
  })

  it('writes nothing for a game with no store', () => {
    const file = encodeLibrary(
      testLibrary([testGame('A', { copies: [{ platform: 6, format: 'digital' }] })]),
    )
    expect(file.games[0]).toHaveLength(28)
    expect(file.games[0]![17]).toEqual([[6, 1]])
  })
})
