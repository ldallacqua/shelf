import { describe, expect, it } from 'vitest'

import type { LibraryGame } from '@/domain/library/library'
import { testGame, testLibrary } from '@/domain/library/testing'
import { achievementWall, type GameUnlocks } from '@/domain/library/trophy-achievements'
import { trophyWall, type WallOptions } from '@/domain/library/trophies'

import { trophyCardOf } from './trophy-card'

/** What a shared link to the trophy page shows (issue 68): of all time, or a year's recap. */

const finished = (title: string, completedOn: string, extra: Partial<LibraryGame> = {}) =>
  testGame(title, {
    status: 'completed',
    completedOn,
    minutes: 600,
    genres: [12],
    cover: title.toLowerCase().replace(/\W/g, ''),
    ...extra,
  })

const library = testLibrary(
  [
    finished('Hades', '2025-03-02', { rating: 90 }),
    finished('Bastion', '2025-04-02'),
    finished('Pyre', '2024-05-02'),
    finished('Transistor', '2024-01-10'),
    finished('Hades II', '2023-02-10'),
    finished('Night Club', '2025-06-02', { adult: true, genres: [], rating: 20 }),
    testGame('Undated', { status: 'completed' }),
  ],
  { genre: [{ id: 12, name: 'RPG', slug: 'rpg' }] },
)

const unlocks: GameUnlocks[] = [
  {
    slug: 'hades',
    total: 2,
    perfect: true,
    unlocked: [
      { key: 'a', name: 'A', at: Date.parse('2025-03-01') },
      { key: 'b', name: 'B', at: Date.parse('2025-03-02') },
    ],
  },
  {
    slug: 'night-club',
    total: 3,
    perfect: false,
    unlocked: [{ key: 'c', name: 'C', at: Date.parse('2025-06-01') }],
  },
]

const cardOf = (options: WallOptions = {}) =>
  trophyCardOf(
    trophyWall(library, 2026, 'en', options),
    achievementWall(library, unlocks, 2026, options),
  )

describe('a trophy card', () => {
  it('says the shelf of all time without its adult games, wherever it is shared', () => {
    expect(cardOf()).toEqual({
      finished: 6,
      hours: 50,
      genre: 'RPG',
      averageRating: 90,
      unlocked: 2,
      perfect: 1,
      // The latest dated finishes, newest first; neither the adult one nor the undated.
      covers: ['Bastion', 'Hades', 'Pyre', 'Transistor'].map((title) => ({
        title,
        cover: title.toLowerCase(),
      })),
    })
  })

  it('recaps a year: its finishes, their hours, and the achievements of that year', () => {
    expect(cardOf({ scope: 2025 })).toMatchObject({
      scope: 2025,
      finished: 2,
      hours: 20,
      unlocked: 2,
      perfect: 1,
      covers: [{ title: 'Bastion' }, { title: 'Hades' }],
    })
  })

  it('says no achievements where none are known', () => {
    const card = trophyCardOf(trophyWall(library, 2026, 'en', { scope: 2024 }), {})
    expect(card.unlocked).toBeUndefined()
    expect(card.perfect).toBeUndefined()
    expect(card.finished).toBe(2)
  })
})
