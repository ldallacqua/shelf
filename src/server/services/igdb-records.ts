import 'server-only'

import { inArray } from 'drizzle-orm'

import { toGameData, type GameData } from '@/domain/igdb/game'
import type { IgdbGame, IgdbNamed, IgdbTimeToBeat, VocabKind } from '@/domain/igdb/schema'
import { toPlatform, type Platform } from '@/domain/platforms/platforms'
import type { Db } from '@/server/db/client'
import { vocab } from '@/server/db/schema'
import type { IgdbApi } from '@/server/igdb/api'
import type { CoverArt } from '@/server/library/store'

/**
 * IGDB's records with everything Shelf stores beside them: their family
 * chains, times to beat, the names they use, and their covers' colors.
 * Adding a game asks for these, and so does the daily refresh.
 */

const NAMED_KINDS = [
  ['genre', 'genres'],
  ['theme', 'themes'],
  ['mode', 'modes'],
  ['perspective', 'perspectives'],
  ['franchise', 'franchises'],
  ['series', 'series'],
  ['keyword', 'keywords'],
] as const satisfies readonly (readonly [Exclude<VocabKind, 'company'>, string])[]

export type NamesToStore = { kind: (typeof NAMED_KINDS)[number][0]; items: IgdbNamed[] }[]

/** Cover images read at once while many games are added: images.igdb.com, not the API. */
const ART_AT_ONCE = 6

/** `run` over every item, at most `limit` at a time, in order. */
const eachLimited = async <T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await run(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export type RecordsDeps = {
  db: Db
  igdb: IgdbApi
  readArt: (imageId: string) => Promise<CoverArt | undefined>
}

export const createRecords = ({ db, igdb: api, readArt }: RecordsDeps) => {
  // IGDB's platforms change a few times a year: asked once per server, for every library.
  let platformList: Promise<Map<number, Platform>> | undefined
  const allPlatforms = () => {
    platformList ??= api
      .platforms()
      .then((list) => new Map(list.map((record) => [record.id, toPlatform(record)])))
    platformList.catch(() => (platformList = undefined))
    return platformList
  }

  /** Names these records use that are not stored yet, one request a kind for all of them. */
  const missingNames = async (records: readonly GameData[]): Promise<NamesToStore> => {
    const wanted = new Set(
      records.flatMap((data) => NAMED_KINDS.flatMap(([, field]) => data[field])),
    )
    if (wanted.size === 0) return []
    const known = await db
      .select({ kind: vocab.kind, id: vocab.id })
      .from(vocab)
      .where(inArray(vocab.id, [...wanted]))
    const have = new Set(known.map((row) => `${row.kind}:${row.id}`))
    return Promise.all(
      NAMED_KINDS.map(async ([kind, field]) => {
        const ids = [...new Set(records.flatMap((data) => data[field]))].filter(
          (id) => !have.has(`${kind}:${id}`),
        )
        const items: IgdbNamed[] = ids.length > 0 ? await api.named(kind, ids) : []
        return { kind, items }
      }),
    )
  }

  /** The names one record uses, of those fetched for many. */
  const namesOf = (data: GameData, names: NamesToStore): NamesToStore =>
    names.map(({ kind, items }) => {
      const field = NAMED_KINDS.find(([each]) => each === kind)![1]
      const used = new Set<number>(data[field])
      return { kind, items: items.filter((item) => used.has(item.id)) }
    })

  /**
   * Everything else stored beside records already fetched with their times
   * to beat: their family chains, the names they use, and the colors of the
   * covers `withArt` picks (every one, unless it says otherwise).
   */
  const complete = async (
    records: readonly IgdbGame[],
    times: ReadonlyMap<number, IgdbTimeToBeat> | Promise<ReadonlyMap<number, IgdbTimeToBeat>>,
    withArt: (data: GameData) => boolean = () => true,
  ) => {
    const [all, lineages, timed] = await Promise.all([allPlatforms(), api.lineages(records), times])
    const data = new Map(
      records.map((record) => [record.id, toGameData(record, timed.get(record.id))]),
    )
    const [names, art] = await Promise.all([
      missingNames([...data.values()]),
      eachLimited(
        [...data.values()].filter(withArt),
        ART_AT_ONCE,
        async (game) =>
          [game.igdbId, game.cover ? await readArt(game.cover.id) : undefined] as const,
      ),
    ])
    return { all, lineages, data, names, art: new Map(art) }
  }

  /**
   * Everything adding these games needs from IGDB, asked for all of them at
   * once: their records, family chains, times to beat, the names they use,
   * and their covers' colors. For one game it is the same few requests.
   */
  const fetchRecords = async (ids: readonly number[]) => {
    const [records] = await Promise.all([api.games(ids), allPlatforms()])
    return complete(records, api.timeToBeat(records.map((record) => record.id)))
  }

  return { allPlatforms, namesOf, complete, fetchRecords }
}

export type Records = ReturnType<typeof createRecords>
export type FetchedRecords = Awaited<ReturnType<Records['fetchRecords']>>
