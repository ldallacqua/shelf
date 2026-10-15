import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildGamePage } from '@/domain/library/game-page'
import type { Library } from '@/domain/library/library'
import type { Db } from '@/server/db/client'
import { entries, entryVersions, games } from '@/server/db/schema'
import { readGameExtras, readLibrary } from '@/server/library/read'
import { createTestDatabase } from '@/test/database'

/** What a game's page reads beyond the library file, on the sample library. */

let db: Db
let library: Library

beforeAll(async () => {
  db = await createTestDatabase('default')
  library = await readLibrary(db)
})

const slugOf = async (igdbId: number) =>
  (await db.select({ slug: games.slug }).from(games).where(eq(games.igdbId, igdbId)))[0]!.slug

describe('readGameExtras', () => {
  it("reads a game's summary, screenshots, art and releases", async () => {
    const extras = await readGameExtras(db, 'bloodborne')
    expect(extras?.summary).toMatch(/Hunter/)
    expect(extras?.screenshots.length).toBeGreaterThan(0)
    expect(extras?.releases[0]?.some((release) => release.platform === 48)).toBe(true)
  })

  it('folds in the releases of the versions an entry holds (ADR 001)', async () => {
    const skyrim = await slugOf(472)
    const extras = await readGameExtras(db, skyrim)
    expect(extras?.releases).toHaveLength(2)
    const game = library.games.find((each) => each.slug === skyrim)!
    const page = buildGamePage(library, game, extras!)
    expect(page.facts.releases.map((release) => release.platform)).toContain(130)
  })

  it('knows no game by the slug of a version folded into another', async () => {
    expect(await readGameExtras(db, await slugOf(37034))).toBeUndefined()
    expect(await readGameExtras(db, 'not-a-game')).toBeUndefined()
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
      const extras = await readGameExtras(db, row.slug)
      const game = library.games.find((each) => each.slug === row.slug)!
      expect(game.hasNotes).toBe(kept)
      expect(buildGamePage(library, game, extras!).facts.notes).toBe(kept ? row.notes : undefined)
    }
  })
})
