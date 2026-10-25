import { eq, inArray, ne } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { games, users } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { createEntry, readVersion } from '@/server/library/store'
import {
  createHandlers,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  newMockState,
  type MockState,
} from '@/server/mocks/handlers'
import { loadFixtures, type Fixtures } from '@/server/seed/fixtures'
import { SEED_NOW } from '@/server/seed/mine'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'
import { network } from '@/test/network'

import { createRefresh } from './refresh'

/** In the sample library. */
const SKYRIM = 472

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)

const NOW = SEED_NOW + 86_400_000
const ART = {
  colors: ['#112233', '#445566', '#778899'] as [string, string, string],
  thumbhash: 'aGFzaA==',
}

let db: Db
let sample: string
let state: MockState
let artRead: string[]

/** IGDB, as its test double answers, with these records as it has them now. */
const igdbWith = (change: (fixtures: Fixtures) => Fixtures = (same) => same) => {
  state = newMockState()
  network.use(...createHandlers(change(loadFixtures()), state))
}

/** IGDB API requests made, the token's left out. */
const asked = () => state.requests.filter((request) => request.endpoint !== 'token').length

const refresh = () =>
  createRefresh({
    db,
    igdb: api,
    readArt: async (id) => {
      artRead.push(id)
      return ART
    },
  })

/** Skyrim as IGDB has it after an edit there: a new rating, a new address, a later stamp. */
const skyrimEdited = (fixtures: Fixtures): Fixtures => {
  const record = fixtures.games.get(SKYRIM)!
  return {
    ...fixtures,
    games: new Map(fixtures.games).set(SKYRIM, {
      ...record,
      slug: 'skyrim-renamed',
      total_rating: 12,
      updated_at: (record.updated_at ?? 0) + 3600,
    }),
  }
}

const skyrimRow = async () => {
  const [row] = await db.select().from(games).where(eq(games.igdbId, SKYRIM))
  return row!
}

beforeEach(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  artRead = []
  // Skyrim was checked longest ago: the first a refresh asks about.
  await db.update(games).set({ checkedAt: 0 }).where(eq(games.igdbId, SKYRIM))
})

describe('the daily refresh', () => {
  it('asks IGDB again about the records checked longest ago: two requests, when nothing changed', async () => {
    igdbWith()
    const version = await readVersion(db, sample)

    const result = await refresh()(100, NOW)

    expect(result).toEqual({ checked: 100, changed: 0, libraries: [] })
    expect(asked()).toBe(2)
    const checked = await db.select({ id: games.id }).from(games).where(eq(games.checkedAt, NOW))
    expect(checked).toHaveLength(100)
    expect(await readVersion(db, sample)).toBe(version)
    expect(artRead).toEqual([])
  })

  it('asks every day about every game of an account marked to have them all asked, and keeps the hundred for the rest', async () => {
    igdbWith()
    const whole = await createTestAccount(db, 'whole')
    await db.update(users).set({ refreshAll: true }).where(eq(users.id, whole))
    // Three games checked just now, which a turn in the hundred would not reach for days.
    const mine = await db
      .select({ id: games.id })
      .from(games)
      .where(ne(games.igdbId, SKYRIM))
      .limit(3)
    for (const game of mine)
      await createEntry(db, whole, { primaryGameId: game.id, status: 'backlog' })
    await db
      .update(games)
      .set({ checkedAt: NOW - 1 })
      .where(
        inArray(
          games.id,
          mine.map((game) => game.id),
        ),
      )

    const result = await refresh()(2, NOW)

    expect(result.checked).toBe(5)
    const asked = await db.select({ id: games.id }).from(games).where(eq(games.checkedAt, NOW))
    expect(asked.map((game) => game.id)).toEqual(
      expect.arrayContaining(mine.map((game) => game.id)),
    )
    expect(asked).toHaveLength(5)
    // Skyrim, checked longest ago, still has its turn.
    expect((await skyrimRow()).checkedAt).toBe(NOW)
  })

  it('takes the next oldest the next day', async () => {
    igdbWith()
    await refresh()(100, NOW)
    await refresh()(100, NOW + 86_400_000)
    const twice = await db.select({ id: games.id }).from(games).where(eq(games.checkedAt, NOW))
    // The second day's hundred are not the first day's.
    expect(twice).toHaveLength(100)
  })

  it('stores a record IGDB changed, at the address it had, and gives its libraries a new version', async () => {
    igdbWith(skyrimEdited)
    const version = await readVersion(db, sample)
    const before = await skyrimRow()

    const result = await refresh()(100, NOW)

    expect(result).toMatchObject({ changed: 1, libraries: [sample] })
    const after = await skyrimRow()
    expect(after.igdbRating).toBe(12)
    expect(after.slug).toBe(before.slug)
    expect(after.fetchedAt).toBe(NOW)
    expect(await readVersion(db, sample)).toBe(version + 1)
    // The cover is the same one: its colors are kept, not read again.
    expect(artRead).toEqual([])
    expect(after.colors).toEqual(before.colors)
  })

  it('reads a new cover’s colors', async () => {
    igdbWith((fixtures) => {
      const edited = skyrimEdited(fixtures)
      const record = edited.games.get(SKYRIM)!
      edited.games.set(SKYRIM, { ...record, cover: { ...record.cover!, image_id: 'newcover' } })
      return edited
    })

    await refresh()(100, NOW)

    expect(artRead).toEqual(['newcover'])
    expect((await skyrimRow()).colors).toEqual(ART.colors)
  })

  it('asks once for the age ratings of a record stored before they were asked for (spec 3.13)', async () => {
    igdbWith()
    // Stored before the age ratings were asked for, and checked longest ago.
    await db.update(games).set({ adultsOnly: null, checkedAt: 0 }).where(eq(games.igdbId, SKYRIM))

    const result = await refresh()(100, NOW)

    expect(result).toMatchObject({ changed: 1, libraries: [sample] })
    const [row] = await db.select().from(games).where(eq(games.igdbId, SKYRIM))
    expect(row?.adultsOnly).toBe(false)
    expect(await refresh()(100, NOW + 1)).toMatchObject({ changed: 0 })
  })

  it('asks once for the videos of a record stored before they were asked for (spec 7.1)', async () => {
    igdbWith()
    await db.update(games).set({ videos: null, checkedAt: 0 }).where(eq(games.igdbId, SKYRIM))

    expect(await refresh()(100, NOW)).toMatchObject({ changed: 1 })
    const [row] = await db.select().from(games).where(eq(games.igdbId, SKYRIM))
    expect(row?.videos).toEqual([])
    expect(await refresh()(100, NOW + 1)).toMatchObject({ changed: 0 })
  })

  it('stores a record whose time to beat changed, which IGDB does not stamp on the record', async () => {
    igdbWith((fixtures) => {
      const time = fixtures.timeToBeat.get(SKYRIM)!
      return {
        ...fixtures,
        timeToBeat: new Map(fixtures.timeToBeat).set(SKYRIM, {
          ...time,
          normally: (time.normally ?? 0) + 7200,
        }),
      }
    })

    const result = await refresh()(100, NOW)

    expect(result).toMatchObject({ changed: 1, libraries: [sample] })
  })
})
