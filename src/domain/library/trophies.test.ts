import { describe, expect, it } from 'vitest'

import { ownedOn, testGame, testLibrary, testPlatform } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'

const ps5 = testPlatform(167, 'ps5', 'playstation', 'PlayStation 5')
const pc = testPlatform(6, 'pc', 'pc', 'PC')

const finished = (title: string, completedOn?: string, extra = {}) =>
  testGame(title, { status: 'completed', completedOn, ...extra })

describe('the trophy wall', () => {
  it('holds every finished game, by the year it was finished, newest first', () => {
    const wall = trophyWall(
      testLibrary([
        finished('Hades', '2024-03-02'),
        testGame('Celeste', { status: 'playing' }),
        finished('Inside', '2026-01-15'),
        finished('Tunic', '2026-08-30'),
        finished('Limbo', '2024-11-20'),
        testGame('Returnal', { status: 'dropped' }),
      ]),
      2026,
    )

    expect(wall.years.map(({ year }) => year)).toEqual([2026, 2024])
    expect(wall.years[0]!.trophies.map(({ title }) => title)).toEqual(['Tunic', 'Inside'])
    expect(wall.years[1]!.trophies.map(({ title }) => title)).toEqual(['Limbo', 'Hades'])
  })

  it('puts a game finished on an unrecorded day last, in title order', () => {
    const wall = trophyWall(
      testLibrary([finished('Tunic'), finished('Hades', '2025-05-05'), finished('Celeste')]),
      2026,
    )

    expect(wall.years.map(({ year }) => year)).toEqual([2025, undefined])
    expect(wall.years[1]!.trophies.map(({ title }) => title)).toEqual(['Celeste', 'Tunic'])
  })

  it('orders games finished on the same day by title', () => {
    const wall = trophyWall(
      testLibrary([finished('Tunic', '2025-05-05'), finished('Hades', '2025-05-05')]),
      2026,
    )
    expect(wall.years[0]!.trophies.map(({ title }) => title)).toEqual(['Hades', 'Tunic'])
  })

  it('is empty when nothing is finished', () => {
    const wall = trophyWall(testLibrary([testGame('Celeste', { status: 'playing' })]), 2026)
    expect(wall.years).toEqual([])
    expect(wall.stats.finished).toBe(0)
  })
})

describe('its stats', () => {
  const library = testLibrary(
    [
      finished('Hades', '2026-03-02', { minutes: 60 * 40, rating: 90, ...ownedOn(6) }),
      finished('Tunic', '2025-08-30', { minutes: 60 * 25 + 50, rating: 70, ...ownedOn(167) }),
      finished('Inside', '2026-01-15', { minutes: 60 * 4, ...ownedOn(167) }),
      testGame('Celeste', { status: 'playing', minutes: 60 * 12, rating: 80, ...ownedOn(167) }),
      testGame('Returnal', { status: 'dropped', minutes: 60 * 3 }),
      testGame('Balatro', { status: 'backlog' }),
      testGame('Bloodborne', { status: 'wishlist' }),
    ],
    { platform: [ps5, pc] },
  )
  const { stats } = trophyWall(library, 2026)

  it('counts games finished, in all and this year', () => {
    expect(stats.finished).toBe(3)
    expect(stats.thisYear).toBe(2)
    expect(stats.year).toBe(2026)
  })

  it('adds up hours played across the whole library', () => {
    // 40 + 25:50 + 4 + 12 + 3 = 84:50, in whole hours.
    expect(stats.hours).toBe(84)
  })

  it('averages every rating given, finished or not', () => {
    expect(stats.averageRating).toBe(80)
  })

  it('says what share of the games started were finished', () => {
    // Started: the three finished, one playing, one dropped. Backlog and wishlist are not started.
    expect(stats.finishedShare).toBeCloseTo(3 / 5)
  })

  it('names the finished game played longest', () => {
    expect(stats.longest).toEqual({ slug: 'hades', title: 'Hades', minutes: 60 * 40 })
  })

  it('names the platform played most, by the hours on each game’s main copy', () => {
    // PS5: 25:50 + 4 + 12 = 41:50; PC: 40.
    expect(stats.platform).toEqual({ id: 167, name: 'PlayStation 5', minutes: 60 * 41 + 50 })
  })

  it('leaves out what it cannot know', () => {
    const { stats: none } = trophyWall(
      testLibrary([testGame('Balatro', { status: 'backlog' }), finished('Inside', '2026-01-15')]),
      2026,
    )
    expect(none.averageRating).toBeUndefined()
    expect(none.longest).toBeUndefined()
    expect(none.platform).toBeUndefined()
    expect(none.finishedShare).toBe(1)

    const { stats: unstarted } = trophyWall(testLibrary([testGame('Balatro')]), 2026)
    expect(unstarted.finishedShare).toBeUndefined()
  })

  it('works its stats out without adult games too, and marks their trophies (spec 3.13)', () => {
    const adult = finished('Lula', '2026-02-01', { minutes: 60 * 9, rating: 20, adult: true })
    const wall = trophyWall(testLibrary([...library.games, adult], { platform: [ps5, pc] }), 2026)
    expect(wall.stats.finished).toBe(stats.finished + 1)
    expect(wall.hidden).toEqual(stats)
    expect(
      wall.years.flatMap((year) => year.trophies).find((trophy) => trophy.slug === 'lula'),
    ).toMatchObject({ adult: true })
    expect(trophyWall(library, 2026).hidden).toBeUndefined()
  })

  it('counts a retired game’s hours, and it in nothing finished (spec 3.12)', () => {
    const endless = testGame('Path of Exile', { status: 'retired', minutes: 60 * 200, rating: 80 })
    const someday = testGame('Okami', { status: 'someday' })
    const { stats: more, years } = trophyWall(
      testLibrary([...library.games, endless, someday], { platform: [ps5, pc] }),
      2026,
    )
    expect(more.hours).toBe(stats.hours + 200)
    expect(more.finished).toBe(stats.finished)
    // It had no end to reach: the share of started games finished is as it was.
    expect(more.finishedShare).toBeCloseTo(3 / 5)
    expect(more.longest).toEqual(stats.longest)
    expect(years.flatMap((year) => year.trophies).map((trophy) => trophy.slug)).not.toContain(
      'path-of-exile',
    )
  })
})
