import { describe, expect, it } from 'vitest'

import {
  colorValue,
  naturalSort,
  parseSort,
  sortGames,
  sortKeys,
  writeSort,
  type Sort,
} from '@/domain/library/sort'
import { testGame } from '@/domain/library/testing'

/** Spec 6: each sort gives the documented order, including ties and missing values. */

const games = [
  testGame('Celeste', {
    addedOn: '2023-01-05',
    releasedOn: '2018-01-25',
    rating: 90,
    igdbRating: 85,
    minutes: 900,
    completedOn: '2023-02-01',
    status: 'completed',
    length: 8 * 60,
    colors: ['#e0407a', '#2a2050', '#101018'],
  }),
  testGame('Astro Bot', {
    addedOn: '2024-09-06',
    releasedOn: '2024-09-06',
    rating: 90,
    igdbRating: 91,
    minutes: 700,
    completedOn: '2024-10-01',
    status: 'completed',
    length: 12 * 60,
    colors: ['#2f8cff', '#ffffff', '#101830'],
  }),
  testGame('The Witcher 3: Wild Hunt', {
    addedOn: '2023-01-05',
    releasedOn: '2015-05-19',
    igdbRating: 93,
    status: 'backlog',
    length: 50 * 60,
    colors: ['#c8a040', '#402810', '#181410'],
  }),
  testGame('Hollow Knight: Silksong', {
    addedOn: '2025-01-03',
    status: 'wishlist',
  }),
  testGame('Hades', {
    addedOn: '2022-11-11',
    releasedOn: '2020-09-17',
    rating: 95,
    igdbRating: 93,
    minutes: 3000,
    status: 'playing',
    length: 22 * 60,
    colors: ['#3a3a3a', '#202020', '#101010'],
  }),
]

const order = (sort: Partial<Sort> & { key: Sort['key'] }, locale = 'en', seed?: string) =>
  sortGames(games, { descending: false, ...sort }, locale, seed).map((game) => game.title)

describe('sorting (spec 6)', () => {
  it('title, A to Z and Z to A, ignoring a leading article', () => {
    expect(order({ key: 'title' })).toEqual([
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
    expect(order({ key: 'title', descending: true })).toEqual([
      'The Witcher 3: Wild Hunt',
      'Hollow Knight: Silksong',
      'Hades',
      'Celeste',
      'Astro Bot',
    ])
  })

  it('follows the language’s alphabet', () => {
    const accented = [testGame('Ábaco'), testGame('Abelha'), testGame('Zebra')]
    expect(
      sortGames(accented, { key: 'title', descending: false }, 'pt-BR').map((g) => g.title),
    ).toEqual(['Ábaco', 'Abelha', 'Zebra'])
  })

  it('date added, with ties broken by title', () => {
    expect(order({ key: 'added' })).toEqual([
      'Hades',
      'Celeste',
      'The Witcher 3: Wild Hunt',
      'Astro Bot',
      'Hollow Knight: Silksong',
    ])
    expect(order({ key: 'added', descending: true })).toEqual([
      'Hollow Knight: Silksong',
      'Astro Bot',
      'Celeste',
      'The Witcher 3: Wild Hunt',
      'Hades',
    ])
  })

  it('release date, with an unreleased game last both ways', () => {
    expect(order({ key: 'released' })).toEqual([
      'The Witcher 3: Wild Hunt',
      'Celeste',
      'Hades',
      'Astro Bot',
      'Hollow Knight: Silksong',
    ])
    expect(order({ key: 'released', descending: true })).toEqual([
      'Astro Bot',
      'Hades',
      'Celeste',
      'The Witcher 3: Wild Hunt',
      'Hollow Knight: Silksong',
    ])
  })

  it('my rating, unrated last both ways and ties by title', () => {
    expect(order({ key: 'rating', descending: true })).toEqual([
      'Hades',
      'Astro Bot',
      'Celeste',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
    expect(order({ key: 'rating' })).toEqual([
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
  })

  it('IGDB rating', () => {
    expect(order({ key: 'igdb', descending: true })).toEqual([
      'Hades',
      'The Witcher 3: Wild Hunt',
      'Astro Bot',
      'Celeste',
      'Hollow Knight: Silksong',
    ])
  })

  it('playtime, never played last both ways', () => {
    expect(order({ key: 'hours', descending: true })).toEqual([
      'Hades',
      'Celeste',
      'Astro Bot',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
    expect(order({ key: 'hours' })).toEqual([
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
  })

  it('completion date', () => {
    expect(order({ key: 'completed', descending: true })).toEqual([
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
  })

  it('status, in the order Playing, Backlog, Completed, Dropped, Wishlist', () => {
    expect(order({ key: 'status' })).toEqual([
      'Hades',
      'The Witcher 3: Wild Hunt',
      'Astro Bot',
      'Celeste',
      'Hollow Knight: Silksong',
    ])
  })

  it('time to beat, shortest first', () => {
    expect(order({ key: 'length' })).toEqual([
      'Celeste',
      'Astro Bot',
      'Hades',
      'The Witcher 3: Wild Hunt',
      'Hollow Knight: Silksong',
    ])
  })

  it('color: a rainbow by the cover’s main color, grays after, no cover last', () => {
    expect(order({ key: 'color' })).toEqual([
      'The Witcher 3: Wild Hunt',
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
    ])
    expect(colorValue({ colors: ['#ff0000', '#000000', '#000000'] })).toBe(0)
    expect(colorValue({ colors: ['#808080', '#000000', '#000000'] })).toBeGreaterThan(360)
    expect(colorValue({})).toBeUndefined()
  })

  it('surprise me: the same seed gives the same order, whatever order the games came in', () => {
    const first = order({ key: 'random' }, 'en', 'k3x9')
    const reversed = sortGames(
      [...games].reverse(),
      { key: 'random', descending: false },
      'en',
      'k3x9',
    )
    expect(reversed.map((game) => game.title)).toEqual(first)
    expect(order({ key: 'random' }, 'en', 'k3x9')).toEqual(first)
    const others = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) =>
      order({ key: 'random' }, 'en', seed).join(),
    )
    expect(new Set(others).size).toBeGreaterThan(1)
  })
})

describe('the sort in the address', () => {
  it('reads and writes a key with its direction', () => {
    expect(parseSort('-rating')).toEqual({ key: 'rating', descending: true })
    expect(parseSort('title')).toEqual({ key: 'title', descending: false })
    expect(writeSort({ key: 'added', descending: true })).toBe('-added')
    for (const key of sortKeys) {
      for (const descending of [false, true]) {
        const sort = { key, descending: key === 'random' ? false : descending }
        expect(parseSort(writeSort(sort))).toEqual(sort)
      }
    }
  })

  it('falls back to title for anything it does not know', () => {
    expect(parseSort(undefined)).toEqual({ key: 'title', descending: false })
    expect(parseSort('--rating')).toEqual({ key: 'title', descending: false })
    expect(parseSort('popularity')).toEqual({ key: 'title', descending: false })
  })

  it('starts each key the way a person usually wants it', () => {
    expect(naturalSort('title')).toEqual({ key: 'title', descending: false })
    expect(naturalSort('added')).toEqual({ key: 'added', descending: true })
    expect(naturalSort('rating')).toEqual({ key: 'rating', descending: true })
    expect(naturalSort('length')).toEqual({ key: 'length', descending: false })
  })
})
