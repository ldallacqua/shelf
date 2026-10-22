import { gzipSync } from 'node:zlib'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { linkBetween } from '@/domain/library/family'
import type { Library } from '@/domain/library/library'
import { decodeLibrary, encodeLibrary } from '@/domain/library/snapshot'
import { statuses } from '@/domain/library/values'
import type { Db } from '@/server/db/client'
import { entries, games, users } from '@/server/db/schema'
import { readLibrary } from '@/server/library/read'
import { readLinkedMembers } from '@/server/library/store'
import { SAMPLE_ACCOUNT } from '@/server/mocks/owner'
import { loadFixtures } from '@/server/seed/fixtures'
import { SEED_NOW } from '@/server/seed/mine'
import { planSeed, seedLibrary } from '@/server/seed/seed'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'

const fixtures = loadFixtures()
const today = new Date(SEED_NOW).toISOString().slice(0, 10)

describe('the fixtures', () => {
  it('hold a sample of about 200 games and a thousand more', () => {
    expect(fixtures.sets.default.length).toBeGreaterThanOrEqual(200)
    expect(fixtures.sets.default.length + fixtures.sets.stress.length).toBeGreaterThanOrEqual(1000)
  })

  it('hold a record and a cover reading for every game in every set', () => {
    const ids = [...fixtures.sets.default, ...fixtures.sets.versions, ...fixtures.sets.stress]
    expect(ids.filter((id) => !fixtures.games.has(id))).toEqual([])
    const unread = ids.filter((id) => {
      const cover = fixtures.games.get(id)?.cover
      return cover && !fixtures.covers.has(cover.image_id)
    })
    expect(unread).toEqual([])
  })

  it('never list a game in two sets', () => {
    const ids = [...fixtures.sets.default, ...fixtures.sets.versions, ...fixtures.sets.stress]
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('planSeed', () => {
  it('is the same every time', () => {
    expect(planSeed('default', fixtures)).toEqual(planSeed('default', fixtures))
  })

  it('does not change a game’s data when more games are added', () => {
    const inDefault = planSeed('default', fixtures).entries
    const inStress = new Map(planSeed('stress', fixtures).entries.map((e) => [e.igdbId, e]))
    for (const entry of inDefault) expect(inStress.get(entry.igdbId)).toEqual(entry)
  })

  it('plans nothing for the empty set', () => {
    expect(planSeed('empty', fixtures)).toEqual({ games: [], entries: [] })
  })

  it('uses every status, with backlog and completed the largest', () => {
    const { entries: planned } = planSeed('default', fixtures)
    const counts = Object.fromEntries(
      statuses.map((status) => [status, planned.filter((e) => e.status === status).length]),
    )
    for (const status of statuses) expect(counts[status]).toBeGreaterThan(0)
    expect(counts.backlog).toBeGreaterThan(counts.dropped ?? 0)
    expect(counts.completed).toBeGreaterThan(counts.playing ?? 0)
  })

  it('keeps every invented fact plausible', () => {
    const data = new Map(planSeed('stress', fixtures).games.map((game) => [game.igdbId, game]))
    for (const entry of planSeed('stress', fixtures).entries) {
      const game = data.get(entry.igdbId)
      const added = new Date(entry.addedAt).toISOString().slice(0, 10)
      const label = `${game?.title} (${entry.igdbId})`

      expect(added <= today, `${label} was added in the future`).toBe(true)
      if (entry.status === 'wishlist') expect(entry.copies, label).toEqual([])
      if (entry.completedOn) {
        expect(entry.status, label).toBe('completed')
        expect(entry.completedOn >= added, `${label} was finished before it was added`).toBe(true)
        expect(entry.completedOn < today, label).toBe(true)
      }
      if (entry.rating !== undefined) {
        expect(entry.rating % 5, label).toBe(0)
        expect(entry.rating, label).toBeGreaterThanOrEqual(0)
        expect(entry.rating, label).toBeLessThanOrEqual(100)
      }
      expect(Number.isInteger(entry.minutes) && entry.minutes >= 0, label).toBe(true)
      // A copy stands on a platform the game, or one of its versions, came out on.
      const released = new Set([
        ...(game?.platforms ?? []),
        ...entry.versions.flatMap((version) => data.get(version.igdbId)?.platforms ?? []),
      ])
      for (const copy of entry.copies) {
        expect(released.has(copy.platformId), `${label} on platform ${copy.platformId}`).toBe(true)
      }
      const keys = entry.copies.map((copy) => `${copy.platformId}:${copy.format}`)
      expect(new Set(keys).size, label).toBe(keys.length)
    }
  })
})

describe('seedLibrary: default', () => {
  let db: Db
  let sample: string
  let library: Library

  beforeAll(async () => {
    db = await createTestDatabase('default')
    sample = await sampleLibraryId(db)
    library = await readLibrary(db, sample)
  })

  it('fills the sample account’s library, a public shelf at /u/sample (ADR 004)', async () => {
    const [account] = await db.select().from(users).where(eq(users.id, sample))
    expect(account).toMatchObject({ username: SAMPLE_ACCOUNT.handle, shelfPublic: true })
  })

  it('keeps the account, and every other, when run again', async () => {
    const other = await createTestAccount(db, 'someone')
    const { libraryId } = await seedLibrary(db, 'default')
    expect(libraryId).toBe(sample)
    expect((await db.select().from(users)).map((user) => user.id).sort()).toEqual(
      [other, sample].sort(),
    )
  })

  it('makes one entry per sample game', () => {
    expect(library.games).toHaveLength(fixtures.sets.default.length)
    expect(new Set(library.games.map((game) => game.slug)).size).toBe(library.games.length)
  })

  it('gives every game a cover, three colors and a blurred preview', () => {
    for (const game of library.games) {
      expect(game.cover, game.title).toBeTruthy()
      expect(game.colors, game.title).toHaveLength(3)
      expect(game.hash, game.title).toBeTruthy()
    }
  })

  it('folds Skyrim’s Switch port into one entry with two copies (ADR 001)', () => {
    const skyrim = library.games.filter((game) => game.title.includes('Skyrim'))
    expect(skyrim).toHaveLength(1)
    expect(skyrim[0]?.copies.map((copy) => [copy.platform, copy.format])).toEqual([
      [6, 'digital'],
      [130, 'physical'],
    ])
    expect(skyrim[0]?.platforms).toContain(130)
  })

  it('links the Definitive Edition to Shadow of the Tomb Raider as an edition', async () => {
    const members = await readLinkedMembers(db, sample)
    const base = members.find((member) => member.igdbId === 37777)
    const edition = members.find((member) => member.igdbId === 123051)
    expect(edition?.entryId).toBe(base?.entryId)
    expect(base && edition && linkBetween(edition, base)).toBe('edition')
  })

  it('keeps Resident Evil 4 and its remake as two entries', () => {
    const both = library.games.filter((game) => game.title === 'Resident Evil 4')
    expect(both.map((game) => game.year).sort()).toEqual([2005, 2023])
  })

  it('names only what the library uses', () => {
    const used = new Set(library.games.flatMap((game) => game.genres))
    expect(library.names.genre.map((genre) => genre.id).sort((a, b) => a - b)).toEqual(
      [...used].sort((a, b) => a - b),
    )
    const companies = new Set(library.games.flatMap((g) => [...g.developers, ...g.publishers]))
    expect(library.names.company).toHaveLength(companies.size)
  })

  it('has a platform row, in shelf order, for every platform mentioned', () => {
    const mentioned = new Set(
      library.games.flatMap((game) => [...game.platforms, ...game.copies.map((c) => c.platform)]),
    )
    expect(library.names.platform).toHaveLength(mentioned.size)
    const families = library.names.platform.map((platform) => platform.family)
    expect(families[0]).toBe('playstation')
    expect(families.indexOf('xbox')).toBeGreaterThan(families.lastIndexOf('playstation'))
    expect(library.names.platform[0]?.key).toBe('ps5')
  })

  it('gives the same library when run twice', async () => {
    await seedLibrary(db, 'default')
    const again = await readLibrary(db, sample)
    expect(again.games).toEqual(library.games)
    expect(again.names).toEqual(library.names)
  })

  it('gives a new version each time, so a cached library file is never reused', async () => {
    expect(library.version).toBeGreaterThan(1_700_000_000)
  })

  it('is replaced completely by the empty set', async () => {
    const other = await createTestDatabase('default')
    await seedLibrary(other, 'empty')
    expect(await other.select().from(entries)).toEqual([])
    expect(await other.select().from(games)).toEqual([])
    expect((await readLibrary(other, await sampleLibraryId(other))).games).toEqual([])
  })
})

describe('seedLibrary: stress', () => {
  let library: Library

  beforeAll(async () => {
    const db = await createTestDatabase('stress')
    library = await readLibrary(db, await sampleLibraryId(db))
  })

  it('holds more than a thousand games', () => {
    expect(library.games.length).toBeGreaterThan(1000)
  })

  it('keeps the library file within 120 KB compressed per thousand games', () => {
    const json = JSON.stringify(encodeLibrary(library))
    const compressed = gzipSync(json).length
    const perThousand = (compressed / library.games.length) * 1000
    // The budget from the architecture, section 19. If this fails, the file
    // grew: look at what was added to each game's row before raising it.
    expect(perThousand).toBeLessThan(120_000)
  })

  it('round-trips through the library file', () => {
    const sent = JSON.parse(JSON.stringify(encodeLibrary(library)))
    expect(decodeLibrary(sent)).toEqual(library)
  })
})
