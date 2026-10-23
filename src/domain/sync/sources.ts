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
 *   same, so the copy waits for my answer (PlayStation, Xbox).
 * - `listed`: it lists nothing by itself; the titles come from me (Nintendo).
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
  /** The format a copy takes when the source is sure of it. */
  format?: Format
  /** Built and switched on. The others are listed so the data has room for them. */
  ready: boolean
}

// IGDB platform ids, as in `domain/platforms/platforms.ts`.
const PC = 6
const MAC = 14
const LINUX = 3

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
    evidence: 'listed',
    platforms: [508, 130, 41, 37, 137],
    ready: false,
  },
}

export const readySources = (Object.keys(SOURCES) as SyncSource[]).filter(
  (source) => SOURCES[source].ready,
)

export const isSyncSource = (value: unknown): value is SyncSource =>
  typeof value === 'string' && Object.hasOwn(SOURCES, value)
