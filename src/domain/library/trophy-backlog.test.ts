import { describe, expect, it } from 'vitest'

import { backlogOf, BACKLOG_RANKED, BACKLOG_SHOWN } from './trophy-backlog'
import { trophyWall } from './trophies'
import { testGame, testLibrary, testPlatform } from './testing'

/** The trophy page's backlog (issue 68): what is still to play, how long it is, and how soon it could go. */

const ps5 = testPlatform(167, 'ps5', 'playstation', 'PlayStation 5')
const pc = testPlatform(6, 'pc', 'pc', 'PC')
const names = {
  genre: [
    { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
    { id: 31, name: 'Adventure', slug: 'adventure' },
  ],
  platform: [ps5, pc],
}
const hours = (count: number) => count * 60

const library = testLibrary(
  [
    testGame('Elden Ring', {
      length: hours(60),
      minutes: hours(10),
      igdbRating: 95,
      igdbRatingCount: 400,
      year: 2022,
      releasedOn: '2022-02-25',
      genres: [12],
      copies: [{ platform: 167, format: 'digital' }],
    }),
    testGame('Inside', {
      length: hours(4),
      igdbRating: 88,
      igdbRatingCount: 300,
      year: 2016,
      genres: [31],
      copies: [{ platform: 6, format: 'digital' }],
    }),
    // Played past IGDB's time: no end it can say, so not among the quickest.
    testGame('Vampire Survivors', { length: hours(15), minutes: hours(40), year: 2022 }),
    // No time on IGDB: in the backlog, out of the estimate.
    testGame('Outer Wilds', { year: 2019, igdbRating: 90, igdbRatingCount: 5, genres: [31] }),
    testGame('Okami', {
      status: 'someday',
      length: hours(35),
      igdbRating: 91,
      igdbRatingCount: 200,
      year: 2006,
      releasedOn: '2006-04-20',
      genres: [31],
      copies: [
        { platform: 167, format: 'digital' },
        { platform: 167, format: 'physical' },
      ],
    }),
    testGame('Hades', {
      status: 'completed',
      completedOn: '2026-03-02',
      minutes: hours(50),
    }),
    testGame('Celeste', {
      status: 'completed',
      completedOn: '2026-08-10',
      minutes: hours(25),
    }),
    // Finished more than twelve months ago: not the pace.
    testGame('Portal', { status: 'completed', completedOn: '2025-06-30', minutes: hours(5) }),
    testGame('Tunic', { status: 'unsorted', length: hours(12) }),
    testGame('Hollow Knight', { status: 'playing', length: hours(30) }),
  ],
  names,
)

describe('the trophy page’s backlog (issue 68)', () => {
  it('counts the backlog and Someday, and the unsorted apart from both', () => {
    const backlog = backlogOf(library, '2026-10-29')!
    expect(backlog).toMatchObject({ backlog: 4, someday: 1, unsorted: 1, begun: 2 })
  })

  it('estimates the hours left from IGDB’s times, less those played, of the games it has times for', () => {
    const backlog = backlogOf(library, '2026-10-29')!
    // Elden Ring 50, Inside 4, Vampire Survivors none past its time; Outer Wilds has no time.
    expect(backlog.left).toBe(hours(54))
    expect(backlog.timed).toBe(3)
  })

  it('estimates the months to clear it at the hours of the games finished in the last twelve', () => {
    const backlog = backlogOf(library, '2026-10-29')!
    // 75 hours finished in the twelve months to today; 54 left is under nine months of them.
    expect(backlog.pace).toBe(hours(75))
    expect(backlog.months).toBe(9)
    expect(backlogOf(library)!.months).toBeUndefined()
    const idle = testLibrary(
      library.games.filter((game) => game.status !== 'completed'),
      names,
    )
    expect(backlogOf(idle, '2026-10-29')).toMatchObject({ pace: 0 })
    expect(backlogOf(idle, '2026-10-29')!.months).toBeUndefined()
  })

  it('lists the quickest of the backlog, the best rated and the oldest of what is waiting', () => {
    const backlog = backlogOf(library, '2026-10-29')!
    expect(backlog.quickest.map(({ title, left }) => [title, left])).toEqual([
      ['Inside', hours(4)],
      ['Elden Ring', hours(50)],
    ])
    // IGDB's rating counts once enough of its players gave one, Someday among them.
    expect(backlog.bestRated.map(({ title }) => title)).toEqual(['Elden Ring', 'Okami', 'Inside'])
    expect(backlog.oldest.map(({ title }) => title)).toEqual([
      'Okami',
      'Inside',
      'Outer Wilds',
      'Elden Ring',
      'Vampire Survivors',
    ])
  })

  it('counts what is waiting by genre and platform, a game owned twice on one once', () => {
    const backlog = backlogOf(library, '2026-10-29')!
    expect(backlog.genres).toEqual([
      { id: 31, name: 'Adventure', slug: 'adventure', games: 3 },
      { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg', games: 1 },
    ])
    expect(backlog.platforms).toEqual([
      { id: 167, name: 'PlayStation 5', slug: 'ps5', games: 2 },
      { id: 6, name: 'PC', slug: 'pc', games: 1 },
    ])
  })

  it('keeps each list short', () => {
    const many = testLibrary(
      Array.from({ length: 20 }, (_, index) =>
        testGame(`Game ${String(index).padStart(2, '0')}`, {
          length: hours(index + 1),
          year: 2000 + index,
          igdbRating: 70 + index,
          igdbRatingCount: 50,
          genres: [index],
        }),
      ),
      {
        genre: Array.from({ length: 20 }, (_, id) => ({ id, name: `Genre ${id}`, slug: `g${id}` })),
      },
    )
    const backlog = backlogOf(many, '2026-10-29')!
    expect(backlog.quickest).toHaveLength(BACKLOG_SHOWN)
    expect(backlog.bestRated).toHaveLength(BACKLOG_SHOWN)
    expect(backlog.oldest).toHaveLength(BACKLOG_SHOWN)
    expect(backlog.genres).toHaveLength(BACKLOG_RANKED)
  })

  it('is nothing with nothing in the backlog or Someday', () => {
    const done = testLibrary(library.games.filter((game) => game.status === 'completed'))
    expect(backlogOf(done, '2026-10-29')).toBeUndefined()
  })

  it('is on the trophy page of all time, of the games the filter matches, and not of a year', () => {
    const wall = trophyWall(library, 2026, 'en', { today: '2026-10-29' })
    expect(wall.stats.backlog).toMatchObject({ backlog: 4, someday: 1 })
    const adventures = trophyWall(library, 2026, 'en', {
      today: '2026-10-29',
      q: 'genre:adventure',
    })
    expect(adventures.stats.backlog).toMatchObject({ backlog: 2, someday: 1 })
    expect(trophyWall(library, 2026, 'en', { scope: 2026 }).stats.backlog).toBeUndefined()
  })
})
