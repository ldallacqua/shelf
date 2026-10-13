import 'server-only'

import { isGame } from '@/domain/igdb/game'
import {
  igdbGameFields,
  igdbGameSchema,
  igdbLineageFields,
  igdbLineageSchema,
  igdbNamedFields,
  igdbNamedSchema,
  igdbPlatformFields,
  igdbPlatformSchema,
  igdbSearchFields,
  igdbSearchHitSchema,
  igdbTimeToBeatFields,
  igdbTimeToBeatSchema,
  vocabEndpoints,
  type IgdbGame,
  type IgdbLineage,
  type IgdbNamed,
  type IgdbPlatform,
  type IgdbSearchHit,
  type IgdbTimeToBeat,
  type VocabKind,
} from '@/domain/igdb/schema'
import { buildLineage, idsAbove } from '@/domain/library/family'
import type { LineageStep } from '@/domain/igdb/game'
import type { IgdbClient } from '@/server/igdb/client'

/**
 * The questions Shelf asks IGDB, written once. Each returns records that have
 * already passed their schema.
 */

/** IGDB returns at most 500 records a request. */
const PAGE = 500

/** IGDB's `game_types` that Shelf treats as games: everything but DLC, mods, episodes, seasons, packs and updates. */
const GAME_TYPES = '(0,3,4,8,9,10,11,12)'

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

const unique = (ids: readonly number[]): number[] => [...new Set(ids)].filter(Number.isInteger)

/** A value safe to put between double quotes in a query. */
export const quote = (text: string): string =>
  `"${text
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .trim()}"`

const byIds = async <T>(
  ids: readonly number[],
  run: (list: string, count: number) => Promise<T[]>,
): Promise<T[]> => {
  const batches = await Promise.all(
    chunk(unique(ids), PAGE).map((batch) => run(`(${batch.join(',')})`, batch.length)),
  )
  return batches.flat()
}

export type IgdbApi = ReturnType<typeof createIgdbApi>

export const createIgdbApi = (client: IgdbClient) => {
  /** Full records, with everything Shelf stores. */
  const games = (ids: readonly number[]): Promise<IgdbGame[]> =>
    byIds(ids, (list, count) =>
      client.query(
        'games',
        `fields ${igdbGameFields.join(',')}; where id = ${list}; limit ${count};`,
        igdbGameSchema,
      ),
    )

  const timeToBeat = async (ids: readonly number[]): Promise<Map<number, IgdbTimeToBeat>> => {
    const rows = await byIds(ids, (list, count) =>
      client.query(
        'game_time_to_beats',
        `fields ${igdbTimeToBeatFields.join(',')}; where game_id = ${list}; limit ${count};`,
        igdbTimeToBeatSchema,
      ),
    )
    return new Map(rows.map((row) => [row.game_id, row]))
  }

  const lineageRecords = (ids: readonly number[]): Promise<IgdbLineage[]> =>
    byIds(ids, (list, count) =>
      client.query(
        'games',
        `fields ${igdbLineageFields.join(',')}; where id = ${list}; limit ${count};`,
        igdbLineageSchema,
      ),
    )

  /**
   * The family chain above each record: one request per level, and most
   * games have no level above them at all.
   */
  const lineages = async (
    records: readonly IgdbLineage[],
    known: ReadonlyMap<number, IgdbLineage> = new Map(),
  ): Promise<Map<number, LineageStep[]>> => {
    const lookup = new Map<number, IgdbLineage>(known)
    for (const record of records) lookup.set(record.id, record)

    let frontier = unique(records.flatMap(idsAbove)).filter((id) => !lookup.has(id))
    for (let depth = 0; depth < 6 && frontier.length > 0; depth += 1) {
      const fetched = await lineageRecords(frontier)
      for (const record of fetched) lookup.set(record.id, record)
      frontier = unique(fetched.flatMap(idsAbove)).filter((id) => !lookup.has(id))
    }

    return new Map(
      records.map((record) => [record.id, buildLineage(record, (id) => lookup.get(id))]),
    )
  }

  /** Names for ids of one kind: genres, themes, keywords, franchises and so on. */
  const named = (
    kind: Exclude<VocabKind, 'company'>,
    ids: readonly number[],
  ): Promise<IgdbNamed[]> =>
    byIds(ids, (list, count) =>
      client.query(
        vocabEndpoints[kind],
        `fields ${igdbNamedFields.join(',')}; where id = ${list}; limit ${count};`,
        igdbNamedSchema,
      ),
    )

  const platforms = (ids?: readonly number[]): Promise<IgdbPlatform[]> =>
    ids
      ? byIds(ids, (list, count) =>
          client.query(
            'platforms',
            `fields ${igdbPlatformFields.join(',')}; where id = ${list}; limit ${count};`,
            igdbPlatformSchema,
          ),
        )
      : client.query(
          'platforms',
          `fields ${igdbPlatformFields.join(',')}; limit ${PAGE}; sort id asc;`,
          igdbPlatformSchema,
        )

  /**
   * Search as I type. Editions are left out here; ports are folded under
   * their originals afterward, by `foldSearchHits`.
   */
  const search = async (text: string, limit = 30): Promise<IgdbSearchHit[]> => {
    const hits = await client.query(
      'games',
      `search ${quote(text)}; fields ${igdbSearchFields.join(',')}; where game_type = ${GAME_TYPES} & version_parent = null; limit ${Math.min(limit, PAGE)};`,
      igdbSearchHitSchema,
    )
    return hits.filter(isGame)
  }

  /**
   * Exact-title lookups, ten to a request, for a pasted list. Each title gets
   * its matches, most-rated first. `search` does not work inside a
   * multi-query, so this matches the name without regard to case.
   */
  const findByTitles = async (titles: readonly string[]): Promise<IgdbSearchHit[][]> => {
    const batches = await Promise.all(
      chunk(titles, 10).map((batch) =>
        client.multi(
          batch.map((title) => ({
            endpoint: 'games',
            body: `fields ${igdbSearchFields.join(',')}; where name ~ ${quote(title)} & game_type = ${GAME_TYPES} & version_parent = null; sort total_rating_count desc; limit 10;`,
          })),
          igdbSearchHitSchema,
        ),
      ),
    )
    return batches.flat().map((hits) => hits.filter(isGame))
  }

  return { games, timeToBeat, lineages, named, platforms, search, findByTitles }
}
