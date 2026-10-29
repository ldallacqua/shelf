import { describe, expect, it } from 'vitest'

import type { LibraryGame } from '@/domain/library/library'
import { ownedOn, testGame, testLibrary } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'

const finished = (title: string, completedOn?: string, extra: Partial<LibraryGame> = {}) =>
  testGame(title, { status: 'completed', completedOn, ...extra })

const genre = [
  { id: 12, name: 'RPG', slug: 'rpg' },
  { id: 31, name: 'Adventure', slug: 'adventure' },
  { id: 8, name: 'Platform', slug: 'platform' },
]
const company = [
  { id: 1, name: 'Supergiant', slug: 'supergiant' },
  { id: 2, name: 'Nintendo', slug: 'nintendo' },
  { id: 3, name: 'Devolver', slug: 'devolver' },
]

describe('lists ranked another way (issue 68)', () => {
  const library = testLibrary(
    [
      finished('Hades', '2025-01-02', { minutes: 60 * 40, rating: 95, genres: [12, 31] }),
      finished('Bastion', '2025-02-02', { minutes: 60 * 9, rating: 85, genres: [12] }),
      finished('Pyre', '2025-03-02', { minutes: 60 * 12, rating: 75, genres: [12] }),
      finished('Tunic', '2025-04-02', { minutes: 60 * 25, rating: 60, genres: [31] }),
      finished('Okami', '2025-05-02', { minutes: 60 * 30, genres: [31] }),
      finished('Celeste', '2025-06-02', { minutes: 60 * 80, genres: [8] }),
      testGame('Returnal', { status: 'dropped', genres: [31] }),
      testGame('Outer Wilds', { status: 'playing', genres: [31] }),
    ],
    { genre },
  )
  const names = (list: readonly { name: string }[]) => list.map(({ name }) => name)

  it('ranks by games finished unless asked otherwise', () => {
    const { stats } = trophyWall(library, 2026)
    expect(stats.by).toBe('finished')
    expect(names(stats.genres)).toEqual(['Adventure', 'RPG', 'Platform'])
  })

  it('ranks by the hours on the games finished', () => {
    const { stats } = trophyWall(library, 2026, 'en', { by: 'hours' })
    expect(stats.by).toBe('hours')
    // Platform 80 h, Adventure 95 h, RPG 61 h.
    expect(names(stats.genres)).toEqual(['Adventure', 'Platform', 'RPG'])
  })

  it('ranks by my average rating only the kinds with three finished games rated', () => {
    const { stats } = trophyWall(library, 2026, 'en', { by: 'rating' })
    // RPG: 95, 85, 75. Adventure has two rated, Platform none.
    expect(stats.genres).toEqual([expect.objectContaining({ name: 'RPG', rating: 85 })])
  })

  it('ranks by the share finished only the kinds with five started, and only of all time', () => {
    const { stats } = trophyWall(library, 2026, 'en', { by: 'share' })
    // Adventure: three finished of five started.
    expect(stats.genres).toEqual([expect.objectContaining({ name: 'Adventure', share: 3 / 5 })])
    const year = trophyWall(library, 2026, 'en', { by: 'share', scope: 2025 }).stats
    expect(year.by).toBe('finished')
    expect(names(year.genres)).toEqual(['Adventure', 'RPG', 'Platform'])
  })

  it('ranks the modes, perspectives, developers and publishers too', () => {
    const made = testLibrary(
      [
        finished('Hades', '2025-01-02', { developers: [1], publishers: [1], modes: [1] }),
        finished('Bastion', '2025-02-02', { developers: [1], publishers: [3], perspectives: [4] }),
        finished('Mario', '2025-03-02', { developers: [2], publishers: [2], modes: [1, 2] }),
      ],
      {
        company,
        mode: [
          { id: 1, name: 'Single player', slug: 'single-player' },
          { id: 2, name: 'Multiplayer', slug: 'multiplayer' },
        ],
        perspective: [{ id: 4, name: 'Isometric', slug: 'bird-view-slash-isometric' }],
      },
    )
    const { stats } = trophyWall(made, 2026)
    expect(names(stats.developers)).toEqual(['Supergiant', 'Nintendo'])
    expect(names(stats.publishers)).toEqual(['Devolver', 'Nintendo', 'Supergiant'])
    expect(names(stats.modes)).toEqual(['Single player', 'Multiplayer'])
    expect(stats.perspectives).toEqual([
      expect.objectContaining({ slug: 'bird-view-slash-isometric', finished: 1 }),
    ])
  })

  it('counts the games finished by the decade they came out in, a decade with none as nothing', () => {
    const { stats } = trophyWall(
      testLibrary([
        finished('Okami', '2025-01-02', { year: 2006 }),
        finished('Hades', '2025-01-02', { year: 2020 }),
        finished('Tunic', '2025-01-02', { year: 2022 }),
        finished('Unknown', '2025-01-02'),
      ]),
      2026,
    )
    expect(stats.decades).toEqual([
      { decade: 2000, finished: 1 },
      { decade: 2010, finished: 0 },
      { decade: 2020, finished: 2 },
    ])
  })
})

