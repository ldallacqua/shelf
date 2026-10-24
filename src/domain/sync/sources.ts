import type { StoreSource } from '@/domain/igdb/game'
import type { Format, SyncSource } from '@/domain/library/values'

/**
 * What each source can tell us (ADR 003, "What each source can tell us"),
 * and so what one of its games becomes. Everything a sync does that differs
 * between Steam, PlayStation, Xbox and Nintendo is read from here or from
 * that source's adapter in `server/sync/`; the ladder, the memory and the
 * writes are the same for all four.
 */

/**
 * - `owned`: the source lists what I own, so a matched game is a copy at once (Steam).
 * - `played`: it lists what I played; a disc, a download and a subscription look the
 *   same, so the copy waits for my answer (Nintendo, PlayStation, Xbox).
 * - `listed`: it lists nothing by itself; the titles come from me (an import, not built).
 */
export const evidences = ['owned', 'played', 'listed'] as const
export type Evidence = (typeof evidences)[number]

export type SourceFacts = {
  evidence: Evidence
  /** The IGDB store whose ids this source reports, for the ladder's second rung. None for Nintendo. */
  store?: StoreSource
  /** The IGDB platform a copy goes on when the source does not say. */
  platformId?: number
  /** The platforms a title match must be on, IGDB ids. */
  platforms: readonly number[]
  /**
   * Consoles that also play the games of the one before them: the platforms
   * a game played on one may be on, in the order its copy is placed.
   */
  plays?: Readonly<Partial<Record<number, readonly number[]>>>
  /** The format a copy takes when the source is sure of it. */
  format?: Format
  /** Built and switched on. The others are listed so the data has room for them. */
  ready: boolean
}

// IGDB platform ids, as in `domain/platforms/platforms.ts`.
const PC = 6
const MAC = 14
const LINUX = 3
const SWITCH = 130
const SWITCH_2 = 508
const WII_U = 41
const THREE_DS = 37
const NEW_THREE_DS = 137

export const SOURCES: Record<SyncSource, SourceFacts> = {
  steam: {
    evidence: 'owned',
    store: 'steam',
    platformId: PC,
    platforms: [PC, MAC, LINUX],
    format: 'digital',
    ready: true,
  },
  playstation: {
    evidence: 'played',
    store: 'playstation',
    platforms: [167, 48, 9, 46],
    ready: false,
  },
  xbox: {
    evidence: 'played',
    store: 'microsoft',
    platforms: [169, 49, 12, 11, 6],
    ready: false,
  },
  nintendo: {
    evidence: 'played',
    platforms: [SWITCH_2, SWITCH, WII_U, THREE_DS, NEW_THREE_DS],
    // A Switch game played on a Switch 2 is a Switch copy; a Switch 2 game is a Switch 2 one.
    plays: { [SWITCH_2]: [SWITCH, SWITCH_2], [NEW_THREE_DS]: [THREE_DS, NEW_THREE_DS] },
    ready: true,
  },
}

/** The platforms a game the source reported on this one may be on: what the title rung searches. */
export const platformsFor = (source: SyncSource, platformId: number | null): readonly number[] =>
  platformId === null
    ? SOURCES[source].platforms
    : (SOURCES[source].plays?.[platformId] ?? [platformId])

/**
 * The platform a game's copy goes on, given the platforms its record is on:
 * of those its console plays, the first the game is on. Where the source
 * names no platform, the source's own, or the first of its platforms the
 * game is on.
 */
export const copyPlatform = (
  source: SyncSource,
  platformId: number | null,
  on: readonly number[],
): number | undefined => {
  const facts = SOURCES[source]
  if (platformId === null) return facts.platformId ?? facts.platforms.find((id) => on.includes(id))
  return platformsFor(source, platformId).find((id) => on.includes(id)) ?? platformId
}

export const readySources = (Object.keys(SOURCES) as SyncSource[]).filter(
  (source) => SOURCES[source].ready,
)

export const isSyncSource = (value: unknown): value is SyncSource =>
  typeof value === 'string' && Object.hasOwn(SOURCES, value)
