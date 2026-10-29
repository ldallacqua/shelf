import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { copies, entries, entryVersions, games, playTime, sourceItems } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { LibraryError, patchEntry, readVersion } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { createSteamHandlers, newSteamMockState } from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { saveLink } from '@/server/sync/memory'
import { createNintendo } from '@/server/sync/nintendo'
import { createSteam } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'
import { network } from '@/test/network'

import { createAdding } from './adding'
import { createSync } from './sync'

/**
 * "Not this game" (spec 4.5): a game a sync took for the wrong one, made
 * the game I pick. Synced from the made-up Steam account, as
 * `placing.test.ts` does; its DOOM stands in for the game taken wrongly.
 */

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'aGFzaA==',
}
const NOW = (1_760_000_000 + 24 * 86_400) * 1000

const PC = 6
const SWITCH = 130
/** In the fixtures, and on no shelf the sync fills. */
const HALF_LIFE = 231
/** Steam's own ids for the made-up account's games. */
const DOOM_APP = '430910'
const PORTAL_APP = '52003'

let db: Db
let player: string
let sync: ReturnType<ReturnType<typeof createSync>>
let adding: ReturnType<ReturnType<typeof createAdding>>

const syncAll = async () => {
  let step = await sync.step('steam', { read: true }, NOW)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) step = await sync.step('steam', {}, NOW)
}

beforeEach(async () => {
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(newSteamMockState()))
  db = await createTestDatabase('default')
  player = await createTestAccount(db, 'player')
  await saveLink(db, player, 'steam', { externalId: MOCK_STEAM.steamId })
  sync = createSync({
    db,
    igdb: api,
    readArt: async () => ART,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    nintendo: createNintendo(),
  })(player)
  adding = createAdding({ db, igdb: api, readArt: async () => ART })(player)
  await syncAll()
})

/** The entry a Steam game fed, and that game's item. */
const synced = async (storeId: string) => {
  const [item] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, player), eq(sourceItems.storeId, storeId)))
  const [copy] = await db.select().from(copies).where(eq(copies.id, item!.copyId!))
  return { item: item!, copy: copy!, entryId: copy!.entryId }
}

const titleOf = async (entryId: string) => {
  const [row] = await db
    .select({ title: games.title, igdbId: games.igdbId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.relation, 'primary')))
  return row
}

const steamMinutes = async (entryId: string) =>
  (
    await db
      .select({ minutes: playTime.minutes, copyId: playTime.copyId })
      .from(playTime)
      .where(and(eq(playTime.entryId, entryId), eq(playTime.source, 'steam')))
  ).map((row) => row.minutes)

const entryCount = async () =>
  (await db.select({ id: entries.id }).from(entries).where(eq(entries.userId, player))).length

