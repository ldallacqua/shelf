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

describe('its figures by time (issue 68)', () => {
  const library = testLibrary([
    finished('Hades', '2023-11-02', { minutes: 60 * 40 }),
    finished('Tunic', '2025-08-30', { minutes: 60 * 25 }),
    finished('Inside', '2025-08-03', { minutes: 60 * 4 }),
    finished('Limbo', '2025-09-12', { minutes: 60 * 3 }),
    finished('Celeste', '2025-10-01', { minutes: 60 * 9 }),
    finished('Okami'),
  ])
  const { stats } = trophyWall(library, 2026, 'en', { today: '2026-01-20' })

  it('counts each year from the first finished to this one, a year with none as nothing', () => {
    expect(stats.perYear).toEqual([
      { year: 2023, finished: 1 },
      { year: 2024, finished: 0 },
      { year: 2025, finished: 4 },
      { year: 2026, finished: 0 },
    ])
  })

  it('counts each month by year, the latest year first', () => {
    expect(stats.perMonth.map(({ year }) => year)).toEqual([2026, 2025, 2024, 2023])
    expect(stats.perMonth[1]!.months).toEqual([0, 0, 0, 0, 0, 0, 0, 2, 1, 1, 0, 0])
  })

  it('finds the longest run of months with a game finished, and the one still going', () => {
    expect(stats.streak.longest).toEqual({ months: 3, from: '2025-08', to: '2025-10' })
    // November had none: nothing runs into January.
    expect(stats.streak.current).toBe(0)
    const going = trophyWall(library, 2025, 'en', { today: '2025-11-05' }).stats
    // November has none yet, but is not over: the run up to October still counts.
    expect(going.streak.current).toBe(3)
  })

  it('keeps the records: the first, the quickest, the busiest month and year', () => {
    expect(stats.records.first).toEqual({ slug: 'hades', title: 'Hades', on: '2023-11-02' })
    expect(stats.records.quickest).toEqual({ slug: 'limbo', title: 'Limbo', minutes: 60 * 3 })
    expect(stats.records.bestMonth).toEqual({ month: '2025-08', finished: 2 })
    expect(stats.records.bestYear).toEqual({ year: 2025, finished: 4 })
    // Hades is both the longest finished and the longest played: said once.
    expect(stats.records.mostPlayed).toBeUndefined()
  })

  it('takes the middle of the finished games’ hours', () => {
    // 3, 4, 9, 25, 40 hours.
    expect(stats.medianMinutes).toBe(60 * 9)
  })

  it('is of one year’s games alone when asked, and the wall is of that year only', () => {
    const year = trophyWall(library, 2026, 'en', { scope: 2025 })
    expect(year.stats).toMatchObject({ scope: 2025, finished: 4, hours: 41 })
    expect(year.stats.finishedShare).toBeUndefined()
    expect(year.stats.longest).toMatchObject({ slug: 'tunic' })
    expect(year.stats.records.bestYear).toBeUndefined()
    expect(year.stats.perMonth.map(({ year: at }) => at)).toEqual([2025])
    // The years stay whole, so the year can be seen among the rest.
    expect(year.stats.perYear).toEqual(stats.perYear)
    expect(year.years.map(({ year: at }) => at)).toEqual([2025])
  })
})

describe('its rankings (issue 68)', () => {
  const genres = [
    { id: 12, name: 'RPG', slug: 'rpg' },
    { id: 31, name: 'Adventure', slug: 'adventure' },
    { id: 8, name: 'Platform', slug: 'platform' },
  ]
  const library = testLibrary(
    [
      finished('Hades', '2025-01-02', { minutes: 60 * 40, genres: [12, 31], ...ownedOn(6) }),
      finished('Tunic', '2025-02-02', { minutes: 60 * 25, genres: [31], ...ownedOn(167) }),
      finished('Celeste', '2025-03-02', { minutes: 60 * 9, genres: [8], ...ownedOn(6) }),
      finished('Okami', '2025-04-02', { minutes: 60 * 30, genres: [31], ...ownedOn(167) }),
      testGame('Returnal', { status: 'dropped', genres: [31] }),
      testGame('Outer Wilds', { status: 'playing', genres: [31] }),
      testGame('Balatro', { status: 'backlog', genres: [31] }),
    ],
    { genre: genres, platform: [ps5, pc] },
  )
  const { stats } = trophyWall(library, 2026)

  it('ranks the genres by games finished, then hours, with the share finished once enough began', () => {
    expect(stats.genres).toEqual([
      // Five adventures started, three finished; the backlog one was never started.
      { id: 31, name: 'Adventure', slug: 'adventure', finished: 3, minutes: 60 * 95, share: 3 / 5 },
      { id: 12, name: 'RPG', slug: 'rpg', finished: 1, minutes: 60 * 40 },
      { id: 8, name: 'Platform', slug: 'platform', finished: 1, minutes: 60 * 9 },
    ])
  })

  it('ranks the platforms by each game’s main copy, by the address the filter takes', () => {
    expect(stats.platforms.map(({ slug, finished: count }) => [slug, count])).toEqual([
      ['ps5', 2],
      ['pc', 2],
    ])
  })

  it('names the best-rated finish, the later one on a tie, and the oldest release', () => {
    const rated = trophyWall(
      testLibrary([
        finished('Hades', '2025-01-02', { rating: 90, year: 2020 }),
        finished('Tunic', '2025-06-02', { rating: 90, year: 2022 }),
        finished('Okami', '2024-06-02', { rating: 70, year: 2006 }),
      ]),
      2026,
    ).stats
    expect(rated.records.bestRated).toEqual({ slug: 'tunic', title: 'Tunic', rating: 90 })
    expect(rated.records.oldest).toEqual({ slug: 'okami', title: 'Okami', year: 2006 })
  })
})

describe('a filtered wall (issue 68)', () => {
  const switchPlatform = testPlatform(130, 'switch', 'nintendo', 'Nintendo Switch')
  const library = testLibrary(
    [
      finished('Hades', '2025-01-02', { minutes: 60 * 40, ...ownedOn(130) }),
      finished('Tunic', '2025-02-02', { minutes: 60 * 25, ...ownedOn(167) }),
      testGame('Celeste', { status: 'playing', minutes: 60 * 9, ...ownedOn(130) }),
    ],
    { platform: [switchPlatform, ps5] },
  )

  it('is of the games the filter matches, in the library’s filter language', () => {
    const wall = trophyWall(library, 2026, 'en', { q: 'owned:switch' })
    expect(wall.years.flatMap((year) => year.trophies).map(({ slug }) => slug)).toEqual(['hades'])
    expect(wall.stats).toMatchObject({ finished: 1, started: 2, hours: 49 })
  })

  it('leaves out what it cannot understand, as the library does', () => {
    expect(trophyWall(library, 2026, 'en', { q: 'nonsense:yes' }).stats.finished).toBe(2)
    expect(trophyWall(library, 2026, 'en', { q: '  ' }).stats.finished).toBe(2)
  })
})
