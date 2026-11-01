import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { toSteamGame, wordsOf, type StoreGame } from '@/domain/steam/store-game'
import type { Db } from '@/server/db/client'
import { copies, entries, entryVersions, games, playTime, sourceItems } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readGameExtras, readOwnerPlay } from '@/server/library/read'
import { addFromSteam, removeEntry, type Placement } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { createSteamHandlers, newSteamMockState } from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { shelvedApps } from '@/server/sync/achievements'
import { saveLink } from '@/server/sync/memory'
import { createNintendo } from '@/server/sync/nintendo'
import { createSteam } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { createSync } from './sync'

/**
 * The sync, on a game IGDB does not have, that a moderator added from Steam
 * (ADR 006). The made-up Steam account owns both apps here. IGDB's double finds
 * `PLAYED`, so a test of it also shows the catalog comes first; it knows nothing of `APP`.
 */

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)
const NOW = (1_760_000_000 + 24 * 86_400) * 1000
const PC = 6
/** In `fixtures/steam/owned-games.json`, with hours, and on IGDB. */
const PLAYED = '52003'
/** In `fixtures/steam/owned-games.json`, never played, and not on IGDB. */
const APP = '2399830'

const made = (status: 'wishlist' | 'backlog' = 'wishlist'): Placement => ({
  kind: 'entry',
  entry: { status, copies: [] },
})

const steamGame = (app: string) => {
  const item: StoreGame = {
    id: Number(app),
    success: 1,
    name: 'Called This on Steam',
    type: 0,
    content_descriptorids: [],
    tagids: [],
    platforms: { windows: true },
  }
  return toSteamGame(item, 'As a Moderator Wrote It')
}

let db: Db
let mine: string
let theirs: string

const inCatalog = async (library: string, placement: Placement = made(), app = APP) => {
  const data = steamGame(app)
  return addFromSteam(
    db,
    library,
    {
      data,
      names: wordsOf(data),
      platforms: [
        {
          igdbId: PC,
          key: 'pc',
          name: 'PC',
          short: 'PC',
          family: 'pc',
          shape: 'keepCase',
          plastic: 'black',
        },
      ],
    },
    placement,
    NOW,
  )
}

const syncAll = async (library: string) => {
  const sync = createSync({
    db,
    igdb: api,
    readArt: async () => undefined,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    nintendo: createNintendo(),
  })(library)
  let step = await sync.step('steam', { read: true }, NOW)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) step = await sync.step('steam', {}, NOW)
}

const syncing = (library: string) =>
  createSync({
    db,
    igdb: api,
    readArt: async () => undefined,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    nintendo: createNintendo(),
  })(library)

const itemOf = async (library: string, app = APP) => {
  const [item] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, library), eq(sourceItems.storeId, app)))
  return item!
}

beforeEach(async () => {
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(newSteamMockState()))
  db = await createTestDatabase('empty')
  mine = await createTestAccount(db, 'player')
  theirs = await createTestAccount(db, 'someone')
  for (const library of [mine, theirs]) {
    await saveLink(db, library, 'steam', { externalId: MOCK_STEAM.steamId })
  }
})

describe('a sync, on a game a moderator added from Steam', () => {
  it('gives a game on my wishlist its copy and hours, and keeps what I set', async () => {
    const { entryId, gameId } = await inCatalog(mine, made(), PLAYED)
    await syncAll(mine)
    const owned = await db.select().from(copies).where(eq(copies.entryId, entryId))
    expect(owned).toEqual([expect.objectContaining({ platformId: PC, format: 'digital' })])
    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId))
    expect(entry?.status).toBe('wishlist')
    const item = await itemOf(mine, PLAYED)
    expect(item.minutes).toBeGreaterThan(0)
    expect(item).toMatchObject({
      copyId: owned[0]!.id,
      decision: 'copy',
      resolvedBy: 'store_id',
      igdbId: null,
    })
    const hours = await db.select().from(playTime).where(eq(playTime.entryId, entryId))
    expect(hours[0]?.minutes).toBe(item.minutes)
    // It is the game a moderator named, not whatever IGDB calls that title.
    const [game] = await db.select().from(games).where(eq(games.id, gameId))
    expect(game?.title).toBe('As a Moderator Wrote It')
  })

  it('makes its achievements something to read', async () => {
    await inCatalog(mine)
    expect((await shelvedApps(db, mine, 'steam')).map((app) => app.storeId)).not.toContain(APP)
    await syncAll(mine)
    expect((await shelvedApps(db, mine, 'steam')).map((app) => app.storeId)).toContain(APP)
  })

  it('adds it as a new game to a shelf that lacks it, with one row between them', async () => {
    const { gameId } = await inCatalog(theirs)
    await syncAll(mine)
    const [version] = await db
      .select()
      .from(entryVersions)
      .where(and(eq(entryVersions.userId, mine), eq(entryVersions.gameId, gameId)))
    expect(version).toBeDefined()
    const [entry] = await db.select().from(entries).where(eq(entries.id, version!.entryId))
    expect(entry?.status).toBe('unsorted')
    expect(await db.select().from(games).where(eq(games.steamAppId, APP))).toHaveLength(1)
  })

  it('does nothing more on the next sync', async () => {
    const { entryId } = await inCatalog(mine)
    await syncAll(mine)
    const [before] = await db.select().from(entries).where(eq(entries.id, entryId))
    await syncAll(mine)
    expect(await db.select().from(copies).where(eq(copies.entryId, entryId))).toHaveLength(1)
    expect((await db.select().from(entries).where(eq(entries.id, entryId)))[0]).toEqual(before)
  })

  it('does not double a copy I already said I own there', async () => {
    const { entryId } = await inCatalog(mine, {
      kind: 'entry',
      entry: { status: 'backlog', copies: [{ platformId: PC, format: 'digital' }] },
    })
    await syncAll(mine)
    const owned = await db.select().from(copies).where(eq(copies.entryId, entryId))
    expect(owned).toHaveLength(1)
    expect((await itemOf(mine)).copyId).toBe(owned[0]!.id)
  })

  it('finds a game a moderator added after the source listed it', async () => {
    await syncAll(mine)
    expect((await itemOf(mine)).copyId).toBeNull()
    await inCatalog(theirs)
    await syncAll(mine)
    expect((await itemOf(mine)).copyId).not.toBeNull()
  })

  it('leaves an item I answered as I answered it', async () => {
    await syncAll(mine)
    await db
      .update(sourceItems)
      .set({ decision: 'not_mine' })
      .where(and(eq(sourceItems.userId, mine), eq(sourceItems.storeId, APP)))
    await inCatalog(theirs)
    await syncAll(mine)
    expect(await itemOf(mine)).toMatchObject({ decision: 'not_mine', copyId: null })
  })

  it('never puts back a game I took off my shelf', async () => {
    const { entryId, gameId } = await inCatalog(mine)
    await syncAll(mine)
    await inCatalog(theirs)
    await removeEntry(db, mine, entryId)
    expect((await itemOf(mine)).decision).toBe('removed')
    await syncAll(mine)
    expect(await itemOf(mine)).toMatchObject({ decision: 'removed', copyId: null })
    expect(
      await db
        .select()
        .from(entryVersions)
        .where(and(eq(entryVersions.userId, mine), eq(entryVersions.gameId, gameId))),
    ).toEqual([])
  })

  it('reads its page’s facts on a shelf it reached by a sync', async () => {
    await inCatalog(theirs)
    await syncAll(mine)
    const extras = await readGameExtras(db, mine, `as-a-moderator-wrote-it-steam-${APP}`)
    expect(extras?.releases).toEqual([[{ platform: PC }]])
  })
})

