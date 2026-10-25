import 'server-only'

import { asc, inArray, isNotNull } from 'drizzle-orm'

import { toGameData } from '@/domain/igdb/game'
import { database } from '@/server/db/client'
import { entryVersions, games } from '@/server/db/schema'
import { igdb } from '@/server/igdb'
import { readCoverArt } from '@/server/igdb/cover-art'
import {
  bumpVersion,
  saveCompanies,
  saveGame,
  savePlatforms,
  saveVocab,
} from '@/server/library/store'
import { createRecords, type RecordsDeps } from '@/server/services/igdb-records'

/**
 * The daily refresh (architecture, section 8). IGDB's records change after
 * they are stored: a rating, a cover, a release, a time to beat. Once a day
 * the records checked longest ago are asked for again, 100 of them: two
 * requests when nothing changed, so a library of 1,000 games is never more
 * than ten days behind. A record that changed is stored again, with its
 * address kept, and every library holding it gets a new version.
 */

/** Records asked for again each day. */
export const REFRESH_COUNT = 100

export type Refreshed = {
  /** Records asked for again. */
  checked: number
  /** Of those, the ones IGDB had changed, stored again. */
  changed: number
  /** The libraries that hold a changed record: their pages are out of date. */
  libraries: string[]
}

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export const createRefresh = (deps: RecordsDeps) => {
  const { db, igdb: api } = deps
  const records = createRecords(deps)

  return async (count = REFRESH_COUNT, now = Date.now()): Promise<Refreshed> => {
    const held = await db
      .select({
        id: games.id,
        igdbId: games.igdbId,
        slug: games.slug,
        cover: games.cover,
        length: games.length,
        updatedAt: games.igdbUpdatedAt,
        adultsOnly: games.adultsOnly,
      })
      .from(games)
      // A game not from IGDB has nothing to ask about.
      .where(isNotNull(games.igdbId))
      .orderBy(asc(games.checkedAt), asc(games.igdbId))
      .limit(count)
    if (held.length === 0) return { checked: 0, changed: 0, libraries: [] }
    const ids = held.flatMap((row) => (row.igdbId === null ? [] : [row.igdbId]))
    const byIgdbId = new Map(held.map((row) => [row.igdbId, row]))

    // The two requests: the records, and their times to beat, which IGDB keeps apart.
    const [fresh, times] = await Promise.all([api.games(ids), api.timeToBeat(ids)])
    const stale = fresh.filter((record) => {
      const stored = byIgdbId.get(record.id)
      const data = toGameData(record, times.get(record.id))
      return (
        !stored ||
        (data.igdbUpdatedAt ?? null) !== stored.updatedAt ||
        !same(data.length, stored.length) ||
        // Stored before its age ratings were asked for (spec 3.13): stored again, once.
        stored.adultsOnly === null
      )
    })

    // Only what changed is worth the rest: family chains, new names, a new cover's colors.
    const fetched =
      stale.length > 0
        ? await records.complete(
            stale,
            times,
            (data) => data.cover?.id !== byIgdbId.get(data.igdbId)?.cover?.id,
          )
        : undefined

    const libraries = await db.transaction(async (tx) => {
      const changedIds: string[] = []
      if (fetched) {
        const platformIds = new Set([...fetched.data.values()].flatMap((data) => data.platforms))
        await savePlatforms(
          tx,
          [...platformIds].flatMap((id) => fetched.all.get(id) ?? []),
        )
        await saveCompanies(
          tx,
          [...fetched.data.values()].flatMap((data) => data.companies),
        )
        for (const { kind, items } of fetched.names) await saveVocab(tx, kind, items)
        for (const data of fetched.data.values()) {
          const stored = byIgdbId.get(data.igdbId)
          if (!stored) continue
          const art = fetched.art.get(data.igdbId)
          // A game's address never changes under a refresh: links to it keep working.
          changedIds.push(
            await saveGame(
              tx,
              { ...data, slug: stored.slug },
              { lineage: fetched.lineages.get(data.igdbId) ?? [], ...(art ? { art } : {}), now },
            ),
          )
        }
      }
      // Asked, changed or not, and IGDB's own deletions too: the next run takes the next oldest.
      await tx.update(games).set({ checkedAt: now }).where(inArray(games.igdbId, ids))

      if (changedIds.length === 0) return []
      const holders = await tx
        .selectDistinct({ libraryId: entryVersions.userId })
        .from(entryVersions)
        .where(inArray(entryVersions.gameId, changedIds))
      const found = holders.flatMap((row) => (row.libraryId ? [row.libraryId] : []))
      for (const libraryId of found) await bumpVersion(tx, libraryId)
      return found
    })

    return { checked: held.length, changed: stale.length, libraries }
  }
}

let shared: ReturnType<typeof createRefresh> | undefined

/** The refresh for this server, against IGDB itself (or its test double, under `SHELF_MOCKS`). */
export const refreshOldest = (count?: number) =>
  (shared ??= createRefresh({ db: database(), igdb: igdb(), readArt: (id) => readCoverArt(id) }))(
    count,
  )
