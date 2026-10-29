import { and, eq, isNotNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { statuses } from '@/domain/library/values'
import type { Db } from '@/server/db/client'
import { entries, sourceItems } from '@/server/db/schema'
import { createIgdbApi } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import { readStanding, readUnsorted } from '@/server/library/read'
import { LibraryError, patchEntry, readVersion, setStatuses } from '@/server/library/store'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { createSteamHandlers, newSteamMockState } from '@/server/mocks/steam'
import { loadFixtures } from '@/server/seed/fixtures'
import { countItems, readLink, saveLink } from '@/server/sync/memory'
import { createNintendo } from '@/server/sync/nintendo'
import { createSteam } from '@/server/sync/steam'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'
import { network } from '@/test/network'

import { createSync } from './sync'

/**
 * Placing what a sync brought in (spec 4.5): the unsorted games as the page
 * lists them, the tally beside them, and many games given one status in
 * one write. Synced from the made-up Steam account, as `sync.test.ts` does.
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
/** Three days after the made-up account last played Halo, three weeks and more after the rest. */
const NOW = (1_760_000_000 + 24 * 86_400) * 1000

let db: Db
let player: string

beforeEach(async () => {
  network.use(...createHandlers(loadFixtures()), ...createSteamHandlers(newSteamMockState()))
  db = await createTestDatabase('default')
  player = await createTestAccount(db, 'player')
  await saveLink(db, player, 'steam', { externalId: MOCK_STEAM.steamId })
  const sync = createSync({
    db,
    igdb: api,
    readArt: async () => ART,
    steam: createSteam({ key: () => MOCK_STEAM.key }),
    nintendo: createNintendo(),
  })(player)
  let step = await sync.step('steam', { read: true }, NOW)
  for (let i = 0; i < 20 && step.remaining > 0; i += 1) step = await sync.step('steam', {}, NOW)
})

const unsortedCount = async () => {
  const link = await readLink(db, player, 'steam')
  return (await countItems(db, link!)).unsorted
}

describe('the games a sync left unsorted', () => {
  it('lists each with its hours and last play on Steam, beside how many stand in each status', async () => {
    const placing = await readUnsorted(db, player)
    const onShelf = await db.select().from(entries).where(eq(entries.userId, player))
    const waiting = onShelf.filter((entry) => entry.status === 'unsorted')

    const playing = onShelf.filter((entry) => entry.status === 'playing')

    expect(placing.games).toHaveLength(waiting.length)
    expect(placing.games.length).toBeGreaterThan(5)
    // Games played these two weeks came in as Playing: they have nothing to wait for.
    expect(playing.length).toBeGreaterThan(0)
    expect(placing.tally).toMatchObject({
      playing: playing.length,
      unsorted: waiting.length,
      backlog: 0,
    })
    expect(Object.keys(placing.tally)).toEqual([...statuses])

    // One the made-up account played, and one it never did: both say what Steam knows.
    const items = await db
      .select()
      .from(sourceItems)
      .where(and(eq(sourceItems.userId, player), isNotNull(sourceItems.copyId)))
    const listedFor = (item: (typeof items)[number]) =>
      placing.games.find((game) => game.title === item.title)
    const played = items.find((item) => item.minutes > 0 && item.lastPlayedAt && listedFor(item))!
    expect(listedFor(played)).toMatchObject({
      minutes: played.minutes,
      platforms: [6],
      played: [{ source: 'steam', minutes: played.minutes, lastPlayedAt: played.lastPlayedAt }],
    })
    const never = items.find((item) => item.minutes === 0 && listedFor(item))!
    expect(listedFor(never)?.played).toEqual([{ source: 'steam', minutes: 0 }])

    expect(placing.games.every((game) => game.cover)).toBe(true)
    expect(placing.platforms.map((platform) => platform.short)).toContain('PC')
  })

  it('is what the Steam card counts as waiting to be placed', async () => {
    const placing = await readUnsorted(db, player)
    expect(await unsortedCount()).toBe(placing.games.length)
  })

  it('keeps a game I only rated: a rating alone does not place it', async () => {
    const [first] = (await readUnsorted(db, player)).games
    await patchEntry(db, player, first!.entryId, { mine: { rating: 80 } })
    const again = await readUnsorted(db, player)
    expect(again.games.find((game) => game.entryId === first!.entryId)?.rating).toBe(80)
  })

  it('is empty, with the tally alone, on a shelf no sync filled', async () => {
    const placing = await readUnsorted(db, await sampleLibraryId(db))
    expect(placing.games).toEqual([])
    expect(placing.tally.unsorted).toBe(0)
    expect(placing.tally.backlog).toBeGreaterThan(0)
  })
})

describe('the tally alone', () => {
  it('is the placing page’s, and the library’s version, without reading a game', async () => {
    const placing = await readUnsorted(db, player)
    expect(await readStanding(db, player)).toEqual({
      version: placing.version,
      tally: placing.tally,
    })
  })

  it('counts nothing for a new shelf', async () => {
    const fresh = await createTestAccount(db, 'fresh')
    const standing = await readStanding(db, fresh)
    expect(Object.values(standing.tally)).toEqual(statuses.map(() => 0))
  })
})

describe('many games given one status', () => {
  it('places them in one write, and puts them back the same way', async () => {
    const before = await readUnsorted(db, player)
    const ids = before.games.map((game) => game.entryId)
    const version = await readVersion(db, player)

    await setStatuses(db, player, ids, 'backlog')
    expect(await readVersion(db, player)).toBe(version + 1)
    const placed = await readUnsorted(db, player)
    expect(placed.games).toEqual([])
    expect(placed.tally).toMatchObject({
      unsorted: 0,
      backlog: ids.length,
      playing: before.tally.playing,
    })
    expect(await unsortedCount()).toBe(0)

    await setStatuses(db, player, ids, 'unsorted')
    expect((await readUnsorted(db, player)).games).toHaveLength(ids.length)
  })

  it('changes nothing about them but their status, and a finish’s day (spec 7.3)', async () => {
    const [first] = (await readUnsorted(db, player)).games
    await patchEntry(db, player, first!.entryId, { mine: { rating: 70 } })
    await setStatuses(db, player, [first!.entryId], 'completed')
    const [row] = await db.select().from(entries).where(eq(entries.id, first!.entryId))
    // Completed, it takes the day a platform last saw it played.
    const last = Math.max(...first!.played.flatMap((each) => each.lastPlayedAt ?? []))
    expect(row).toMatchObject({
      status: 'completed',
      rating: 70,
      completedOn: new Date(last).toISOString().slice(0, 10),
    })
  })

  it('changes none when one is another library’s', async () => {
    const ids = (await readUnsorted(db, player)).games.map((game) => game.entryId)
    const [theirs] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.userId, await sampleLibraryId(db)))
      .limit(1)
    const version = await readVersion(db, player)

    await expect(setStatuses(db, player, [...ids, theirs!.id], 'dropped')).rejects.toBeInstanceOf(
      LibraryError,
    )
    expect(await readVersion(db, player)).toBe(version)
    expect((await readUnsorted(db, player)).games).toHaveLength(ids.length)
  })

  it('refuses a status that is none', async () => {
    const [first] = (await readUnsorted(db, player)).games
    await expect(
      setStatuses(db, player, [first!.entryId], 'shelved' as never),
    ).rejects.toBeInstanceOf(LibraryError)
  })
})