describe('my ratings (issue 68)', () => {
  /** A game I rated, and IGDB's players with it, `count` of them. */
  const rated = (title: string, mine: number, theirs?: number, count = 50) =>
    finished(title, '2025-05-05', {
      rating: mine,
      ...(theirs === undefined ? {} : { igdbRating: theirs, igdbRatingCount: count }),
    })

  it('falls by whole point, a half step with the point below', () => {
    const { stats } = trophyWall(
      testLibrary([rated('A', 70), rated('B', 75), rated('C', 100), rated('D', 5)]),
      2026,
    )
    expect(stats.ratings?.rated).toBe(4)
    expect(stats.ratings?.spread).toEqual([1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1])
  })

  it('stands against IGDB’s players’ from five games enough of them rated', () => {
    const four = testLibrary([
      rated('A', 90, 80),
      rated('B', 80, 80),
      rated('C', 70, 80),
      rated('D', 60, 40),
      rated('Few', 100, 20, 3),
    ])
    expect(trophyWall(four, 2026).stats.ratings?.versus).toBeUndefined()

    const { stats } = trophyWall(
      testLibrary([...four.games, rated('E', 95, 70), rated('F', 40, 85)]),
      2026,
    )
    // Gaps: +10, 0, −10, +20, +25, −45; the game few rated is not among them.
    expect(stats.ratings?.versus?.games).toHaveLength(6)
    expect(stats.ratings?.versus?.gap).toBe(0)
    expect(stats.ratings?.gems.map(({ title }) => title)).toEqual(['E', 'D'])
    expect(stats.ratings?.letdowns).toEqual([{ slug: 'f', title: 'F', mine: 40, theirs: 85 }])
  })

  it('is of every rating given, or of the games finished in the year', () => {
    const library = testLibrary([
      rated('A', 90),
      testGame('Playing', { status: 'playing', rating: 60 }),
      finished('Before', '2024-01-01', { rating: 30 }),
    ])
    expect(trophyWall(library, 2026).stats.ratings?.rated).toBe(3)
    expect(trophyWall(library, 2026, 'en', { scope: 2025 }).stats.ratings?.rated).toBe(1)
    expect(trophyWall(testLibrary([finished('None')]), 2026).stats.ratings).toBeUndefined()
  })
})

