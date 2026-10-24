import { describe, expect, it } from 'vitest'

import {
  emptyTally,
  lastPlayed,
  moveInTally,
  placeMany,
  placements,
  sortUnsorted,
  type UnsortedGame,
} from './placing'

const game = (slug: string, title: string, extra: Partial<UnsortedGame> = {}): UnsortedGame => ({
  entryId: slug,
  slug,
  title,
  addedOn: '2026-10-01',
  minutes: 0,
  platforms: [],
  played: [],
  ...extra,
})

const GAMES = [
  game('portal', 'Portal', { minutes: 120, addedOn: '2026-10-03' }),
  game('the-witness', 'The Witness', {
    minutes: 600,
    played: [
      { source: 'steam', minutes: 400, lastPlayedAt: 1_000 },
      { source: 'nintendo', minutes: 200, lastPlayedAt: 3_000 },
    ],
  }),
  game('braid', 'Braid', {
    minutes: 120,
    addedOn: '2026-10-02',
    played: [{ source: 'steam', minutes: 120, lastPlayedAt: 2_000 }],
  }),
  game('abzu', 'ABZÛ'),
]
const slugs = (games: readonly UnsortedGame[]) => games.map((each) => each.slug)

describe('the order of the games to place', () => {
  it('opens longest played first, as Minimap does, ties by title', () => {
    expect(slugs(sortUnsorted(GAMES, 'played', 'en'))).toEqual([
      'the-witness',
      'braid',
      'portal',
      'abzu',
    ])
  })

  it('goes by the last play on any source, never-played last', () => {
    expect(slugs(sortUnsorted(GAMES, 'recent', 'en'))).toEqual([
      'the-witness',
      'braid',
      'abzu',
      'portal',
    ])
    expect(lastPlayed(GAMES[1]!)).toBe(3_000)
    expect(lastPlayed(GAMES[0]!)).toBeUndefined()
  })

  it('goes by title, an article aside, and by the day added, newest first', () => {
    expect(slugs(sortUnsorted(GAMES, 'title', 'en'))).toEqual([
      'abzu',
      'braid',
      'portal',
      'the-witness',
    ])
    expect(slugs(sortUnsorted(GAMES, 'added', 'en'))).toEqual([
      'portal',
      'braid',
      'abzu',
      'the-witness',
    ])
  })
})

describe('the tally', () => {
  it('moves games from one status to another, and nowhere for the same one', () => {
    const tally = { ...emptyTally(), unsorted: 5, backlog: 1 }
    expect(moveInTally(tally, 'unsorted', 'backlog', 2)).toMatchObject({ unsorted: 3, backlog: 3 })
    expect(moveInTally(tally, 'backlog', 'backlog')).toBe(tally)
  })

  it('places games in every status but the one they wait in', () => {
    expect(placements).toEqual(['playing', 'backlog', 'completed', 'dropped', 'wishlist'])
  })
})

describe('many games given one status', () => {
  it('takes their ids and a status, and nothing else', () => {
    expect(placeMany.safeParse({ entries: ['a', 'b'], status: 'backlog' }).success).toBe(true)
    expect(placeMany.safeParse({ entries: [], status: 'backlog' }).success).toBe(false)
    expect(placeMany.safeParse({ entries: ['a'], status: 'shelved' }).success).toBe(false)
  })
})
