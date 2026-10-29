import { describe, expect, it } from 'vitest'

import { pastIgdb, playedMinutes } from './hours'

/** A game's hours, and the games whose stores count far past IGDB (ADR 003). */

describe('a game’s hours', () => {
  it('is the larger of what I typed and what its stores report', () => {
    expect(playedMinutes(600, 300)).toBe(600)
    expect(playedMinutes(0, 300)).toBe(300)
  })

  it('takes the time left idle off what the stores report, never below nothing', () => {
    expect(playedMinutes(0, 6720, 4320)).toBe(2400)
    expect(playedMinutes(0, 300, 900)).toBe(0)
  })

  it('takes nothing off what I typed', () => {
    expect(playedMinutes(3000, 6720, 4320)).toBe(3000)
  })

  it('goes on counting what the stores add after the idle time is taken out', () => {
    expect(playedMinutes(0, 7200, 4320)).toBe(2880)
  })
})

describe('hours past IGDB’s', () => {
  it('is a store’s hours past twice IGDB’s time to see everything', () => {
    expect(pastIgdb(2500, { normally: 600, completely: 1200 })).toEqual({
      minutes: 1200,
      of: 'completely',
    })
    expect(pastIgdb(2400, { normally: 600, completely: 1200 })).toBeUndefined()
  })

  it('takes three playthroughs when IGDB has no time for everything', () => {
    expect(pastIgdb(2000, { normally: 600 })).toEqual({ minutes: 600, of: 'normally' })
    expect(pastIgdb(1800, { normally: 600 })).toBeUndefined()
  })

  it('is ten hours past it at least: a short game played twice is no surprise', () => {
    expect(pastIgdb(400, { completely: 120 })).toBeUndefined()
    expect(pastIgdb(800, { completely: 120 })).toEqual({ minutes: 120, of: 'completely' })
  })

  it('is nothing without IGDB’s time, or with only a hasty one', () => {
    expect(pastIgdb(99_000, undefined)).toBeUndefined()
    expect(pastIgdb(99_000, { hastily: 300 })).toBeUndefined()
  })
})
