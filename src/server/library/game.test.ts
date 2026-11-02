import { eq, inArray } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildGamePage } from '@/domain/library/game-page'
import type { Library } from '@/domain/library/library'
import type { Db } from '@/server/db/client'
import { entries, entryVersions, games, users } from '@/server/db/schema'
import { readGameExtras, readLibrary, readShelfScore } from '@/server/library/read'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'

/** What a game's page reads beyond the library file, on the sample library. */

let db: Db
let sample: string
let library: Library

beforeAll(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  library = await readLibrary(db, sample)
})

const slugOf = async (igdbId: number) =>
  (await db.select({ slug: games.slug }).from(games).where(eq(games.igdbId, igdbId)))[0]!.slug

describe('readGameExtras', () => {
  it("reads a game's summary, screenshots, art and releases", async () => {
    const extras = await readGameExtras(db, sample, 'bloodborne')
    expect(extras?.summary).toMatch(/Hunter/)
    expect(extras?.screenshots.length).toBeGreaterThan(0)
    expect(extras?.releases[0]?.some((release) => release.platform === 48)).toBe(true)
  })

  it('folds in the releases of the versions an entry holds (ADR 001)', async () => {
    const skyrim = await slugOf(472)
    const extras = await readGameExtras(db, sample, skyrim)
    expect(extras?.releases).toHaveLength(2)
    const game = library.games.find((each) => each.slug === skyrim)!
    const page = buildGamePage(library, game, extras!)
    expect(page.facts.releases.map((release) => release.platform)).toContain(130)
  })

  it('knows no game by the slug of a version folded into another', async () => {
    expect(await readGameExtras(db, sample, await slugOf(37034))).toBeUndefined()
    expect(await readGameExtras(db, sample, 'not-a-game')).toBeUndefined()
  })

  it('reads notes with whether they are public, which the page then keeps or drops', async () => {
    const rows = await db
      .select({ slug: games.slug, notes: entries.notes, notesPublic: entries.notesPublic })
      .from(entries)
      .innerJoin(entryVersions, eq(entryVersions.entryId, entries.id))
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.relation, 'primary'))
    const hidden = rows.find((row) => row.notes && !row.notesPublic)!
    const shown = rows.find((row) => row.notes && row.notesPublic)!
    for (const [row, kept] of [
      [hidden, false],
      [shown, true],
    ] as const) {
      const extras = await readGameExtras(db, sample, row.slug)
      const game = library.games.find((each) => each.slug === row.slug)!
      expect(game.hasNotes).toBe(kept)
      expect(buildGamePage(library, game, extras!).facts.notes).toBe(kept ? row.notes : undefined)
    }
  })

  it('takes the most reviewed of what Steam says of its versions', async () => {
    const skyrim = await slugOf(472)
    const versions = await db
      .select({ gameId: entryVersions.gameId })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(
        inArray(
          entryVersions.entryId,
          db
            .select({ id: entryVersions.entryId })
            .from(entryVersions)
            .innerJoin(games, eq(games.id, entryVersions.gameId))
            .where(eq(games.slug, skyrim)),
        ),
      )
    const [first, second] = versions
    const less = { app: '1', count: 10, percent: 50, score: 5 }
    const more = { app: '2', count: 900, percent: 90, score: 8 }
    await db.update(games).set({ steamReviews: less }).where(eq(games.id, first!.gameId))
    await db.update(games).set({ steamReviews: more }).where(eq(games.id, second!.gameId))
    expect((await readGameExtras(db, sample, skyrim))?.steamReviews).toEqual(more)
  })
})

describe('readShelfScore (spec 7.11)', () => {
  let scoreDb: Db
  let game: string

  /** An account's entry for the game, rated, as a new shelf of its own. */
  const rated = async (
    handle: string,
    rating: number,
    entry: Partial<typeof entries.$inferInsert> = {},
  ) => {
    const library = await createTestAccount(scoreDb, handle)
    const id = `${handle}-entry`
    await scoreDb.insert(entries).values({
      id,
      userId: library,
      status: 'completed',
      rating,
      addedAt: 1,
      createdAt: 1,
      updatedAt: 1,
      ...entry,
    })
    await scoreDb
      .insert(entryVersions)
      .values({ entryId: id, gameId: game, relation: 'primary', userId: library })
    return library
  }

  const score = () => readShelfScore(scoreDb, [game])

  beforeEach(async () => {
    scoreDb = await createTestDatabase('default')
    const [row] = await scoreDb.select({ id: games.id }).from(games).where(eq(games.igdbId, 472))
    game = row!.id
    // The sample shelf's own rating for it is left out, to count only what these tests add.
    await scoreDb
      .update(entries)
      .set({ rating: null })
      .where(
        inArray(
          entries.id,
          scoreDb
            .select({ id: entryVersions.entryId })
            .from(entryVersions)
            .where(eq(entryVersions.gameId, game)),
        ),
      )
  })

  it('has nothing to say until someone has rated it', async () => {
    expect(await score()).toBeUndefined()
  })

  it('sums what public shelves gave it, and how many', async () => {
    await rated('first', 80)
    await rated('second', 90)
    expect(await score()).toEqual({ rating: 85, count: 2 })
  })

  it('counts nothing from a private shelf', async () => {
    const library = await rated('hidden', 10)
    await scoreDb.update(users).set({ shelfPublic: false }).where(eq(users.id, library))
    expect(await score()).toBeUndefined()
  })

  it('counts neither a game kept private nor one archived', async () => {
    await rated('kept', 10, { isPrivate: true })
    await rated('gone', 10, { archivedAt: 1 })
    expect(await score()).toBeUndefined()
  })
})