describe('a game synced by itself (the owner, 1 Nov 2026)', () => {
  it('gives a wishlist game I just bought its copy and hours, reading nothing else', async () => {
    const { entryId } = await inCatalog(mine, made(), PLAYED)
    await syncing(mine).games('steam', [PLAYED], undefined, NOW)
    const owned = await db.select().from(copies).where(eq(copies.entryId, entryId))
    expect(owned).toEqual([expect.objectContaining({ platformId: PC, format: 'digital' })])
    const [entry] = await db.select().from(entries).where(eq(entries.id, entryId))
    expect(entry?.status).toBe('wishlist')
    const hours = await db.select().from(playTime).where(eq(playTime.entryId, entryId))
    expect(hours[0]?.minutes).toBeGreaterThan(0)
    expect(await db.select().from(sourceItems).where(eq(sourceItems.userId, mine))).toEqual([
      expect.objectContaining({ storeId: PLAYED, copyId: owned[0]!.id }),
    ])
    expect((await shelvedApps(db, mine, 'steam')).map((app) => app.storeId)).toEqual([PLAYED])
  })

  it('finds a game of IGDB’s too, and adds it to no other', async () => {
    await syncing(mine).games('steam', ['292030'], undefined, NOW)
    expect((await itemOf(mine, '292030')).copyId).not.toBeNull()
    expect(await db.select().from(sourceItems).where(eq(sourceItems.userId, mine))).toHaveLength(1)
    expect(await db.select().from(sourceItems).where(eq(sourceItems.userId, theirs))).toEqual([])
  })

  it('changes nothing for a game Steam does not list for me', async () => {
    const { entryId } = await inCatalog(mine, made(), '999999')
    await syncing(mine).games('steam', ['999999'], undefined, NOW)
    expect(await db.select().from(copies).where(eq(copies.entryId, entryId))).toEqual([])
    expect(await db.select().from(sourceItems).where(eq(sourceItems.userId, mine))).toEqual([])
  })

  it('says nothing about when the source was read', async () => {
    await inCatalog(mine, made(), PLAYED)
    await syncing(mine).games('steam', [PLAYED], undefined, NOW)
    const link = await syncing(mine).linkOf('steam')
    expect(link).toMatchObject({ readAt: null, syncedAt: null })
  })

  it('leaves alone a game I took off my shelf', async () => {
    const { entryId } = await inCatalog(mine, made(), PLAYED)
    await syncing(mine).games('steam', [PLAYED], undefined, NOW)
    await removeEntry(db, mine, entryId)
    await syncing(mine).games('steam', [PLAYED], undefined, NOW)
    expect(await itemOf(mine, PLAYED)).toMatchObject({ decision: 'removed', copyId: null })
  })

  it('does nothing for a shelf not linked to Steam', async () => {
    const other = await createTestAccount(db, 'unlinked')
    await syncing(other).games('steam', [PLAYED], undefined, NOW)
    expect(await db.select().from(sourceItems).where(eq(sourceItems.userId, other))).toEqual([])
  })

  it('finds the game a wishlist entry names on Steam', async () => {
    const { entryId } = await inCatalog(mine, made(), PLAYED)
    const play = await readOwnerPlay(db, mine)
    expect(play.find((each) => each.entryId === entryId)?.steam).toEqual([PLAYED])
  })
})
