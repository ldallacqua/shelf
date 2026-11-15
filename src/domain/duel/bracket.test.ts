import { describe, expect, it } from 'vitest'

import {
  beatenBy,
  MAX_CONTENDERS,
  pick,
  shuffled,
  standingOf,
  startDuel,
  undo,
  type Duel,
} from './bracket'

const games = (count: number) => Array.from({ length: count }, (_, index) => `g${index + 1}`)

/** Plays every duel, sending on whichever side `choose` names. */
function playOut(duel: Duel, choose: (a: string, b: string) => string = (a) => a): Duel {
  let next = duel
  for (let step = 0; step < 64; step += 1) {
    const { current } = standingOf(next)
    if (!current) return next
    next = pick(next, choose(current.a, current.b))
  }
  return next
}

describe('standingOf', () => {
  it('takes one duel less than there are games, whatever the count', () => {
    for (let count = 2; count <= MAX_CONTENDERS; count += 1) {
      const duel = { contenders: games(count), picks: [] }
      expect(standingOf(duel).total).toBe(count - 1)
      const done = playOut(duel)
      expect(done.picks).toHaveLength(count - 1)
      expect(standingOf(done).champion).toBeDefined()
    }
  })

  it('names the rounds by how many duels each holds when full', () => {
    const names = (count: number) =>
      standingOf({ contenders: games(count), picks: [] }).rounds.map(({ name }) => name)
    expect(names(2)).toEqual(['final'])
    expect(names(4)).toEqual(['semifinal', 'final'])
    expect(names(8)).toEqual(['quarterfinal', 'semifinal', 'final'])
    expect(names(16)).toEqual(['roundOf16', 'quarterfinal', 'semifinal', 'final'])
    // Five games fill a bracket of eight, with three byes.
    expect(names(5)).toEqual(['quarterfinal', 'semifinal', 'final'])
  })

  it('spreads the byes through the first round, so no half of the bracket is all byes', () => {
    const { rounds } = standingOf({ contenders: games(5), picks: [] })
    const first = rounds[0]?.matches ?? []
    expect(first.map(({ bye }) => bye)).toEqual([false, true, true, true])
    // Six games: two byes, one in each half.
    const six = standingOf({ contenders: games(6), picks: [] }).rounds[0]?.matches ?? []
    expect(six.map(({ bye }) => bye)).toEqual([false, true, false, true])
  })

  it('gives every game its place once', () => {
    for (let count = 2; count <= MAX_CONTENDERS; count += 1) {
      const first = standingOf({ contenders: games(count), picks: [] }).rounds[0]?.matches ?? []
      const placed = first.flatMap(({ a, b }) => [a, b]).filter(Boolean)
      expect(placed.sort()).toEqual(games(count).sort())
    }
  })

  it('says which duel is next, and where it stands in its round', () => {
    const standing = standingOf({ contenders: games(8), picks: ['g1'] })
    expect(standing.current).toMatchObject({ round: 0, match: 1, a: 'g3', b: 'g4' })
    expect(standing.current).toMatchObject({ inRound: 2, ofRound: 4 })
    expect(standing.played).toBe(1)
  })

  it('counts a round’s duels without its byes', () => {
    const { current } = standingOf({ contenders: games(5), picks: [] })
    expect(current).toMatchObject({ round: 0, inRound: 1, ofRound: 1 })
  })

  it('sends a game with a bye on without a duel', () => {
    const standing = standingOf({ contenders: games(3), picks: [] })
    expect(standing.rounds[0]?.matches[1]).toMatchObject({ a: 'g3', winner: 'g3', bye: true })
    const after = standingOf({ contenders: games(3), picks: ['g2'] })
    expect(after.current).toMatchObject({ round: 1, a: 'g2', b: 'g3' })
  })

  it('names the champion and the game it beat in the final', () => {
    const done = playOut({ contenders: games(4), picks: [] }, (_, b) => b)
    const standing = standingOf(done)
    expect(standing.current).toBeUndefined()
    expect(standing.champion).toBe('g4')
    expect(standing.runnerUp).toBe('g2')
  })

  it('stops replaying at a pick that is neither side of its duel', () => {
    const standing = standingOf({ contenders: games(4), picks: ['g1', 'g9', 'g3'] })
    expect(standing.played).toBe(1)
    expect(standing.current).toMatchObject({ a: 'g3', b: 'g4' })
  })

  it('has nothing to play with fewer than two games', () => {
    expect(standingOf({ contenders: ['g1'], picks: [] })).toEqual({
      rounds: [],
      played: 0,
      total: 0,
    })
  })
})

describe('pick and undo', () => {
  it('ignores a game that is not in the duel being played', () => {
    const duel = { contenders: games(4), picks: [] }
    expect(pick(duel, 'g3')).toBe(duel)
  })

  it('takes the last pick back', () => {
    const duel = pick(pick({ contenders: games(4), picks: [] }, 'g2'), 'g3')
    expect(undo(duel).picks).toEqual(['g2'])
    expect(standingOf(undo(duel)).current).toMatchObject({ a: 'g3', b: 'g4' })
    expect(undo({ contenders: games(2), picks: [] }).picks).toEqual([])
  })

  it('ignores a pick once the duel is over', () => {
    const done = playOut({ contenders: games(2), picks: [] })
    expect(pick(done, 'g2')).toBe(done)
  })
})

describe('beatenBy', () => {
  it('lists the games a game beat, in order, without its byes', () => {
    const done = playOut({ contenders: games(3), picks: [] }, (a, b) => (a === 'g3' ? a : b))
    const standing = standingOf(done)
    expect(standing.champion).toBe('g3')
    expect(beatenBy(standing, 'g3')).toEqual(['g2'])
    expect(beatenBy(standing, 'g2')).toEqual(['g1'])
  })
})

describe('startDuel', () => {
  it('draws the places at random, keeping every game once', () => {
    const sequence = [0.9, 0.1, 0.5, 0.3]
    let at = 0
    const random = () => sequence[at++ % sequence.length] ?? 0
    const duel = startDuel(games(5), random)
    expect(duel.picks).toEqual([])
    expect([...duel.contenders].sort()).toEqual(games(5))
    expect(duel.contenders).not.toEqual(games(5))
  })

  it('keeps no more than sixteen', () => {
    expect(startDuel(games(20)).contenders).toHaveLength(MAX_CONTENDERS)
  })

  it('shuffles without changing what it was given', () => {
    const list = games(6)
    shuffled(list)
    expect(list).toEqual(games(6))
  })
})
