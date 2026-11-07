import { describe, expect, it } from 'vitest'

import { durationOf } from './duration'
import {
  gameTimeOf,
  isPcSource,
  pastIgdb,
  playedMinutes,
  playTimeOf,
  trackedMinutes,
} from './hours'

/** A game's hours, and the games whose stores count far past IGDB (ADR 003). */

const PC = 6
const SWITCH = 130
const PS5 = 167
const XBOX_SERIES = 169

describe('a game’s hours, platform by platform (#153)', () => {
  type Made = 'steam' | 'nintendo' | 'xbox' | 'psn'
  const report = (source: Made, platform: number, minutes: number) => ({
    source,
    platform,
    minutes,
  })
  const breakdown = (tracked: number, reports: ReturnType<typeof report>[], idle = 0) =>
    playTimeOf<Made>({ tracked, reports, idle })

  it('adds up to the same total as `playedMinutes`, however the hours fall', () => {
    const cases: [number, ReturnType<typeof report>[], number][] = [
      [0, [], 0],
      [90, [], 0],
      [6, [report('steam', PC, 8400)], 0],
      [600, [report('steam', PC, 300), report('nintendo', SWITCH, 365)], 0],
      [0, [report('steam', PC, 100), report('nintendo', SWITCH, 500)], 300],
      [50, [report('steam', PC, 8400), report('nintendo', SWITCH, 365)], 120],
    ]
    for (const [tracked, reports, idle] of cases) {
      expect(breakdown(tracked, reports, idle).total).toBe(
        playedMinutes(gameTimeOf(tracked, reports), idle),
      )
    }
  })

  it('puts the app’s hours on the PC, the larger counting, the other marked as the same play', () => {
    const time = breakdown(6, [report('steam', PC, 8400)])
    expect(time.platforms).toEqual([
      {
        platform: 'pc',
        minutes: 8400,
        sources: [
          { source: 'steam', minutes: 8400, overlaps: false },
          { source: 'tracked', minutes: 6, overlaps: true },
        ],
      },
    ])
  })

  it('marks the store’s hours as the same play when the app counted more', () => {
    const [pc] = breakdown(600, [report('steam', PC, 300)]).platforms
    expect(pc?.minutes).toBe(600)
    expect(pc?.sources).toEqual([
      { source: 'tracked', minutes: 600, overlaps: false },
      { source: 'steam', minutes: 300, overlaps: true },
    ])
  })

  it('marks nothing as the same play where only one source counted', () => {
    expect(breakdown(45, []).platforms[0]?.sources).toEqual([
      { source: 'tracked', minutes: 45, overlaps: false },
    ])
    expect(breakdown(0, [report('steam', PC, 300)], 300).platforms[0]?.sources).toEqual([
      { source: 'steam', minutes: 300, overlaps: false },
    ])
  })

  it('groups by the copy’s platform: Xbox on a PC overlaps the app, PlayStation adds', () => {
    const time = breakdown(100, [report('xbox', PC, 300), report('psn', PS5, 200)])
    expect(time.total).toBe(500)
    expect(time.platforms.map((each) => [each.platform, each.minutes])).toEqual([
      ['pc', 300],
      [PS5, 200],
    ])
    expect(time.platforms[0]?.sources).toEqual([
      { source: 'xbox', minutes: 300, overlaps: false },
      { source: 'tracked', minutes: 100, overlaps: true },
    ])
  })

  it('adds Xbox’s hours on a console, which the app cannot have seen', () => {
    const time = breakdown(100, [report('xbox', XBOX_SERIES, 300)])
    expect(time.total).toBe(400)
  })

  it('takes idle time off the PC’s stores first, then the largest console’s, largest first', () => {
    const time = breakdown(
      0,
      [report('steam', PC, 100), report('nintendo', SWITCH, 500), report('psn', PS5, 50)],
      300,
    )
    expect(time.platforms.map((each) => [each.platform, each.minutes])).toEqual([
      [SWITCH, 300],
      [PS5, 50],
      ['pc', 0],
    ])
    expect(time.idle).toBe(300)
    expect(time.total).toBe(350)
  })

  it('places a report on no copy by its store, as before copies had platforms', () => {
    expect(gameTimeOf(0, [{ source: 'steam', minutes: 60 }])).toEqual({
      tracked: 0,
      pc: 60,
      console: 0,
    })
    expect(gameTimeOf(0, [{ source: 'nintendo', minutes: 60 }])).toEqual({
      tracked: 0,
      pc: 0,
      console: 60,
    })
  })
})

describe('how a play time is said', () => {
  it('says nothing of nothing', () => {
    expect(durationOf(0)).toEqual({ unit: 'none' })
    expect(durationOf(-3)).toEqual({ unit: 'none' })
    expect(durationOf(Number.NaN)).toEqual({ unit: 'none' })
  })

  it('says a few seconds are something, never nothing', () => {
    expect(durationOf(1 / 60)).toEqual({ unit: 'under' })
    expect(durationOf(0.99)).toEqual({ unit: 'under' })
  })

  it('says minutes under an hour, rounded down', () => {
    expect(durationOf(1)).toEqual({ unit: 'minutes', minutes: 1 })
    expect(durationOf(45.9)).toEqual({ unit: 'minutes', minutes: 45 })
    expect(durationOf(59.99)).toEqual({ unit: 'minutes', minutes: 59 })
  })

  it('says hours and minutes from an hour, and no minutes on the hour', () => {
    expect(durationOf(60)).toEqual({ unit: 'hours', hours: 1 })
    expect(durationOf(85)).toEqual({ unit: 'hoursMinutes', hours: 1, minutes: 25 })
    expect(durationOf(99 * 60 + 59.5)).toEqual({ unit: 'hoursMinutes', hours: 99, minutes: 59 })
  })

  it('says whole hours from a hundred, rounded down', () => {
    expect(durationOf(100 * 60)).toEqual({ unit: 'hours', hours: 100 })
    expect(durationOf(312 * 60 + 59)).toEqual({ unit: 'hours', hours: 312 })
  })
})

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
