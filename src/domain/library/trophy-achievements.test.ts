import { describe, expect, it } from 'vitest'

import type { AchievementSetView, AchievementView } from '@/domain/achievements/achievements'
import { testGame, testLibrary } from '@/domain/library/testing'

import {
  achievementStatsOf,
  achievementWall,
  pointsOf,
  rarityOf,
  unlocksOf,
  type GameUnlocks,
  type Unlocked,
} from './trophy-achievements'

/**
 * The trophy page's achievements (issue 68's third phase): what they add up
 * to, of all time and of one year, the vault, the records, the milestones
 * and what is worth saying, from each game's unlocks as Steam last gave them.
 */

const at = (day: string, hour = 12) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)

const achievement = (id: string, more: Partial<AchievementView> = {}): AchievementView => ({
  id,
  name: id,
  hidden: false,
  state: 'locked',
  ...more,
})

const set = (achievements: AchievementView[], more: Partial<AchievementSetView> = {}) =>
  ({
    provider: 'steam',
    setId: '1',
    title: 'A game',
    state: 'ready',
    readAt: 1000,
    achievements,
    ...more,
  }) satisfies AchievementSetView

let made = 0
/** An unlock, of a rate and a moment when given. */
const unlock = (rate?: number, when?: number, name = `U${(made += 1)}`): Unlocked => ({
  key: `steam:1/${name}`,
  name,
  ...(rate === undefined ? {} : { rate }),
  ...(when === undefined ? {} : { at: when }),
})

const unlocks = (
  slug: string,
  total: number,
  unlocked: Unlocked[],
  more: Partial<GameUnlocks> = {},
): GameUnlocks => ({
  slug,
  total,
  perfect: unlocked.length === total,
  unlocked,
  ...more,
})

const RPG = { id: 12, name: 'RPG', slug: 'rpg' }
const library = testLibrary(
  [
    testGame('Hades', { genres: [12] }),
    testGame('Bastion', { genres: [12] }),
    testGame('Pyre', { genres: [12] }),
    testGame('Portal', { genres: [5] }),
    testGame('Night Club', { adult: true }),
  ],
  { genre: [RPG, { id: 5, name: 'Puzzle', slug: 'puzzle' }] },
)
const slugOf = (title: string) => library.games.find((game) => game.title === title)!.slug

describe('a game’s unlocks (issue 68)', () => {
  const all = (id: string, when: number, rate: number) =>
    achievement(id, { state: 'unlocked', unlockedAt: when, rate })

  it('make a game perfect only when every set of it with achievements is complete', () => {
    const game = (slug: string, sets: AchievementSetView[]) =>
      unlocksOf({ slug, title: slug, sets })
    expect(game('done', [set([all('a', 5, 50)]), set([], { state: 'none' })])).toMatchObject({
      total: 1,
      perfect: true,
    })
    expect(
      game('half', [set([all('b', 6, 3)]), set([achievement('c')], { setId: '2' })]),
    ).toMatchObject({ total: 2, perfect: false })
    // A set not read yet, or kept private, keeps it from perfect but leaves the rest counted.
    expect(game('unknown', [set([all('d', 7, 1)]), set([], { state: 'private' })])).toMatchObject({
      total: 1,
      perfect: false,
    })
    // Nothing known: no figures at all, never "0 of 0".
    expect(game('later', [set([], { state: 'pending' })])).toBeUndefined()
    expect(game('none', [set([], { state: 'none' })])).toBeUndefined()
  })

  it('keep each unlock’s name, rarity and moment, the latest read, and leave out the rest', () => {
    const found = unlocksOf({
      slug: 'one',
      title: 'One',
      sets: [
        set([
          all('old', 100, 40),
          achievement('when?', { state: 'unlocked', rate: 0.5, inEnglish: true, icon: 'x.jpg' }),
          achievement('locked', { rate: 0.1 }),
        ]),
        set([all('mid', 200, 2)], { setId: '2', readAt: 5000 }),
      ],
    })!
    expect(found.unlocked).toEqual([
      { key: 'steam:1/old', name: 'old', rate: 40, at: 100 },
      { key: 'steam:1/when?', name: 'when?', inEnglish: true, icon: 'x.jpg', rate: 0.5 },
      { key: 'steam:2/mid', name: 'mid', rate: 2, at: 200 },
    ])
    expect(found).toMatchObject({ total: 4, readAt: 5000 })
  })
})

