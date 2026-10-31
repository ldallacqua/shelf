import type { Length } from '@/domain/igdb/game'
import { SOURCES } from '@/domain/sync/sources'

import type { SyncSource } from './values'

/**
 * How long without a key, the mouse or a controller before Shelf for Windows calls it time away.
 * The app counts by the same number (`desktop/src/tracker.rs`), and the page says it in words.
 */
export const AWAY_AFTER_MINUTES = 5

/** What makes up a game's hours, in minutes. */
export type GameTime = {
  /** What Shelf for Windows counted. */
  tracked: number
  /** What stores on this kind of computer report: the same play the app may have counted. */
  pc: number
  /** What consoles report: play the app cannot have seen. */
  console: number
}

/** A source's minutes, on the side of `GameTime` they belong to. */
export const isPcSource = (source: SyncSource): boolean => SOURCES[source].pc === true

/**
 * A game's hours (ADR 003): the same play is never counted twice. A game opened through Steam is
 * in both Steam's hours and the app's, so a PC game takes the larger of the two; a console's are
 * another play, and add to it. Steam and Nintendo count the whole time a game is open, played or
 * not, so what I say sat idle comes off what they report, the PC's first, and never off what the
 * app counted, which has no idle time in it.
 */
export const playedMinutes = ({ tracked, pc, console }: GameTime, idle = 0): number => {
  const pcLeft = Math.max(0, pc - idle)
  const idleLeft = Math.max(0, idle - pc)
  return Math.max(tracked, pcLeft) + Math.max(0, console - idleLeft)
}

/** Whole minutes of what the app counted: a game's seconds add up before they are rounded. */
export const trackedMinutes = (seconds: number): number => Math.floor(seconds / 60)

/** Past this many times IGDB's time to see everything, a store's hours are worth a look. */
const TIMES = 2

/** And by at least this much: ten hours. A short game played twice is no surprise. */
const MARGIN = 600

/** IGDB's time a store's hours are set against: to see everything, or else for a playthrough. */
export type IgdbTime = { minutes: number; of: 'completely' | 'normally' }

/** IGDB's time, and how far past it is far: twice everything, or three playthroughs. */
const reachOf = (length: Length | undefined) => {
  if (length?.completely) {
    return {
      time: { minutes: length.completely, of: 'completely' } as IgdbTime,
      reach: length.completely,
    }
  }
  if (length?.normally) {
    return {
      time: { minutes: length.normally, of: 'normally' } as IgdbTime,
      reach: Math.round(length.normally * 1.5),
    }
  }
  return undefined
}

/**
 * IGDB's time for a game whose stores report far more than it: twice its
 * time to see everything, and ten hours past it. Those are the games where
 * time left open can weigh on every figure (the longest played, the hours
 * on a platform, the pace through the backlog), so the account page offers
 * them for a look.
 */
export const pastIgdb = (reported: number, length: Length | undefined): IgdbTime | undefined => {
  const known = reachOf(length)
  if (!known) return undefined
  return reported > known.reach * TIMES && reported - known.reach >= MARGIN ? known.time : undefined
}
