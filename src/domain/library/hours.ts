import type { Length } from '@/domain/igdb/game'

/**
 * A game's hours (ADR 003): the larger of what I typed and what its sources
 * report together, so the same play is never counted twice. Steam and
 * Nintendo count the whole time a game is open, played or not, so what I
 * say sat idle comes off what they report; what I typed is taken as it is.
 */
export const playedMinutes = (typed: number, reported: number, idle = 0): number =>
  Math.max(typed, Math.max(0, reported - idle))

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
 * them for a look. It says nothing of hours I typed, which are mine.
 */
export const pastIgdb = (reported: number, length: Length | undefined): IgdbTime | undefined => {
  const known = reachOf(length)
  if (!known) return undefined
  return reported > known.reach * TIMES && reported - known.reach >= MARGIN ? known.time : undefined
}
