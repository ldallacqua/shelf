import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { SteamLinkAnswer } from '@/domain/library/adding'
import type { Db } from '@/server/db/client'
import { games, vocab } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readLibrary } from '@/server/library/read'
import { readVersion, removeEntryForUndo, restoreEntry } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { createSteamHandlers, newSteamMockState, type SteamMockState } from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { createSteam } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { createSteamAdding } from './steam-adding'

/**
 * A game IGDB does not have, added from its Steam page (ADR 006), against the
 * doubles for IGDB and Steam. `fixtures/steam/store-items.json` has three
 * made-up apps for it: a game, a game for adults, and a soundtrack.
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

const GAME = '2000001'
const ADULT = '2000002'
const SOUNDTRACK = '2000003'
/** In `fixtures/steam/` and on IGDB. */
const ON_IGDB = '430910'
const PC = 6

let db: Db
let mine: string
let theirs: string
let state: SteamMockState
let forAccount: ReturnType<typeof createSteamAdding>

const gameOf = (answer: SteamLinkAnswer) => {
  if (answer.kind !== 'game') throw new Error(`Expected a game, got ${answer.kind}`)
  return answer.answer.results[0]!
}

const row = async (appId: string) => {
  const [found] = await db.select().from(games).where(eq(games.steamAppId, appId))
  return found
}

beforeEach(async () => {
  state = newSteamMockState()
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(state))
  db = await createTestDatabase('empty')
  mine = await createTestAccount(db, 'moderator')
  theirs = await createTestAccount(db, 'someone')
  forAccount = createSteamAdding({
    db,
    igdb: api,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    readArt: async () => ART,
  })
})

describe('reading a Steam link', () => {
  it('shows a game IGDB does not have as a result, with its platforms', async () => {
    const answer = await forAccount(mine).read(GAME)
    expect(gameOf(answer)).toMatchObject({
      title: 'A Made-up Steam Game',
      year: 2024,
      kind: 'main',
      platforms: [PC],
      steam: { appId: GAME, adult: false, known: false },
    })
    expect(answer).toMatchObject({
      answer: { platforms: [expect.objectContaining({ id: PC, name: 'PC' })] },
    })
    // Reading stores nothing.
    expect(await row(GAME)).toBeUndefined()
  })

  it('says a game is for adults', async () => {
    expect(gameOf(await forAccount(mine).read(ADULT)).steam?.adult).toBe(true)
  })

  it('says an app is no game', async () => {
    expect(await forAccount(mine).read(SOUNDTRACK)).toEqual({
      kind: 'not-a-game',
      title: 'A Made-up Soundtrack',
    })
  })

  it('says Steam has no page for it, in either country', async () => {
    expect(await forAccount(mine).read('999999')).toEqual({ kind: 'not-found' })
    expect(state.asked.filter((path) => path.includes('GetItems'))).toHaveLength(2)
  })

  it('sends a game IGDB has to the search', async () => {
    const answer = await forAccount(mine).read(ON_IGDB)
    expect(answer.kind).toBe('igdb')
  })
})