describe('a game the sync took for the wrong one', () => {
  it('becomes the game I pick, keeping its status, rating, copy and Steam hours', async () => {
    const doom = await synced(DOOM_APP)
    const wrongGame = await titleOf(doom.entryId)
    await patchEntry(db, player, doom.entryId, { mine: { rating: 70 } })
    const [before] = await db.select().from(entries).where(eq(entries.id, doom.entryId))
    const version = await readVersion(db, player)
    const count = await entryCount()

    const done = await adding.rematch(doom.entryId, HALF_LIFE)

    expect(done).toMatchObject({ entryId: doom.entryId, title: 'Half-Life', merged: false })
    expect(done.version).toBeGreaterThan(version)
    expect(await titleOf(doom.entryId)).toEqual({ title: 'Half-Life', igdbId: HALF_LIFE })
    const [after] = await db.select().from(entries).where(eq(entries.id, doom.entryId))
    expect(after).toMatchObject({ status: before!.status, rating: 70 })
    expect(await db.select().from(copies).where(eq(copies.entryId, doom.entryId))).toEqual([
      doom.copy,
    ])
    expect(await steamMinutes(doom.entryId)).toEqual([doom.item.minutes])
    expect(await entryCount()).toBe(count)

    // The sync remembers the game I said it is, and the record it took is no one's now.
    const [item] = await db.select().from(sourceItems).where(eq(sourceItems.id, doom.item.id))
    expect(item).toMatchObject({ igdbId: HALF_LIFE, resolvedBy: 'owner', copyId: doom.copy.id })
    const left = await db.select().from(games).where(eq(games.igdbId, wrongGame!.igdbId!))
    const stillUsed = await db
      .select({ gameId: entryVersions.gameId })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(games.igdbId, wrongGame!.igdbId!))
    expect(left.length).toBe(stillUsed.length > 0 ? 1 : 0)
  })

  it('stays the game I picked when the account syncs again', async () => {
    const doom = await synced(DOOM_APP)
    await adding.rematch(doom.entryId, HALF_LIFE)
    const count = await entryCount()
    await syncAll()
    expect(await entryCount()).toBe(count)
    expect((await titleOf(doom.entryId))?.title).toBe('Half-Life')
  })

  it('folds into the game already on my shelf, its copy joining and keeping what I set there', async () => {
    const added = await adding.add({
      igdbId: HALF_LIFE,
      status: 'backlog',
      rating: 80,
      copies: [{ platformId: SWITCH, format: 'physical' }],
    })
    const halfLife = added.undo.entryId
    const doom = await synced(DOOM_APP)

    const done = await adding.rematch(doom.entryId, HALF_LIFE)

    expect(done).toMatchObject({ entryId: halfLife, title: 'Half-Life', merged: true })
    expect(await db.select().from(entries).where(eq(entries.id, doom.entryId))).toEqual([])
    const [kept] = await db.select().from(entries).where(eq(entries.id, halfLife))
    expect(kept).toMatchObject({ status: 'backlog', rating: 80 })
    const owned = await db.select().from(copies).where(eq(copies.entryId, halfLife))
    expect(owned).toHaveLength(2)
    expect(owned.map((copy) => [copy.platformId, copy.format])).toEqual(
      expect.arrayContaining([
        [PC, 'digital'],
        [SWITCH, 'physical'],
      ]),
    )
    expect(owned.find((copy) => copy.platformId === PC)?.id).toBe(doom.copy.id)
    expect(await steamMinutes(halfLife)).toEqual([doom.item.minutes])
  })

  it('feeds the copy that game already has there, with both games’ hours, and takes what it lacks', async () => {
    const doom = await synced(DOOM_APP)
    const portal = await synced(PORTAL_APP)
    const portalGame = await titleOf(portal.entryId)
    await patchEntry(db, player, doom.entryId, { mine: { rating: 70 }, idle: 30 })

    const done = await adding.rematch(doom.entryId, portalGame!.igdbId!)

    expect(done).toMatchObject({ entryId: portal.entryId, merged: true })
    const owned = await db.select().from(copies).where(eq(copies.entryId, portal.entryId))
    expect(owned.map((copy) => copy.id)).toEqual([portal.copy.id])
    expect(await steamMinutes(portal.entryId)).toEqual([portal.item.minutes + doom.item.minutes])
    const [item] = await db.select().from(sourceItems).where(eq(sourceItems.id, doom.item.id))
    expect(item?.copyId).toBe(portal.copy.id)
    const [kept] = await db.select().from(entries).where(eq(entries.id, portal.entryId))
    expect(kept?.rating).toBe(70)
    // Its hours came, and so did the time they sat idle.
    expect(kept?.idleMinutes).toBe(30)
  })

  it('finds nothing of another library’s', async () => {
    const theirs = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.userId, await sampleLibraryId(db)))
      .limit(1)
    await expect(adding.rematch(theirs[0]!.id, HALF_LIFE)).rejects.toMatchObject({
      code: 'not-found',
    })
  })

  it('changes nothing for a game IGDB does not have', async () => {
    const doom = await synced(DOOM_APP)
    const before = await titleOf(doom.entryId)
    await expect(adding.rematch(doom.entryId, 999_999_999)).rejects.toBeInstanceOf(LibraryError)
    expect(await titleOf(doom.entryId)).toEqual(before)
  })
})