describe('how rare an unlock is', () => {
  it('falls in the tier under its share, and scores 100 over it, at most 100', () => {
    expect([0.4, 1, 4.9, 5, 9.9, 10, 24, 25, 49, 50, 100].map(rarityOf)).toEqual([
      'ultra',
      'very',
      'very',
      'rare',
      'rare',
      'uncommon',
      'uncommon',
      'common',
      'common',
      'most',
      'most',
    ])
    expect([100, 50, 10, 1, 0.2].map(pointsOf)).toEqual([1, 2, 10, 100, 100])
  })
})

describe('the achievements of all time (issue 68)', () => {
  const hades = unlocks(slugOf('Hades'), 3, [
    unlock(0.5, at('2024-03-01')),
    unlock(10, at('2024-03-01', 13)),
    unlock(50, at('2024-03-02')),
  ])
  const bastion = unlocks(slugOf('Bastion'), 4, [unlock(20, at('2025-06-01')), unlock(80)])
  const portal = unlocks(slugOf('Portal'), 2, [], { perfect: false })
  const stats = achievementStatsOf(library, [hades, bastion, portal], 2026)!

  it('count what is unlocked of what is known, and the games perfected', () => {
    expect(stats).toMatchObject({
      games: 3,
      unlocked: 5,
      available: 9,
      // 5 of 9 is 55.5%: rounded down, so nearly all is never all.
      percent: 55,
      perfect: 1,
      // One perfect of the two with an unlock.
      perfectShare: 0.5,
      averageRate: (0.5 + 10 + 50 + 20 + 80) / 5,
      score: 100 + 10 + 2 + 5 + 1,
    })
    expect(stats.rarities).toEqual([
      { rarity: 'ultra', count: 1 },
      { rarity: 'very', count: 0 },
      { rarity: 'rare', count: 0 },
      { rarity: 'uncommon', count: 2 },
      { rarity: 'common', count: 0 },
      { rarity: 'most', count: 2 },
    ])
  })

  it('keep the rarest unlocks and the latest, each with its game', () => {
    expect(stats.rarest.map((each) => each.rate)).toEqual([0.5, 10, 20, 50, 80])
    expect(stats.rarest[0]!.game).toEqual({ slug: slugOf('Hades'), title: 'Hades' })
    // An unlock without a moment is not among the latest.
    expect(stats.latest.map((each) => each.rate)).toEqual([20, 50, 10, 0.5])
  })

  it('keep the vault to one rarity when asked, and the figures whole', () => {
    const rare = achievementStatsOf(library, [hades, bastion], 2026, { rarity: 'uncommon' })!
    expect(rare.rarest.map((each) => each.rate)).toEqual([10, 20])
    expect(rare.latest.map((each) => each.rate)).toEqual([20, 10])
    expect(rare).toMatchObject({ rarity: 'uncommon', unlocked: 5 })
  })

  it('count the unlocks of each year, from the first to this one, a year without as none', () => {
    expect(stats.trend).toEqual([
      { year: 2024, count: 3 },
      { year: 2025, count: 1 },
      { year: 2026, count: 0 },
    ])
  })

  it('mark the best day, the days in a row, and the milestones', () => {
    expect(stats.records.bestDay).toEqual({
      on: '2024-03-01',
      count: 2,
      game: { slug: slugOf('Hades'), title: 'Hades' },
    })
    expect(stats.records.streak).toEqual({ days: 2, from: '2024-03-01', to: '2024-03-02' })
    expect(stats.milestones.map((each) => [each.kind, each.on])).toEqual([
      ['unlock', '2024-03-01'],
      ['ultra', '2024-03-01'],
      ['perfect', '2024-03-02'],
    ])
    expect(stats.perfects).toMatchObject([{ title: 'Hades', total: 3, on: '2024-03-02' }])
  })

  it('rank the genres by the share unlocked, once three of their games have achievements', () => {
    const pyre = unlocks(slugOf('Pyre'), 10, [unlock(30)])
    expect(achievementStatsOf(library, [hades, bastion, portal], 2026)!.genres).toEqual([])
    expect(achievementStatsOf(library, [hades, bastion, pyre, portal], 2026)!.genres).toEqual([
      { ...RPG, games: 3, unlocked: 6, available: 17, share: 6 / 17 },
    ])
  })

  it('are nothing without a game whose achievements are known', () => {
    expect(achievementStatsOf(library, [], 2026)).toBeUndefined()
  })
})