describe('adding from a Steam link', () => {
  it('stores the game as Steam describes it, under the moderator’s title', async () => {
    const added = await forAccount(mine).add({
      appId: GAME,
      title: 'A Made-up Game',
      status: 'wishlist',
      copies: [],
    })
    expect(added.title).toBe('A Made-up Game')
    expect(added.slug).toBe(`a-made-up-game-steam-${GAME}`)
    const stored = await row(GAME)
    expect(stored).toMatchObject({
      igdbId: null,
      steamAppId: GAME,
      title: 'A Made-up Game',
      releasedOn: '2024-03-15',
      summary: 'A game nobody made.',
      colors: ART.colors,
      storeIds: [{ source: 'steam', uid: GAME }],
    })
    expect(stored?.cover?.id).toMatch(/library_capsule\.jpg@2x$/)
  })

  it('puts it on the shelf, where the library reads it like any other', async () => {
    await forAccount(mine).add({
      appId: GAME,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    const library = await readLibrary(db, mine)
    const game = library.games.find((each) => each.slug.endsWith(GAME))
    expect(game).toMatchObject({ title: 'A Made-up Steam Game', status: 'backlog' })
    expect(game?.adult).toBeUndefined()
    expect(game?.copies).toEqual([expect.objectContaining({ platform: PC, format: 'digital' })])
  })

  it('names its companies, reusing a name another game gave', async () => {
    await db
      .insert(vocab)
      .values({ kind: 'company', id: 77, name: 'Made-up Studio', slug: 'made-up-studio' })
    await forAccount(mine).add({ appId: GAME, status: 'backlog', copies: [] })
    const stored = await row(GAME)
    expect(stored?.developers).toEqual([77])
    expect(stored?.publishers).toHaveLength(1)
    const [publisher] = await db.select().from(vocab).where(eq(vocab.id, stored!.publishers[0]!))
    expect(publisher).toMatchObject({ kind: 'company', name: 'Made-up Publisher' })
    expect(publisher!.id).toBeGreaterThanOrEqual(1_000_000_000)
  })

  it('hides a game for adults with the switch, marks its screenshots, and has no backdrop', async () => {
    await forAccount(mine).add({ appId: ADULT, status: 'wishlist', copies: [] })
    const stored = await row(ADULT)
    expect(stored?.cover).toBeTruthy()
    expect(stored?.screenshots).toEqual([
      expect.objectContaining({ id: 'steam/apps/2000002/ss_3d4e5f.jpg', mature: true }),
    ])
    expect(stored?.artworks).toEqual([])
    const library = await readLibrary(db, mine)
    expect(library.games.find((each) => each.slug.endsWith(ADULT))?.adult).toBe(true)
  })

  it('lets another shelf take the same game, under the title already given', async () => {
    await forAccount(mine).add({ appId: GAME, title: 'As Set', status: 'wishlist', copies: [] })
    expect(gameOf(await forAccount(theirs).read(GAME))).toMatchObject({
      title: 'As Set',
      steam: { known: true },
    })
    const added = await forAccount(theirs).add({
      appId: GAME,
      title: 'Another Name',
      status: 'backlog',
      copies: [],
    })
    expect(added.title).toBe('As Set')
    expect(await db.select().from(games)).toHaveLength(1)
  })

  it('marks a game already on my shelf, and adds to it only a copy it lacks', async () => {
    const first = await forAccount(mine).add({
      appId: GAME,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    expect(gameOf(await forAccount(mine).read(GAME)).onShelf).toMatchObject({ slug: first.slug })
    const again = await forAccount(mine).add({
      appId: GAME,
      status: 'backlog',
      copies: [{ platformId: PC, format: 'digital' }],
    })
    expect(again.undo).toMatchObject({ newEntry: false, copyIds: [] })
  })

  it('brings a game up to date when its link is pasted again, and tells its shelves', async () => {
    await forAccount(mine).add({ appId: ADULT, title: 'As Set', status: 'wishlist', copies: [] })
    await db
      .update(games)
      .set({ screenshots: [], summary: 'Old.' })
      .where(eq(games.steamAppId, ADULT))
    await forAccount(theirs).add({ appId: ADULT, status: 'backlog', copies: [] })
    const [before, theirsBefore] = [await readVersion(db, mine), await readVersion(db, theirs)]
    const touched: string[] = []

    await forAccount(theirs).read(ADULT, touched)

    const stored = await row(ADULT)
    expect(stored?.screenshots).toHaveLength(1)
    expect(stored).toMatchObject({ title: 'As Set', summary: 'Made up too.' })
    expect(touched.sort()).toEqual([mine, theirs].sort())
    expect(await readVersion(db, mine)).toBe(before + 1)
    expect(await readVersion(db, theirs)).toBe(theirsBefore + 1)
  })

  it('tells nobody when the page has not changed', async () => {
    await forAccount(mine).add({ appId: GAME, status: 'wishlist', copies: [] })
    const before = await readVersion(db, mine)
    const touched: string[] = []
    await forAccount(mine).read(GAME, touched)
    expect(touched).toEqual([])
    expect(await readVersion(db, mine)).toBe(before)
  })

  it('refuses what is no game, what Steam lacks, and what IGDB has', async () => {
    const adding = forAccount(mine)
    const input = { status: 'backlog' as const, copies: [] }
    await expect(adding.add({ appId: SOUNDTRACK, ...input })).rejects.toMatchObject({
      code: 'invalid',
    })
    await expect(adding.add({ appId: '999999', ...input })).rejects.toMatchObject({
      code: 'not-found',
    })
    await expect(adding.add({ appId: ON_IGDB, ...input })).rejects.toMatchObject({
      code: 'conflict',
    })
    expect(await db.select().from(games)).toEqual([])
  })

  it('comes back whole after a removal is undone, though another shelf added it since', async () => {
    const { undo } = await forAccount(mine).add({ appId: GAME, status: 'backlog', copies: [] })
    const removed = await removeEntryForUndo(db, mine, undo.entryId)
    expect(await row(GAME)).toBeUndefined()
    await forAccount(theirs).add({ appId: GAME, status: 'backlog', copies: [] })
    await restoreEntry(db, mine, removed)
    const library = await readLibrary(db, mine)
    expect(library.games.map((game) => game.slug)).toEqual([`a-made-up-steam-game-steam-${GAME}`])
  })
})
