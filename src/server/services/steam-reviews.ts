import 'server-only'

import { and, asc, eq, inArray, isNotNull, like, or, sql } from 'drizzle-orm'

import { mostReviewed, reviewsMoved, type SteamReviews } from '@/domain/steam/reviews'
import { database, type Db } from '@/server/db/client'
import { entryVersions, games } from '@/server/db/schema'
import { bumpVersion } from '@/server/library/store'
import { steam, type Steam } from '@/server/sync/steam'

/**
 * What Steam's players say of each game with a page there (spec 7.11), asked
 * once a day beside the refresh of IGDB's records, a hundred apps to a request.
 * Nothing a visitor does reaches Steam. A game only gets a new version of the
 * shelves holding it when what its page shows has moved (`reviewsMoved`).
 */

/** More games than the catalog holds today; past this, the longest unasked go first. */
export const REVIEWS_COUNT = 5_000

/** How many ids one statement names: well under SQLite's limit on a statement's values. */
const IDS_PER_QUERY = 200

const chunks = <T>(items: readonly T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / IDS_PER_QUERY) }, (_, at) =>
    items.slice(at * IDS_PER_QUERY, (at + 1) * IDS_PER_QUERY),
  )

export type ReviewsRead = {
  /** Games asked about. */
  checked: number
  /** Of those, the ones whose page now shows something else. */
  changed: number
  /** The libraries that hold a changed game: their pages are out of date. */
  libraries: string[]
}

export const createSteamReviews =
  ({ db, reviews }: { db: Db; reviews: Steam['reviews'] }) =>
  async (count = REVIEWS_COUNT, now = Date.now()): Promise<ReviewsRead> => {
    const rows = await db
      .select({
        id: games.id,
        steamAppId: games.steamAppId,
        storeIds: games.storeIds,
        stored: games.steamReviews,
      })
      .from(games)
      .where(or(isNotNull(games.steamAppId), like(games.storeIds, '%"steam"%')))
      .orderBy(sql`${games.steamReviewsCheckedAt} is not null`, asc(games.steamReviewsCheckedAt))
      .limit(count)
    const held = rows.map((row) => ({
      ...row,
      apps: [
        ...new Set([
          ...(row.steamAppId ? [row.steamAppId] : []),
          ...row.storeIds.flatMap((store) => (store.source === 'steam' ? [store.uid] : [])),
        ]),
      ],
    }))
    if (held.length === 0) return { checked: 0, changed: 0, libraries: [] }

    const known = await reviews(held.flatMap((game) => game.apps))
    // An app whose request failed is simply not known: its game keeps what it has for another day.
    const answered = held.filter((game) => game.apps.some((app) => known.answered.has(app)))
    const changes: { id: string; now: SteamReviews | undefined }[] = []
    for (const game of answered) {
      const found = mostReviewed(game.apps, known.reviews)
      if (reviewsMoved(game.stored, found)) changes.push({ id: game.id, now: found })
    }

    const libraries = await db.transaction(async (tx) => {
      for (const change of changes) {
        await tx
          .update(games)
          .set({ steamReviews: change.now ?? null })
          .where(eq(games.id, change.id))
      }
      for (const some of chunks(answered.map((game) => game.id))) {
        await tx.update(games).set({ steamReviewsCheckedAt: now }).where(inArray(games.id, some))
      }
      if (changes.length === 0) return []
      const holders = new Set<string>()
      for (const some of chunks(changes.map((change) => change.id))) {
        const found = await tx
          .selectDistinct({ libraryId: entryVersions.userId })
          .from(entryVersions)
          .where(and(inArray(entryVersions.gameId, some), isNotNull(entryVersions.userId)))
        for (const row of found) if (row.libraryId) holders.add(row.libraryId)
      }
      const all = [...holders]
      for (const libraryId of all) await bumpVersion(tx, libraryId)
      return all
    })

    return { checked: answered.length, changed: changes.length, libraries }
  }

let shared: ReturnType<typeof createSteamReviews> | undefined

/** The reading for this server, against Steam itself (or its test double, under `SHELF_MOCKS`). */
export const readSteamReviews = (count?: number) =>
  (shared ??= createSteamReviews({
    db: database(),
    reviews: (apps) => steam().reviews(apps),
  }))(count)