describe('the games perfected and nearly so', () => {
  const timed = (slug: string, count: number, from: number, hours: number) =>
    unlocks(
      slug,
      count,
      Array.from({ length: count }, (_, index) =>
        unlock(50, from + Math.round((index * hours * 3_600_000) / (count - 1))),
      ),
    )

  it('time a perfect game from its first unlock to its last, as a record from ten achievements', () => {
    const stats = achievementStatsOf(
      library,
      [
        timed(slugOf('Hades'), 10, at('2025-01-01'), 5),
        timed(slugOf('Bastion'), 12, at('2025-02-01'), 300),
        // Quicker still, but three in an hour says little.
        timed(slugOf('Pyre'), 3, at('2025-03-01'), 1),
      ],
      2026,
    )!
    expect(stats.records.quickest).toMatchObject({ title: 'Hades', took: 5 * 3_600_000 })
    expect(stats.records.slowest).toMatchObject({ title: 'Bastion', took: 300 * 3_600_000 })
    // The latest perfected first.
    expect(stats.perfects.map((each) => each.title)).toEqual(['Pyre', 'Bastion', 'Hades'])
  })

  it('give no day to a perfect game whose moments Steam did not all give, and list it last', () => {
    const stats = achievementStatsOf(
      library,
      [
        unlocks(slugOf('Hades'), 2, [unlock(50, at('2025-01-01')), unlock(50)]),
        timed(slugOf('Bastion'), 2, at('2024-01-01'), 1),
      ],
      2026,
    )!
    expect(stats.perfects.map((each) => [each.title, each.on])).toEqual([
      ['Bastion', '2024-01-01'],
      ['Hades', undefined],
    ])
  })

  it('name the ones five or fewer short, three quarters done, the fewest left first', () => {
    const some = (slug: string, earned: number, total: number) =>
      unlocks(
        slug,
        total,
        Array.from({ length: earned }, () => unlock(50)),
      )
    const stats = achievementStatsOf(
      library,
      [
        some(slugOf('Hades'), 47, 50),
        some(slugOf('Bastion'), 9, 10),
        // Six short: not close.
        some(slugOf('Pyre'), 94, 100),
        // Three short, but not three quarters done.
        some(slugOf('Portal'), 5, 8),
      ],
      2026,
    )!
    expect(stats.close.map((each) => [each.title, each.total - each.earned])).toEqual([
      ['Bastion', 1],
      ['Hades', 3],
    ])
    expect(stats.insights).toContainEqual({
      kind: 'close',
      game: { slug: slugOf('Bastion'), title: 'Bastion' },
      left: 1,
    })
  })
})

