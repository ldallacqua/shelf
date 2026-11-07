import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SteamReviews } from '@/domain/steam/reviews'
import type { Db } from '@/server/db/client'
import { games } from '@/server/db/schema'
import { readVersion } from '@/server/library/store'
import { SEED_NOW } from '@/server/seed/mine'
import { createTestDatabase, sampleLibraryId } from '@/test/database'

import { createSteamReviews } from './steam-reviews'

let db: Db
let sample: string
let appOfSkyrim: string
let skyrimId: string

const NOW = SEED_NOW + 86_400_000

const answering = (reviews: Record<string, SteamReviews>, failed: readonly string[] = []) =>
  vi.fn(async (apps: readonly string[]) => ({
    reviews: new Map(Object.entries(reviews)),
    answered: new Set(apps.filter((app) => !failed.includes(app))),
  }))

const skyrim = async () => (await db.select().from(games).where(eq(games.id, skyrimId)))[0]!

beforeEach(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  const [row] = await db
    .select({ id: games.id, storeIds: games.storeIds })
    .from(games)
    .where(eq(games.igdbId, 472))
  skyrimId = row!.id
  appOfSkyrim = row!.storeIds.find((store) => store.source === 'steam')!.uid
})

describe('reading what Steam says', () => {
  it('asks only about games with a page there, and keeps what it says', async () => {
    const said = { app: appOfSkyrim, count: 1000, percent: 94, score: 9 }
    const reviews = answering({ [appOfSkyrim]: said })
    const { checked, changed } = await createSteamReviews({ db, reviews })(undefined, NOW)
    expect(changed).toBe(1)
    expect(checked).toBeGreaterThan(0)
    expect(reviews.mock.calls[0]![0]).toContain(appOfSkyrim)
    const row = await skyrim()
    expect(row.steamReviews).toEqual(said)
    expect(row.steamReviewsCheckedAt).toBe(NOW)
  })

  it('gives a shelf holding it a new version when its page changes, and not otherwise', async () => {
    const said = { app: appOfSkyrim, count: 1000, percent: 94, score: 9 }
    const before = await readVersion(db, sample)
    const first = await createSteamReviews({ db, reviews: answering({ [appOfSkyrim]: said }) })(
      undefined,
      NOW,
    )
    expect(first.libraries).toEqual([sample])
    const after = await readVersion(db, sample)
    expect(after).toBeGreaterThan(before)

    const again = await createSteamReviews({
      db,
      reviews: answering({ [appOfSkyrim]: { ...said, count: 1010 } }),
    })(undefined, NOW + 1)
    expect(again.changed).toBe(0)
    expect(await readVersion(db, sample)).toBe(after)
    expect((await skyrim()).steamReviews?.count).toBe(1000)
    expect((await skyrim()).steamReviewsCheckedAt).toBe(NOW + 1)
  })

  it('keeps what a game has when its request failed, and asks about it first next time', async () => {
    const said = { app: appOfSkyrim, count: 1000, percent: 94, score: 9 }
    await createSteamReviews({ db, reviews: answering({ [appOfSkyrim]: said }) })(undefined, NOW)
    await createSteamReviews({ db, reviews: answering({}, [appOfSkyrim]) })(undefined, NOW + 1)
    const row = await skyrim()
    expect(row.steamReviews).toEqual(said)
    expect(row.steamReviewsCheckedAt).toBe(NOW)
  })

  it('takes the reviews away when Steam no longer has any', async () => {
    const said = { app: appOfSkyrim, count: 1000, percent: 94, score: 9 }
    await createSteamReviews({ db, reviews: answering({ [appOfSkyrim]: said }) })(undefined, NOW)
    await createSteamReviews({ db, reviews: answering({}) })(undefined, NOW + 1)
    expect((await skyrim()).steamReviews).toBeNull()
  })

  it('asks the longest unasked first, past what one run takes', async () => {
    const reviews = answering({})
    await createSteamReviews({ db, reviews })(2, NOW)
    const first = reviews.mock.calls[0]![0]
    await createSteamReviews({ db, reviews })(2, NOW + 1)
    const second = reviews.mock.calls[1]![0]
    expect(second.some((app) => first.includes(app))).toBe(false)
  })

  it('asks about a game whose Steam page is known only from its store links', async () => {
    const held = await skyrim()
    await db
      .update(games)
      .set({
        steamAppId: null,
        storeIds: held.storeIds.filter((store) => store.source !== 'steam'),
        storeLinks: [{ store: 'steam', url: `https://store.steampowered.com/app/${appOfSkyrim}/` }],
      })
      .where(eq(games.id, skyrimId))
    const said = { app: appOfSkyrim, count: 1000, percent: 94, score: 9 }
    const reviews = answering({ [appOfSkyrim]: said })
    await createSteamReviews({ db, reviews })(undefined, NOW)
    expect(reviews.mock.calls[0]![0]).toContain(appOfSkyrim)
    expect((await skyrim()).steamReviews).toEqual(said)
  })

  it('after an add, asks only about games never asked, and marks them asked', async () => {
    const reviews = answering({})
    const read = createSteamReviews({ db, reviews })
    await read(undefined, NOW)
    await db.update(games).set({ steamReviewsCheckedAt: null }).where(eq(games.id, skyrimId))
    const { checked } = await read(100, NOW + 1, 'unasked')
    expect(checked).toBe(1)
    expect(reviews.mock.calls[1]![0]).toEqual([appOfSkyrim])
    expect((await skyrim()).steamReviewsCheckedAt).toBe(NOW + 1)
    await read(100, NOW + 2, 'unasked')
    expect(reviews).toHaveBeenCalledTimes(2)
  })
})
