import { and, eq } from 'drizzle-orm'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { copies, entries, entryVersions, games, playTime, sourceItems } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readLibrary } from '@/server/library/read'
import { readVersion, removeEntry, removeEntryForUndo, restoreEntry } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { createSteamHandlers, newSteamMockState } from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { readLink, saveLink } from '@/server/sync/memory'
import { createSteam, STEAM_API } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'
import { network } from '@/test/network'

import { createSync } from './sync'

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)
const steam = createSteam({ key: () => MOCK_STEAM.key })
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'aGFzaA==',
}

const PC = 6
/** Fixture games the made-up Steam account owns. */
const WITCHER_3 = 1942
const SKYRIM = 472
const HALO = 740
const ALAN_WAKE_2 = 185246
const HALF_LIFE_2 = 233
/**
 * In `fixtures/steam/owned-games.json`: 24 matched by Steam id, one by
 * title, two by nothing. Of those two, the store calls Wallpaper Engine
 * software (`fixtures/steam/store-items.json`), so it is left out by itself.
 */
const BY_STORE_ID = 24
const LISTED = 27
const SOFTWARE = 1

/** Three days after the made-up account last played Halo, three weeks and more after the rest. */
const NOW = (1_760_000_000 + 24 * 86_400) * 1000

let db: Db
let steamState: ReturnType<typeof newSteamMockState>
let sync: ReturnType<typeof createSync>

beforeEach(async () => {
  steamState = newSteamMockState()
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(steamState))
  db = await createTestDatabase('default')
  sync = createSync({ db, igdb: api, readArt: async () => ART, steam })
})

/** An account with an empty shelf, linked to the made-up Steam account. */
const linked = async (handle = 'player', steamId: string = MOCK_STEAM.steamId) => {
  const id = await createTestAccount(db, handle)
  await saveLink(db, id, 'steam', steamId, undefined)
  return id
}

/** Steps until nothing is left, as the page does. */
const syncAll = async (libraryId: string, now = NOW) => {
  const library = sync(libraryId)
  let step = await library.step('steam', { read: true }, now)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) {
    step = await library.step('steam', {}, now)
  }
  return step
}

const entriesOf = (libraryId: string) =>
  db.select().from(entries).where(eq(entries.userId, libraryId))

const copiesOf = (libraryId: string) =>
  db
    .select({
      id: copies.id,
      entryId: copies.entryId,
      platformId: copies.platformId,
      format: copies.format,
    })
    .from(copies)
    .innerJoin(entries, eq(entries.id, copies.entryId))
    .where(eq(entries.userId, libraryId))

/** The entry a fixture record is linked to in this library. */
const entryOf = async (libraryId: string, igdbId: number) => {
  const [row] = await db
    .select({ entryId: entryVersions.entryId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(and(eq(entryVersions.userId, libraryId), eq(games.igdbId, igdbId)))
    .limit(1)
  return row?.entryId
}

const itemNamed = async (libraryId: string, title: string) => {
  const [row] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, libraryId), eq(sourceItems.title, title)))
    .limit(1)
  return row!
}

