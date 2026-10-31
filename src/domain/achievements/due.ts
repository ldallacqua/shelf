import type { ProgressProblem } from '@/domain/achievements/achievements'

/**
 * When a set and an account's progress through it are read again (issue
 * 72). Definitions, with their unlock rates, are the same for everyone and
 * change seldom, so they are read again after a month, or as soon as the
 * provider counts another number of them; progress changes only when the
 * game is played, so it is read again after a play, and after a week
 * besides, for unlocks the provider learned late. A game with none is only
 * counted again, which costs next to nothing, since a game read around its
 * release may have none yet and every one later. A read that failed waits
 * an hour, so a sync that goes on step after step does not ask again and
 * again.
 */

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const READ_AGAIN = {
  /** A set's definitions and their unlock rates, read again this long after. */
  definitions: 30 * DAY,
  /** An account's progress through a set not played since. */
  progress: 7 * DAY,
  /** A game with none, counted again: under a day, so each daily sync does, whatever its hour. */
  none: 12 * HOUR,
  /** Anything whose last read failed. */
  failed: HOUR,
} as const

/** A set as the sync knows it, shared by every account. */
export type KnownSet = {
  /** Achievements as last read: 0 when the game has none, null before the first read. */
  count: number | null
  definedAt: number | null
  /** When an achievement was last added to it or taken out. */
  changedAt: number | null
  triedAt: number | null
  failed: boolean
}

/** An account's progress through a set, as the sync knows it. */
export type KnownProgress = {
  /** The account at the provider it was read for. */
  externalId: string
  readAt: number | null
  /**
   * The game's last play as the source told it when this was read. Compared
   * with the source's, never with Shelf's clock, which may run behind it.
   */
  playedAt: number | null
  triedAt: number | null
  problem: ProgressProblem | null
}

/** One of an account's games at a provider, and what is known of its achievements. */
export type KnownApp = {
  lastPlayedAt: number | null
  set?: KnownSet
  progress?: KnownProgress
}

export type DueWork = {
  definitions: boolean
  progress: boolean
  /** A game with none: whether the provider counts some now. */
  recount: boolean
}

const waited = (triedAt: number | null, now: number, wait: number = READ_AGAIN.failed) =>
  triedAt === null || now - triedAt >= wait

/** What is due to be read for one game, for the account at the provider now linked. */
export const dueWork = (app: KnownApp, externalId: string, now: number): DueWork => {
  const { set, progress } = app
  const definitions =
    !set ||
    ((set.definedAt === null || now - set.definedAt > READ_AGAIN.definitions) &&
      (!set.failed || waited(set.triedAt, now)))
  // Progress is read against definitions: a game with none has none to read, and one whose
  // definitions are not in yet waits for them.
  const has = definitions || (set?.count ?? 0) > 0
  const theirs = progress?.externalId === externalId ? progress : undefined
  const readAt = theirs?.readAt ?? null
  const stale =
    readAt === null ||
    (app.lastPlayedAt !== null && app.lastPlayedAt !== theirs?.playedAt) ||
    (set?.changedAt != null && set.changedAt > readAt) ||
    now - readAt > READ_AGAIN.progress
  const progressDue =
    has && stale && (!theirs || theirs.problem === null || waited(theirs.triedAt, now))
  const recount = set?.count === 0 && waited(set.triedAt, now, READ_AGAIN.none)
  return { definitions, progress: progressDue, recount }
}

export const isDue = (work: DueWork): boolean => work.definitions || work.progress || work.recount

/**
 * The order games are read in: the latest played first, so a large library
 * shows what was just played first, then the most played; the rest by id,
 * so the order holds from one step to the next.
 */
export const readOrder = <
  App extends { lastPlayedAt: number | null; minutes: number; storeId: string },
>(
  a: App,
  b: App,
): number =>
  (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0) ||
  b.minutes - a.minutes ||
  (a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0)
