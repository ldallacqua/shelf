import { describe, expect, it } from 'vitest'

import { testGame, testLibrary, testPlatform } from '@/domain/library/testing'

import { daysBetween, factsOf, isMeasured } from './facts'
import { countsOf, poolOf } from './pool'

const names = testLibrary([], {
  genre: [
    { id: 1, name: 'Platform', slug: 'platform' },
    { id: 2, name: 'Indie', slug: 'indie' },
    { id: 3, name: 'Adventure', slug: 'adventure' },
    { id: 4, name: 'Puzzle', slug: 'puzzle' },
  ],
  mode: [{ id: 1, name: 'Single player', slug: 'single-player' }],
  platform: [testPlatform(6, 'pc', 'pc', 'PC'), testPlatform(130, 'switch', 'nintendo', 'Switch')],
}).names

const celeste = testGame('Celeste', {
  length: 8 * 60,
  hastyShare: 50,
  igdbRating: 90,
  igdbRatingCount: 400,
  addedOn: '2024-01-01',
  year: 2018,
  genres: [1, 2, 3, 4],
  modes: [1],
  copies: [{ platform: 130, format: 'digital' }],
})
const hades = testGame('Hades', {
  length: 24 * 60,
  addedOn: '2025-01-01',
  minutes: 90,
  copies: [{ platform: 6, format: 'digital' }],
})

describe('factsOf', () => {
  const facts = factsOf([celeste, hades], names, '2026-01-01')
  const fact = (key: string) => facts.find((each) => each.key === key)

  it('sets the rows in their order, leaving out what neither game has', () => {
    expect(facts.map(({ key }) => key)).toEqual([
      'length',
      'score',
      'waiting',
      'played',
      'released',
      'platforms',
      'genres',
      'modes',
    ])
  })

  it('draws each measured row’s bars as shares of the larger side', () => {
    expect(fact('length')).toMatchObject({
      values: [{ minutes: 480, hasty: 240 }, { minutes: 1440 }],
      shares: [1 / 3, 1],
    })
    expect(fact('waiting')).toMatchObject({ values: [{ days: 731 }, { days: 365 }] })
    expect(fact('played')).toMatchObject({ values: [undefined, { minutes: 90 }], shares: [0, 1] })
  })

  it('draws a score against its whole scale, and leaves a side without one empty', () => {
    expect(fact('score')).toMatchObject({
      values: [{ rating: 90, count: 400 }, undefined],
      shares: [0.9, 0],
    })
  })

  it('names platforms, genres and modes, three genres at most', () => {
    expect(fact('platforms')?.values).toEqual([
      { owned: [{ platform: 'Switch', format: 'digital' }] },
      { owned: [{ platform: 'PC', format: 'digital' }] },
    ])
    expect(fact('genres')?.values[0]).toEqual({ names: ['Platform', 'Indie', 'Adventure'] })
    expect(fact('modes')?.values).toEqual([{ names: ['Single player'] }, undefined])
  })

  it('tells measured rows from described ones', () => {
    expect(facts.filter(isMeasured).map(({ key }) => key)).toEqual([
      'length',
      'score',
      'waiting',
      'played',
    ])
  })

  it('says where a wished-for game is wanted, in the same row as where the other is owned', () => {
    const wished = testGame('Silksong', { status: 'wishlist', wanted: [130] })
    const wishes = factsOf([wished, hades], names, '2026-01-01')
    expect(wishes.find(({ key }) => key === 'platforms')?.values).toEqual([
      { wanted: ['Switch'] },
      { owned: [{ platform: 'PC', format: 'digital' }] },
    ])
  })
})

describe('daysBetween', () => {
  it('counts whole calendar days, never fewer than none', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30)
    expect(daysBetween('2026-02-01', '2026-01-01')).toBe(0)
  })
})

describe('poolOf', () => {
  const library = testLibrary([
    testGame('Zelda', { status: 'backlog' }),
    testGame('ape out', { status: 'someday' }),
    testGame('Doom', { status: 'completed' }),
    testGame('Erotica', { status: 'backlog', adult: true }),
  ])

  it('keeps the games with the chosen statuses, by title', () => {
    expect(poolOf(library, ['backlog', 'someday'], false, 'en').map(({ title }) => title)).toEqual([
      'ape out',
      'Erotica',
      'Zelda',
    ])
  })

  it('leaves out games for adults while the device hides them', () => {
    expect(poolOf(library, ['backlog'], true, 'en').map(({ title }) => title)).toEqual(['Zelda'])
    expect(countsOf(library, true)).toEqual({ backlog: 1, someday: 1, completed: 1 })
  })
})
