import 'server-only'

import { igdbSourceOf, isGame, type StoreSource } from '@/domain/igdb/game'
import {
  igdbExternalGameFields,
  igdbExternalGameSchema,
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
  type IgdbExternalGame,
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

/**
 * A title's words, as a lookup by words asks for them: split at anything not
 * a letter or a digit, apostrophes and full stops too, so "Assassin's" asks
 * for "Assassin" and "s", both in IGDB's "Assassin's Creed". Each once,
 * whatever its case.
 */
export const wordsOf = (title: string): string[] => {
  const seen = new Set<string>()
  return title.split(/[^\p{L}\p{N}]+/u).filter((word) => {
    const key = word.toLowerCase()
    if (!word || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

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
   * Search as I type. IGDB's search matches whole words only, so a word still
   * being typed finds nothing: "astral cha" has no Astral Chain. Beside it,
   * the names holding every word as typed, best known first, follow its own
   * games. Editions are left out here; ports are folded under their originals
   * afterward, by `foldSearchHits`.
   */
  const search = async (text: string, limit = 30): Promise<IgdbSearchHit[]> => {
    const count = Math.min(limit, PAGE)
    const words = text.split(/\s+/).filter(Boolean)
    const [whole, partial] = await Promise.all([
      client.query(
        'games',
        `search ${quote(text)}; fields ${igdbSearchFields.join(',')}; where game_type = ${GAME_TYPES} & version_parent = null; limit ${count};`,
        igdbSearchHitSchema,
      ),
      words.length === 0
        ? []
        : client.query(
            'games',
            `fields ${igdbSearchFields.join(',')}; where game_type = ${GAME_TYPES} & version_parent = null & ${words.map((word) => `name ~ *${quote(word)}*`).join(' & ')}; sort total_rating_count desc; limit ${count};`,
            igdbSearchHitSchema,
          ),
    ])
    const found = new Set(whole.map((hit) => hit.id))
    return [...whole, ...partial.filter((hit) => !found.has(hit.id))].filter(isGame).slice(0, count)
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

  /**
   * The games whose names hold every word of each title, in any case and
   * whatever stands between the words, ten titles to a request: what the
   * exact lookup misses when a store writes "DEAD OR ALIVE Xtreme 3 Scarlet"
   * for IGDB's "Dead or Alive Xtreme 3: Scarlet". Which of them, if any, is
   * the same title is still the caller's to decide. A title with no words
   * finds nothing.
   */
  const findByWords = async (titles: readonly string[]): Promise<IgdbSearchHit[][]> => {
    const asked = titles.map(wordsOf)
    const queries = asked.flatMap((words) =>
      words.length === 0
        ? []
        : [
            {
              endpoint: 'games' as const,
              body: `fields ${igdbSearchFields.join(',')}; where ${words.map((word) => `name ~ *${quote(word)}*`).join(' & ')} & game_type = ${GAME_TYPES} & version_parent = null; sort total_rating_count desc; limit 10;`,
            },
          ],
    )
    const found = (
      await Promise.all(chunk(queries, 10).map((batch) => client.multi(batch, igdbSearchHitSchema)))
    ).flat()
    let at = 0
    return asked.map((words) => (words.length === 0 ? [] : (found[at++] ?? []).filter(isGame)))
  }

  /**
   * The games carrying these ids of one store (the ladder's second rung,
   * ADR 003), 200 ids to a request, so the rows for them fit in one page.
   * Each id maps to every game IGDB lists for it; usually one.
   */
  const byStoreIds = async (
    store: StoreSource,
    uids: readonly string[],
  ): Promise<Map<string, IgdbExternalGame['game'][]>> => {
    const wanted = [...new Set(uids)].filter((uid) => uid.trim() !== '')
    const rows = (
      await Promise.all(
        chunk(wanted, 200).map((batch) =>
          client.query(
            'external_games',
            `fields ${igdbExternalGameFields.join(',')}; where external_game_source = ${igdbSourceOf(store)} & uid = (${batch.map(quote).join(',')}); limit ${PAGE};`,
            igdbExternalGameSchema,
          ),
        ),
      )
    ).flat()
    const found = new Map<string, IgdbExternalGame['game'][]>()
    for (const row of rows) {
      const games = found.get(row.uid) ?? []
      if (!games.some((game) => game.id === row.game.id)) games.push(row.game)
      found.set(row.uid, games)
    }
    return found
  }

  return {
    games,
    timeToBeat,
    lineages,
    named,
    platforms,
    search,
    findByTitles,
    findByWords,
    byStoreIds,
  }
}