describe('series (issue 68)', () => {
  const library = testLibrary(
    [
      finished('Zelda', '2025-01-01', { year: 1986, franchises: [1], series: [10] }),
      finished('Link to the Past', '2025-02-01', { year: 1991, franchises: [1], series: [10] }),
      testGame('Breath of the Wild', { status: 'backlog', year: 2017, franchises: [1] }),
      testGame('Tears of the Kingdom', { status: 'wishlist', franchises: [1] }),
      finished('Hades', '2025-03-01', { year: 2020, series: [20] }),
      finished('Hades II', '2025-04-01', { year: 2025, series: [20] }),
      testGame('Mario Kart', { status: 'retired', series: [30] }),
      finished('Mario Kart 8', '2025-05-01', { series: [30] }),
      testGame('Metroid', { status: 'backlog', series: [40] }),
      testGame('Super Metroid', { status: 'backlog', series: [40] }),
    ],
    {
      franchise: [{ id: 1, name: 'The Legend of Zelda', slug: 'the-legend-of-zelda' }],
      series: [
        { id: 10, name: 'The Legend of Zelda', slug: 'the-legend-of-zelda-collection' },
        { id: 20, name: 'Hades', slug: 'hades' },
        { id: 30, name: 'Mario Kart', slug: 'mario-kart' },
        { id: 40, name: 'Metroid', slug: 'metroid' },
      ],
    },
  )
  const { stats } = trophyWall(library, 2026)

  it('says how far through each I am, of its games on the shelf, the most finished first', () => {
    expect(
      stats.series.shown.map(({ name, finished: done, total }) => [name, done, total]),
    ).toEqual([
      // The franchise has the game on the backlog too, so it stands for the series of its name.
      ['The Legend of Zelda', 2, 3],
      ['Hades', 2, 2],
    ])
    // Not had yet, or with no end to reach, a game is not counted: Mario Kart has one game left.
    // Nothing of Metroid is finished.
    expect(stats.series.complete).toBe(1)
  })

  it('lists each one’s games by release, with their status, and leads to them by its filter word', () => {
    const zelda = stats.series.shown[0]!
    expect(zelda).toMatchObject({ kind: 'franchise', slug: 'the-legend-of-zelda' })
    expect(zelda.games.map(({ title, status }) => [title, status])).toEqual([
      ['Zelda', 'completed'],
      ['Link to the Past', 'completed'],
      ['Breath of the Wild', 'backlog'],
    ])
  })

  it('is of all time only', () => {
    expect(trophyWall(library, 2026, 'en', { scope: 2025 }).stats.series.shown).toEqual([])
  })
})

describe('my years (issue 68)', () => {
  const games = Array.from({ length: 12 }, (_, at) =>
    finished(
      `Game ${String(at + 1).padStart(2, '0')}`,
      `${at < 3 ? 2023 : at < 4 ? 2024 : 2025}-${String(at + 1).padStart(2, '0')}-10`,
      { genres: at < 3 ? [8] : [12], ...(at === 5 ? { rating: 100 } : {}) },
    ),
  )
  const { stats } = trophyWall(testLibrary(games, { genre }), 2026)

  it('are oldest first, with how many, what led, and the best one', () => {
    expect(
      stats.timeline.map(({ year, finished: count, genre: led, was, best }) => ({
        year,
        count,
        led: led?.name,
        was,
        best,
      })),
    ).toEqual([
      { year: 2023, count: 3, led: 'Platform', was: undefined, best: undefined },
      // One game is too few to say what led.
      { year: 2024, count: 1, led: undefined, was: undefined, best: undefined },
      { year: 2025, count: 8, led: 'RPG', was: 'Platform', best: true },
    ])
  })

  it('mark the first finish, the tenth, and the first rated 10', () => {
    const marked = stats.timeline.flatMap(({ milestones }) =>
      milestones.map(({ title, nth, perfect }) => [title, nth ?? (perfect ? 'perfect' : '')]),
    )
    expect(marked).toEqual([
      ['Game 01', 1],
      ['Game 06', 'perfect'],
      ['Game 10', 10],
    ])
  })

  it('are of all time only', () => {
    expect(trophyWall(testLibrary(games), 2026, 'en', { scope: 2025 }).stats.timeline).toEqual([])
  })
})