/** Steam answering with the made-up account's games, changed by `edit`. */
const steamAnswers = (edit: (games: Record<string, unknown>[]) => Record<string, unknown>[]) => {
  const owned = loadOwned()
  network.use(
    http.get(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/`, () =>
      HttpResponse.json({ response: { ...owned.response, games: edit(owned.response.games) } }),
    ),
  )
}

const loadOwned = (): { response: { game_count: number; games: Record<string, unknown>[] } } =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  structuredClone(require('../../../fixtures/steam/owned-games.json'))

/** The store answering as `fixtures/steam/store-items.json` does, with these apps' items in place. */
const storeAnswers = (items: Record<number, Record<string, unknown>>) => {
  type Fixture = { response: { store_items: { id: number }[] } }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixture = require('../../../fixtures/steam/store-items.json') as Fixture
  const known = new Map(fixture.response.store_items.map((item) => [item.id, item]))
  network.use(
    http.get(`${STEAM_API}/IStoreBrowseService/GetItems/v1/`, ({ request }) => {
      const asked = JSON.parse(new URL(request.url).searchParams.get('input_json') ?? '{}') as {
        ids: { appid: number }[]
      }
      return HttpResponse.json({
        response: {
          store_items: asked.ids.map(
            ({ appid }) => items[appid] ?? known.get(appid) ?? { id: appid, success: 15 },
          ),
        },
      })
    }),
  )
}

const itemOf = async (libraryId: string, storeId: string) => {
  const [row] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, libraryId), eq(sourceItems.storeId, storeId)))
    .limit(1)
  return row!
}

describe('a first sync from Steam', () => {
  it('puts every game it can match on an empty shelf, as a PC digital copy', async () => {
    const me = await linked()
    const step = await syncAll(me)

    expect(step.remaining).toBe(0)
    expect(step.link.counts['on-shelf']).toBe(BY_STORE_ID + 1)
    expect(step.link.counts['needs-you']).toBe(LISTED - BY_STORE_ID - 1 - SOFTWARE)
    expect(step.link.counts.hidden).toBe(SOFTWARE)
    expect(await entriesOf(me)).toHaveLength(BY_STORE_ID + 1)
    const owned = await copiesOf(me)
    expect(owned).toHaveLength(BY_STORE_ID + 1)
    expect(owned.every((copy) => copy.platformId === PC && copy.format === 'digital')).toBe(true)
    expect(step.link.syncedAt).toBe(NOW)
  })

  it('matches by Steam’s id first, and by title only when IGDB has no id', async () => {
    const me = await linked()
    await syncAll(me)
    expect(await itemNamed(me, 'The Witcher 3: Wild Hunt')).toMatchObject({
      igdbId: WITCHER_3,
      resolvedBy: 'store_id',
    })
    expect(await itemNamed(me, 'Halo: Combat Evolved™')).toMatchObject({
      igdbId: HALO,
      resolvedBy: 'title',
    })
    expect(await itemNamed(me, 'Alan Wake 2')).toMatchObject({
      igdbId: null,
      decision: 'pending',
    })
  })

  it('gives each copy Steam’s hours, in Steam’s own row', async () => {
    const me = await linked()
    await syncAll(me)
    const halfLife = await itemNamed(me, 'Half-Life 2')
    expect(halfLife.minutes).toBeGreaterThan(0)
    const rows = await db.select().from(playTime).where(eq(playTime.copyId, halfLife.copyId!))
    expect(rows).toEqual([expect.objectContaining({ source: 'steam', minutes: halfLife.minutes })])
  })

  it('starts a game played in the last two weeks as playing, and the rest unsorted, for me to place', async () => {
    const me = await linked()
    await syncAll(me)
    const statuses = new Map((await entriesOf(me)).map((entry) => [entry.id, entry.status]))
    const halo = await entryOf(me, HALO)
    // Halo was played three days before NOW; Portal three weeks before.
    expect(statuses.get(halo!)).toBe('playing')
    expect(statuses.get((await entryOf(me, 71))!)).toBe('unsorted')
    expect([...statuses.values()].filter((status) => status === 'backlog')).toEqual([])
  })

  it('adds a game already on the shelf as a copy of it, never as a second game, and keeps what I set', async () => {
    const sample = await sampleLibraryId(db)
    await saveLink(db, sample, 'steam', MOCK_STEAM.steamId, undefined)
    const before = await entriesOf(sample)

    await syncAll(sample)

    const after = await entriesOf(sample)
    expect(after).toHaveLength(before.length)
    expect(after.map(({ status, rating }) => ({ status, rating }))).toEqual(
      before.map(({ status, rating }) => ({ status, rating })),
    )
    const skyrim = await entryOf(sample, SKYRIM)
    const pcCopies = (await copiesOf(sample)).filter(
      (copy) => copy.entryId === skyrim && copy.platformId === PC && copy.format === 'digital',
    )
    expect(pcCopies).toHaveLength(1)
  })

  it('says so when the Steam account hides its games, and adds nothing', async () => {
    const me = await linked('hidden', MOCK_STEAM.privateSteamId)
    const step = await syncAll(me)
    expect(step.link.problem).toBe('private')
    expect(step.link.syncedAt).toBeNull()
    expect(await entriesOf(me)).toHaveLength(0)
  })

  it('reads Steam once when asked twice in a minute', async () => {
    const me = await linked()
    await sync(me).step('steam', { read: true }, NOW)
    await sync(me).step('steam', { read: true }, NOW + 10_000)
    expect(steamState.asked.filter((path) => path.includes('GetOwnedGames'))).toHaveLength(1)
  })
})

describe('a later sync', () => {
  it('brings Steam’s hours up to date, and leaves the hours I typed alone', async () => {
    const me = await linked()
    await syncAll(me)
    const witcher = await itemNamed(me, 'The Witcher 3: Wild Hunt')
    await db.insert(playTime).values({
      id: 'typed',
      entryId: (await entryOf(me, WITCHER_3))!,
      copyId: null,
      source: 'manual',
      minutes: 600,
      updatedAt: NOW,
    })
    const version = await readVersion(db, me)

    steamAnswers((list) =>
      list.map((game) => (game.appid === 292030 ? { ...game, playtime_forever: 5000 } : game)),
    )
    await syncAll(me, NOW + 86_400_000)

    const rows = await db
      .select({ source: playTime.source, minutes: playTime.minutes })
      .from(playTime)
      .where(eq(playTime.entryId, (await entryOf(me, WITCHER_3))!))
    expect(rows).toEqual(
      expect.arrayContaining([
        { source: 'steam', minutes: 5000 },
        { source: 'manual', minutes: 600 },
      ]),
    )
    expect(await readVersion(db, me)).toBe(version + 1)
    expect(witcher.copyId).toBeTruthy()
  })

  it('shows the larger of my hours and Steam’s, never the two added together', async () => {
    const me = await linked()
    await syncAll(me)
    const halfLife = await itemNamed(me, 'Half-Life 2')
    const entryId = (await entryOf(me, 233))!
    const shown = async () =>
      (await readLibrary(db, me)).games.find((game) => game.slug === 'half-life-2')?.minutes
    expect(await shown()).toBe(halfLife.minutes)

    const typed = (minutes: number) =>
      db
        .insert(playTime)
        .values({ id: 'typed', entryId, copyId: null, source: 'manual', minutes, updatedAt: NOW })
        .onConflictDoUpdate({ target: playTime.id, set: { minutes } })
    await typed(halfLife.minutes - 30)
    expect(await shown()).toBe(halfLife.minutes)
    await typed(halfLife.minutes + 600)
    expect(await shown()).toBe(halfLife.minutes + 600)
  })

  it('changes nothing, and keeps the version, when Steam reports nothing new', async () => {
    const me = await linked()
    await syncAll(me)
    const version = await readVersion(db, me)
    await syncAll(me, NOW + 86_400_000)
    expect(await readVersion(db, me)).toBe(version)
  })

  it('keeps a game Steam no longer lists, and counts it as not seen', async () => {
    const me = await linked()
    await syncAll(me)
    steamAnswers((list) => list.filter((game) => game.appid !== 292030))
    const step = await syncAll(me, NOW + 86_400_000)
    expect(step.link.counts.notSeen).toBe(1)
    expect(await entryOf(me, WITCHER_3)).toBeDefined()
    const unseen = await sync(me).list('steam', 'not-seen')
    expect(unseen.map((item) => item.title)).toEqual(['The Witcher 3: Wild Hunt'])
    expect(unseen[0]?.onShelf?.slug).toBe('the-witcher-3-wild-hunt')
  })

  it('does not put back a game I took off my shelf', async () => {
    const me = await linked()
    await syncAll(me)
    await removeEntry(db, me, (await entryOf(me, WITCHER_3))!)
    expect((await itemNamed(me, 'The Witcher 3: Wild Hunt')).decision).toBe('removed')

    const step = await syncAll(me, NOW + 86_400_000)
    expect(await entryOf(me, WITCHER_3)).toBeUndefined()
    expect(step.link.counts.hidden).toBe(SOFTWARE + 1)
  })

  it('feeds the copy again when a removed game is put back with Undo', async () => {
    const me = await linked()
    await syncAll(me)
    const removed = await removeEntryForUndo(db, me, (await entryOf(me, WITCHER_3))!)
    await restoreEntry(db, me, removed)
    const item = await itemNamed(me, 'The Witcher 3: Wild Hunt')
    expect(item.decision).toBe('copy')
    expect(item.copyId).toBeTruthy()
  })
})

describe('what Steam’s store says each game is', () => {
  it('leaves out what it calls software, as not a game, and the list says what it is', async () => {
    const me = await linked()
    await syncAll(me)
    expect(await itemNamed(me, 'Wallpaper Engine')).toMatchObject({
      kind: 'software',
      decision: 'not_a_game',
      igdbId: null,
    })
    expect(await sync(me).list('steam', 'hidden')).toEqual([
      expect.objectContaining({ title: 'Wallpaper Engine', kind: 'software' }),
    ])
  })

  it('leaves out a demo and a playtest, even one whose title IGDB would match', async () => {
    steamAnswers((games) => [
      ...games,
      { appid: 9900010, name: 'Portal', playtime_forever: 30 },
      { appid: 9900011, name: 'Outer Wilds Playtest', playtime_forever: 45 },
    ])
    storeAnswers({
      9900010: { id: 9900010, success: 1, type: 1, related_items: { parent_appid: 52003 } },
    })
    const me = await linked()
    const step = await syncAll(me)

    expect(await itemOf(me, '9900010')).toMatchObject({ kind: 'demo', decision: 'not_a_game' })
    expect(await itemOf(me, '9900011')).toMatchObject({ kind: 'demo', decision: 'not_a_game' })
    expect(step.link.counts['on-shelf']).toBe(BY_STORE_ID + 1)
    expect(step.link.counts.hidden).toBe(SOFTWARE + 2)
    // Portal itself is on the shelf, fed by its own app alone.
    expect((await itemOf(me, '52003')).copyId).toBeTruthy()
    expect((await itemOf(me, '9900010')).copyId).toBeNull()
  })

  it('matches a mode it lists apart to the game it names, and adds its hours to that copy', async () => {
    steamAnswers((games) => [
      ...games,
      { appid: 9900012, name: 'Half-Life 2: Deathmatch', playtime_forever: 120 },
    ])
    storeAnswers({
      9900012: { id: 9900012, success: 1, type: 14, related_items: { parent_appid: 220 } },
    })
    const me = await linked()
    await syncAll(me)

    const game = await itemOf(me, '220')
    expect(await itemOf(me, '9900012')).toMatchObject({
      kind: 'part',
      parentStoreId: '220',
      igdbId: HALF_LIFE_2,
      copyId: game.copyId,
    })
    const rows = await db.select().from(playTime).where(eq(playTime.copyId, game.copyId!))
    expect(rows).toEqual([
      expect.objectContaining({ source: 'steam', minutes: game.minutes + 120 }),
    ])
    expect(await entriesOf(me)).toHaveLength(BY_STORE_ID + 1)
  })

  it('matches a mode whose game the store does not name to the game I own under its title', async () => {
    steamAnswers((games) => [
      ...games,
      { appid: 9900013, name: 'Half-Life 2 - Zombies', playtime_forever: 90 },
    ])
    // As Black Ops II's zombies: a page for something else, with no game named.
    storeAnswers({ 9900013: { id: 9900013, success: 1, type: 14 } })
    const me = await linked()
    await syncAll(me)

    const game = await itemOf(me, '220')
    expect(await itemOf(me, '9900013')).toMatchObject({
      kind: 'part',
      parentStoreId: '220',
      igdbId: HALF_LIFE_2,
      copyId: game.copyId,
    })
    expect(await entriesOf(me)).toHaveLength(BY_STORE_ID + 1)
  })

  it('takes a mode as a game of its own when nothing I own starts its title', async () => {
    steamAnswers((games) => [
      ...games,
      { appid: 9900014, name: 'Gone Game - Multiplayer', playtime_forever: 90 },
    ])
    storeAnswers({ 9900014: { id: 9900014, success: 1, type: 14 } })
    const me = await linked()
    await syncAll(me)
    expect(await itemOf(me, '9900014')).toMatchObject({ kind: 'game', parentStoreId: null })
  })

  it('goes on without the store when it does not answer, and asks it at the next sync', async () => {
    let asked = 0
    network.use(
      http.get(`${STEAM_API}/IStoreBrowseService/GetItems/v1/`, () => {
        asked += 1
        return new HttpResponse(null, { status: 503 })
      }),
    )
    const me = await linked()
    const step = await syncAll(me)
    expect(step.link.counts['on-shelf']).toBe(BY_STORE_ID + 1)
    // Once for the sync, on the step that read the list: not again at every step after it.
    expect(asked).toBe(1)
    expect(await itemNamed(me, 'Wallpaper Engine')).toMatchObject({
      kind: null,
      decision: 'pending',
    })

    network.use(...createSteamHandlers(steamState))
    await syncAll(me, NOW + 86_400_000)
    expect(await itemNamed(me, 'Wallpaper Engine')).toMatchObject({
      kind: 'software',
      decision: 'not_a_game',
    })
  })

  it('keeps my "ask again" about what it left out: the store is asked about a game once', async () => {
    const me = await linked()
    await syncAll(me)
    const item = await itemNamed(me, 'Wallpaper Engine')
    await sync(me).answer('steam', item.id, { kind: 'again' })
    await syncAll(me, NOW + 86_400_000)
    expect(await itemNamed(me, 'Wallpaper Engine')).toMatchObject({
      kind: 'software',
      decision: 'pending',
    })
  })
})

describe('my answers', () => {
  it('puts the game I pick on the shelf at once', async () => {
    const me = await linked()
    await syncAll(me)
    const item = await itemNamed(me, 'Alan Wake 2')
    const { item: answered } = await sync(me).answer('steam', item.id, {
      kind: 'pick',
      igdbId: ALAN_WAKE_2,
    })
    expect(answered.state).toBe('on-shelf')
    expect(answered.onShelf?.slug).toBe('alan-wake-ii')
    expect(await entryOf(me, ALAN_WAKE_2)).toBeDefined()
  })

  it('never asks again about what I said is not a game, until I ask it to', async () => {
    const me = await linked()
    await syncAll(me)
    const item = await itemNamed(me, 'Alan Wake 2')
    await sync(me).answer('steam', item.id, { kind: 'dismiss', as: 'not_a_game' })
    let step = await syncAll(me, NOW + 86_400_000)
    expect(step.link.counts.hidden).toBe(SOFTWARE + 1)
    expect((await sync(me).list('steam', 'hidden')).map((each) => each.title)).toContain(
      'Alan Wake 2',
    )

    await sync(me).answer('steam', item.id, { kind: 'again' })
    step = await syncAll(me, NOW + 2 * 86_400_000)
    expect(step.link.counts.hidden).toBe(SOFTWARE)
  })

  it('answers "not found" for another shelf’s item', async () => {
    const me = await linked()
    await syncAll(me)
    const stranger = await linked('stranger')
    const item = await itemNamed(me, 'Alan Wake 2')
    await expect(
      sync(stranger).answer('steam', item.id, { kind: 'pick', igdbId: ALAN_WAKE_2 }),
    ).rejects.toMatchObject({ code: 'not-found' })
  })
})

describe('the link', () => {
  it('forgets what another Steam account reported when I link a different one', async () => {
    const me = await linked()
    await syncAll(me)
    await saveLink(db, me, 'steam', MOCK_STEAM.privateSteamId, undefined)
    const items = await db.select().from(sourceItems).where(eq(sourceItems.userId, me))
    expect(items).toHaveLength(0)
    expect((await readLink(db, me, 'steam'))?.readAt).toBeNull()
    // Its games stay on the shelf.
    expect(await entriesOf(me)).toHaveLength(BY_STORE_ID + 1)
  })
})