describe('the achievements of one year (issue 68)', () => {
  const hades = unlocks(slugOf('Hades'), 3, [
    unlock(0.5, at('2024-12-31', 23)),
    unlock(10, at('2025-01-01', 1)),
    unlock(50, at('2025-03-02')),
  ])
  const bastion = unlocks(slugOf('Bastion'), 4, [unlock(20, at('2025-03-05')), unlock(80)])

  it('are of the unlocks in it, by the day in UTC, and the games perfected in it', () => {
    const stats = achievementStatsOf(library, [hades, bastion], 2026, { scope: 2025 })!
    expect(stats).toMatchObject({ scope: 2025, games: 2, unlocked: 3, perfect: 1 })
    expect(stats.rarest.map((each) => each.rate)).toEqual([10, 20, 50])
    expect(stats.trend.map((each) => each.count)).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(stats.trend[0]).toEqual({ year: 2025, month: 1, count: 1 })
  })

  it('say nothing that is of all time: how much of all is unlocked, the close ones, genres, insights', () => {
    const stats = achievementStatsOf(library, [hades, bastion], 2026, { scope: 2025 })!
    expect(stats.available).toBeUndefined()
    expect(stats.percent).toBeUndefined()
    expect(stats.perfectShare).toBeUndefined()
    expect(stats.close).toEqual([])
    expect(stats.genres).toEqual([])
    expect(stats.insights).toEqual([])
    // The milestones reached in it, and only those.
    expect(stats.milestones.map((each) => each.kind)).toEqual(['perfect'])
  })

  it('are nothing when nothing was unlocked in it', () => {
    expect(achievementStatsOf(library, [hades, bastion], 2026, { scope: 2023 })).toBeUndefined()
  })
})

describe('what is worth saying of the achievements', () => {
  const year = (from: number, count: number, day: string) =>
    Array.from({ length: count }, (_, index) => unlock(50, at(day) + (from + index) * 1000))

  it('says this year beats the last, or every year before, from twenty unlocks', () => {
    const ahead = achievementStatsOf(
      library,
      [
        unlocks(slugOf('Hades'), 200, [
          ...year(0, 40, '2024-05-01'),
          ...year(40, 21, '2025-05-01'),
          ...year(61, 30, '2026-05-01'),
        ]),
      ],
      2026,
    )!
    expect(ahead.insights[0]).toEqual({
      kind: 'unlocks',
      year: 2026,
      count: 30,
      than: { year: 2025, count: 21 },
      best: false,
    })
    const best = achievementStatsOf(
      library,
      [
        unlocks(slugOf('Hades'), 200, [
          ...year(0, 25, '2024-05-01'),
          ...year(25, 30, '2026-05-01'),
        ]),
      ],
      2026,
    )!
    expect(best.insights[0]).toMatchObject({
      kind: 'unlocks',
      best: true,
      than: { year: 2024, count: 25 },
    })
  })

  it('names the rarest unlock only when under 5% of players have it', () => {
    const rare = (rate: number) =>
      achievementStatsOf(
        library,
        [unlocks(slugOf('Hades'), 9, [unlock(rate, at('2025-01-01'))])],
        2026,
      )!.insights.filter((each) => each.kind === 'rarest')
    expect(rare(3)).toHaveLength(1)
    expect(rare(5)).toEqual([])
  })
})

describe('the trophy page’s achievements (issue 68)', () => {
  const hades = unlocks(slugOf('Hades'), 2, [unlock(10, at('2025-01-01'))])
  const club = unlocks(slugOf('Night Club'), 2, [unlock(1, at('2025-01-02')), unlock(2)])

  it('are of the games the page’s filter keeps', () => {
    const wall = achievementWall(library, [hades, club], 2026, { q: 'genre:rpg' })
    expect(wall.stats).toMatchObject({ games: 1, unlocked: 1 })
  })

  it('are drawn again without adult games, for a device that hides them', () => {
    const wall = achievementWall(library, [hades, club], 2026)
    expect(wall.stats).toMatchObject({ games: 2, unlocked: 3 })
    expect(wall.hidden).toMatchObject({ games: 1, unlocked: 1 })
    expect(wall.hidden!.rarest.map((each) => each.game.title)).toEqual(['Hades'])
    // With nothing but adult games, nothing at all is left to show.
    expect(achievementWall(library, [club], 2026).hidden).toBeUndefined()
  })
})
