import { describe, expect, it } from 'vitest'

import { isPcSource, pastIgdb, playedMinutes, trackedMinutes } from './hours'

/** A game's hours, and the games whose stores count far past IGDB (ADR 003). */

describe('a game’s hours', () => {
  const time = (tracked: number, pc: number, console = 0) => ({ tracked, pc, console })

  it('never counts the same play twice: on a PC, the larger of the app’s and the store’s', () => {
    expect(playedMinutes(time(600, 300))).toBe(600)
    expect(playedMinutes(time(100, 300))).toBe(300)
  })

  it('adds a console’s hours, which the app cannot have seen', () => {
    expect(playedMinutes(time(100, 300, 50))).toBe(350)
    expect(playedMinutes(time(100, 0, 50))).toBe(150)
  })

  it('takes the time left idle off what the stores report, never below nothing', () => {
    expect(playedMinutes(time(0, 6720), 4320)).toBe(2400)
    expect(playedMinutes(time(0, 300), 900)).toBe(0)
  })

  it('takes idle time off the PC’s hours first, then a console’s', () => {
    expect(playedMinutes(time(0, 100, 500), 300)).toBe(300)
  })

  it('takes nothing off what the app counted', () => {
    expect(playedMinutes(time(3000, 6720), 4320)).toBe(3000)
  })

  it('goes on counting what the stores add after the idle time is taken out', () => {
    expect(playedMinutes(time(0, 7200), 4320)).toBe(2880)
  })

  it('adds a game’s seconds up before they are rounded to minutes', () => {
    expect(trackedMinutes(59)).toBe(0)
    expect(trackedMinutes(90 + 90)).toBe(3)
  })
})

describe('where a source’s hours belong', () => {
  it('is the PC for Steam, and a console for Nintendo', () => {
    expect(isPcSource('steam')).toBe(true)
    expect(isPcSource('nintendo')).toBe(false)
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
