import type { Length } from '@/domain/igdb/game'
import { isPcPlatform } from '@/domain/library/stores'
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

/** A source's minutes, on the side of `GameTime` they belong to, for a report on no copy. */
export const isPcSource = (source: SyncSource): boolean => SOURCES[source].pc === true

/**
 * What a store reports of a game, on the copy it belongs to (ADR 003). `platform` is the copy's;
 * absent for a report kept on no copy, which its store's kind then places.
 */
export type StoreReport<S extends string = SyncSource> = {
  source: S
  platform?: number
  minutes: number
}

/**
 * Whether a report is play on a computer, where Shelf for Windows saw the same play: by the
 * platform of its copy (#153), so Xbox's hours on a PC copy overlap the app's as Steam's do, and
 * its hours on a console add to them.
 */
const onPc = ({ source, platform }: StoreReport<string>): boolean =>
  platform === undefined ? isPcSource(source as SyncSource) : isPcPlatform(platform)

/** A game's time, from what its stores report and what the app counted. */
export const gameTimeOf = (tracked: number, reports: readonly StoreReport<string>[]): GameTime => {
  const time: GameTime = { tracked, pc: 0, console: 0 }
  for (const report of reports) {
    if (onPc(report)) time.pc += report.minutes
    else time.console += report.minutes
  }
  return time
}

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

/** Where Shelf for Windows' hours stand among a game's sources: they are always play on a PC. */
export const TRACKED = 'tracked'

/** One source's hours on a platform, and whether they are the same play as another's there. */
export type SourceTime<S extends string = SyncSource> = {
  source: S | typeof TRACKED
  /** As it reports them, before any idle time comes off. */
  minutes: number
  /** Saw the same play as another source on this platform, whose hours count instead. */
  overlaps: boolean
}

/** One platform's share of a game's hours: what it adds to the total, and its sources. */
export type PlatformTime<S extends string = SyncSource> = {
  /** Every computer is one platform here: the app can't tell Windows from Linux. */
  platform: 'pc' | number
  minutes: number
  sources: SourceTime<S>[]
}

/** A game's hours, platform by platform, the largest first, as its page breaks them down. */
export type PlayTime<S extends string = SyncSource> = {
  total: number
  platforms: PlatformTime<S>[]
  /** The idle time taken off, as I set it: the platforms' minutes are what is left. */
  idle: number
}

const byMinutes = (a: { minutes: number }, b: { minutes: number }) => b.minutes - a.minutes

/**
 * A game's hours broken down by the platform of the copy they are on (#153), adding up to
 * `playedMinutes`: on a PC the larger of the app's and its stores', the other marked as the same
 * play; each console's added. Idle time comes off the PC's stores first, then the consoles', the
 * largest first.
 */
export const playTimeOf = <S extends string = SyncSource>({
  tracked,
  reports,
  idle = 0,
}: {
  tracked: number
  reports: readonly StoreReport<S>[]
  idle?: number
}): PlayTime<S> => {
  const groups = new Map<'pc' | number, Map<S, number>>()
  for (const report of reports) {
    const key = onPc(report) ? 'pc' : (report.platform ?? -1)
    const sources = groups.get(key) ?? new Map<S, number>()
    sources.set(report.source, (sources.get(report.source) ?? 0) + report.minutes)
    groups.set(key, sources)
  }
  const sum = (sources: ReadonlyMap<S, number> | undefined) =>
    [...(sources?.values() ?? [])].reduce((total, minutes) => total + minutes, 0)

  const platforms: PlatformTime<S>[] = []
  const pcStores = sum(groups.get('pc'))
  const pcLeft = Math.max(0, pcStores - idle)
  let idleLeft = Math.max(0, idle - pcStores)
  if (tracked > 0 || pcStores > 0) {
    // On a tie the app's count stands: it has no idle time in it.
    const storesCount = pcLeft > tracked
    platforms.push({
      platform: 'pc',
      minutes: Math.max(tracked, pcLeft),
      sources: [
        ...[...(groups.get('pc') ?? [])].map(([source, minutes]) => ({
          source,
          minutes,
          overlaps: tracked > 0 && !storesCount,
        })),
        ...(tracked > 0
          ? [
              {
                source: TRACKED as typeof TRACKED,
                minutes: tracked,
                overlaps: storesCount && pcStores > 0,
              },
            ]
          : []),
      ].sort(byMinutes),
    })
  }
  const consoles = [...groups]
    .filter(([key]) => key !== 'pc')
    .map(([platform, sources]) => ({ platform, sources, reported: sum(sources) }))
    .sort((a, b) => b.reported - a.reported)
  for (const { platform, sources, reported } of consoles) {
    const taken = Math.min(reported, idleLeft)
    idleLeft -= taken
    platforms.push({
      platform,
      minutes: reported - taken,
      sources: [...sources]
        .map(([source, minutes]) => ({ source, minutes, overlaps: false }))
        .sort(byMinutes),
    })
  }
  platforms.sort(byMinutes)
  return {
    total: platforms.reduce((total, each) => total + each.minutes, 0),
    platforms,
    idle,
  }
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