describe('what the figures say (issue 68)', () => {
  const kinds = (games: LibraryGame[], options = {}, names = {}) =>
    trophyWall(testLibrary(games, names), 2026, 'en', options).stats.insights.map(
      (insight) => insight.kind,
    )
  const many = (year: number, count: number, extra: Partial<LibraryGame> = {}) =>
    Array.from({ length: count }, (_, at) =>
      finished(`${year} ${at}`, `${year}-03-${String(at + 1).padStart(2, '0')}`, extra),
    )

  it('says this year is the best yet, or ahead of last year, or a few short of it', () => {
    const record = trophyWall(
      testLibrary([...many(2024, 4), ...many(2025, 3), ...many(2026, 5)]),
      2026,
    )
    expect(record.stats.insights[0]).toEqual({
      kind: 'record',
      year: 2026,
      finished: 5,
      best: { year: 2024, finished: 4 },
    })
    expect(kinds([...many(2024, 9), ...many(2025, 3), ...many(2026, 5)])).toContain('ahead')
    expect(kinds([...many(2025, 6), ...many(2026, 4)])).toContain('behind')
    // Two games last year are too few to measure against.
    expect(kinds([...many(2025, 2), ...many(2026, 5)])).toEqual([])
  })

  it('remembers a game finished in this month of an earlier year', () => {
    const { stats } = trophyWall(
      testLibrary([finished('Hades', '2024-10-05'), finished('Tunic', '2025-09-05')]),
      2026,
      'en',
      { today: '2026-10-28' },
    )
    expect(stats.insights).toContainEqual({
      kind: 'anniversary',
      game: { slug: 'hades', title: 'Hades' },
      on: '2024-10-05',
      years: 2,
    })
  })

  it('says this year’s leading genre when it is not the favorite of all time', () => {
    const games = [...many(2024, 6, { genres: [8] }), ...many(2026, 3, { genres: [12] })]
    expect(trophyWall(testLibrary(games, { genre }), 2026).stats.insights).toContainEqual({
      kind: 'shift',
      year: 2026,
      genre: { name: 'RPG', slug: 'rpg' },
      favorite: 'Platform',
    })
  })

  it('names the genre finished most of what is started, well above the rest', () => {
    const games = [
      ...many(2025, 5, { genres: [12] }),
      ...Array.from({ length: 5 }, (_, at) =>
        testGame(`Dropped ${at}`, { status: 'dropped', genres: [8] }),
      ),
    ]
    const said = trophyWall(testLibrary(games, { genre }), 2026).stats.insights
    // RPGs: five of five; of all started, five of ten.
    expect(said).toContainEqual(
      expect.objectContaining({ kind: 'finisher', share: 1, overall: 0.5 }),
    )
  })

  it('names the best-rated developer once three of its games are rated', () => {
    const games = [80, 90, 100].map((rating, at) =>
      finished(`Supergiant ${at}`, '2025-01-01', { rating, developers: [1] }),
    )
    const said = trophyWall(testLibrary(games, { company }), 2026).stats.insights
    expect(said).toContainEqual(expect.objectContaining({ kind: 'maker', rating: 90 }))
    expect(kinds(games.slice(0, 2), {}, { company })).not.toContain('maker')
  })

  it('says how my ratings stand against IGDB’s from ten games, when they differ', () => {
    const games = Array.from({ length: 10 }, (_, at) =>
      finished(`Game ${at}`, '2025-01-01', { rating: 90, igdbRating: 80, igdbRatingCount: 40 }),
    )
    expect(trophyWall(testLibrary(games), 2026).stats.insights).toContainEqual({
      kind: 'versus',
      gap: 10,
      games: 10,
    })
    expect(kinds(games.slice(0, 9))).not.toContain('versus')
  })

  it('says how long I take against IGDB’s normal playthrough, and how old the games were', () => {
    const slow = Array.from({ length: 10 }, (_, at) =>
      finished(`Game ${at}`, '2025-01-01', { minutes: 600, length: 300, year: 2015 }),
    )
    const said = trophyWall(testLibrary(slow), 2026).stats.insights
    expect(said).toContainEqual({ kind: 'pace', ratio: 2, games: 10 })
    expect(said).toContainEqual({ kind: 'age', share: 1, old: true, games: 10 })
    // As long as IGDB says, and new: nothing about the pace.
    const even = slow.map((game) => ({ ...game, minutes: 300, year: 2025 }))
    expect(kinds(even)).toEqual(['age'])
  })

  it('says nothing of a few games', () => {
    expect(kinds([finished('Hades', '2026-01-01', { rating: 90 })])).toEqual([])
  })
})

describe('the rankings with copies (issue 68)', () => {
  it('still rank platforms by every copy, as `owned:` matches them', () => {
    const { stats } = trophyWall(
      testLibrary([finished('Hades', '2025-01-01', { minutes: 60, ...ownedOn(6, 167) })], {
        platform: [
          {
            id: 6,
            key: 'pc',
            name: 'PC',
            short: 'PC',
            family: 'pc',
            shape: 'bluRay',
            plastic: 'blue',
          },
        ],
      }),
      2026,
      'en',
      { by: 'hours' },
    )
    expect(stats.platforms).toEqual([
      expect.objectContaining({ slug: 'pc', finished: 1, minutes: 60 }),
    ])
  })
})
