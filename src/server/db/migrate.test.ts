import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { caseShapes, families, plastics } from '@/domain/platforms/platforms'
import { openDatabase } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { entries, libraries, platformLinks, sourceItems, users } from '@/server/db/schema'
import { createTestAccount, createTestDatabase } from '@/test/database'

const nameOf = async (db: Awaited<ReturnType<typeof createTestDatabase>>, id: string) =>
  (await db.select({ name: users.name }).from(users).where(eq(users.id, id)))[0]?.name

/** A copy of `drizzle/` that stops before the migration tagged `tag`, and its folder. */
const migrationsBefore = (tag: string) => {
  const folder = mkdtempSync(join(tmpdir(), 'shelf-migrations-'))
  cpSync(join(process.cwd(), 'drizzle'), folder, { recursive: true })
  const journalPath = join(folder, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  const at = journal.entries.findIndex((entry) => entry.tag === tag)
  writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, at) }))
  return folder
}

describe('games a sync brought in before "unsorted" (0008)', () => {
  it('are unsorted where they still stand in the backlog the sync put them in, and nothing else changes', async () => {
    const before = migrationsBefore('0008_sorting')
    const db = openDatabase({ kind: 'memory' })
    try {
      await migrateDatabase(db, before)
      const me = await createTestAccount(db, 'lucas')
      const LINKED = 1_000
      await db.run(sql`insert into platforms (igdb_id, key, name, short, family, shape, plastic)
        values (6, 'pc', 'PC', 'PC', ${families[0]}, ${caseShapes[0]}, ${plastics[0]})`)
      await db.run(sql`insert into platform_links (user_id, source, external_id, linked_at)
        values (${me}, 'steam', '76561197960287930', ${LINKED})`)
      // Each entry: its status, when made, when last changed, and whether Steam feeds a copy of it.
      const made: Record<string, [string, number, number, boolean]> = {
        synced: ['backlog', LINKED + 5, LINKED + 5, true],
        edited: ['backlog', LINKED + 5, LINKED + 9, true],
        older: ['backlog', LINKED - 5, LINKED - 5, true],
        byHand: ['backlog', LINKED + 5, LINKED + 5, false],
        playing: ['playing', LINKED + 5, LINKED + 5, true],
      }
      for (const [id, [status, created, updated, fed]] of Object.entries(made)) {
        await db.run(sql`insert into entries (id, user_id, status, added_at, created_at, updated_at)
          values (${id}, ${me}, ${status}, ${created}, ${created}, ${updated})`)
        await db.run(sql`insert into copies (id, entry_id, platform_id, format, created_at)
          values (${`copy-${id}`}, ${id}, 6, 'digital', ${created})`)
        if (fed) {
          await db.run(sql`insert into source_items (id, user_id, source, store_id, title, evidence,
              first_seen_at, last_seen_at, decision, copy_id)
            values (${`item-${id}`}, ${me}, 'steam', ${id}, ${id}, 'owned', ${LINKED}, ${LINKED},
              'copy', ${`copy-${id}`})`)
        }
      }
      const [{ version } = { version: 0 }] = await db
        .select({ version: libraries.version })
        .from(libraries)
        .where(eq(libraries.userId, me))

      await migrateDatabase(db)

      const statuses = Object.fromEntries(
        (await db.select({ id: entries.id, status: entries.status }).from(entries)).map((row) => [
          row.id,
          row.status,
        ]),
      )
      expect(statuses).toEqual({
        synced: 'unsorted',
        edited: 'backlog',
        older: 'backlog',
        byHand: 'backlog',
        playing: 'playing',
      })
      const [after] = await db
        .select({ version: libraries.version })
        .from(libraries)
        .where(eq(libraries.userId, me))
      expect(after?.version).toBe(version + 1)
    } finally {
      rmSync(before, { recursive: true, force: true })
    }
  })
})

describe('Steam items the store called a game and nothing matched (0009)', () => {
  it('are asked about again, and nothing else is', async () => {
    const before = migrationsBefore('0009_modes-again')
    const db = openDatabase({ kind: 'memory' })
    try {
      await migrateDatabase(db, before)
      const me = await createTestAccount(db, 'lucas')
      // Each item: what the store said, the decision, and the record matched.
      const made: Record<string, [string, string, number | null]> = {
        zombies: ['game', 'pending', null],
        matched: ['game', 'copy', 233],
        software: ['software', 'not_a_game', null],
        unknown: ['unknown', 'pending', null],
        dismissed: ['game', 'not_mine', null],
      }
      for (const [id, [kind, decision, igdbId]] of Object.entries(made)) {
        await db.run(sql`insert into source_items (id, user_id, source, store_id, title, evidence,
            first_seen_at, last_seen_at, decision, igdb_id, kind)
          values (${id}, ${me}, 'steam', ${id}, ${id}, 'owned', 1, 1, ${decision}, ${igdbId}, ${kind})`)
      }

      await migrateDatabase(db)

      const kinds = Object.fromEntries(
        (await db.select({ id: sourceItems.id, kind: sourceItems.kind }).from(sourceItems)).map(
          (row) => [row.id, row.kind],
        ),
      )
      expect(kinds).toEqual({
        zombies: null,
        matched: 'game',
        software: 'software',
        unknown: 'unknown',
        dismissed: 'game',
      })
    } finally {
      rmSync(before, { recursive: true, force: true })
    }
  })
})

describe('links made before platforms kept secrets (0010)', () => {
  it('are kept as they were, with no secret', async () => {
    const before = migrationsBefore('0010_nintendo')
    const db = openDatabase({ kind: 'memory' })
    try {
      await migrateDatabase(db, before)
      const me = await createTestAccount(db, 'lucas')
      await db.run(sql`insert into platform_links (user_id, source, external_id, name, linked_at,
          read_at, synced_at, problem)
        values (${me}, 'steam', '76561197960287930', 'lucas', 1, 2, 3, 'private')`)

      await migrateDatabase(db)

      expect(await db.select().from(platformLinks)).toEqual([
        expect.objectContaining({
          userId: me,
          source: 'steam',
          externalId: '76561197960287930',
          name: 'lucas',
          daily: true,
          readAt: 2,
          syncedAt: 3,
          problem: 'private',
          secret: null,
        }),
      ])
    } finally {
      rmSync(before, { recursive: true, force: true })
    }
  })
})

describe('settling accounts', () => {
  it('names an account by its handle where its name was its email address, shown on its shelf', async () => {
    const db = await createTestDatabase()
    // The first account was made from settings, before sign-up asked for a name.
    const first = await createTestAccount(db, 'lucas')
    await db.update(users).set({ name: 'lucas@shelf.test' }).where(eq(users.id, first))
    const other = await createTestAccount(db, 'ana')
    await db.update(users).set({ name: 'Ana' }).where(eq(users.id, other))

    await migrateDatabase(db)

    expect(await nameOf(db, first)).toBe('lucas')
    expect(await nameOf(db, other)).toBe('Ana')
  })
})

describe('titles nothing matched, now spelled more ways (0011)', () => {
  it('are tried again at the next sync, and nothing else is', async () => {
    const before = migrationsBefore('0011_titles-again')
    const db = openDatabase({ kind: 'memory' })
    try {
      await migrateDatabase(db, before)
      const me = await createTestAccount(db, 'lucas')
      // Each item: its source, the decision, and the record matched.
      const made: Record<string, [string, string, number | null]> = {
        edition: ['nintendo', 'pending', null],
        matched: ['nintendo', 'pending', 7346],
        unmatched: ['steam', 'pending', null],
        dismissed: ['nintendo', 'not_a_game', null],
      }
      for (const [id, [source, decision, igdbId]] of Object.entries(made)) {
        await db.run(sql`insert into source_items (id, user_id, source, store_id, title, evidence,
            first_seen_at, last_seen_at, decision, igdb_id, title_tried_at)
          values (${id}, ${me}, ${source}, ${id}, ${id}, 'played', 1, 1, ${decision}, ${igdbId}, 5)`)
      }

      await migrateDatabase(db)

      const tried = Object.fromEntries(
        (
          await db.select({ id: sourceItems.id, tried: sourceItems.titleTriedAt }).from(sourceItems)
        ).map((row) => [row.id, row.tried]),
      )
      expect(tried).toEqual({ edition: null, matched: 5, unmatched: null, dismissed: 5 })
    } finally {
      rmSync(before, { recursive: true, force: true })
    }
  })
})

describe('Steam artwork stored at the older image path (0022)', () => {
  it('moves to the newer path, file for file, and nothing else does', async () => {
    const before = migrationsBefore('0022_steam-artwork')
    const db = openDatabase({ kind: 'memory' })
    const older = 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/220'
    const newer = 'https://shared.akamai.steamstatic.com/community_assets/images/apps/220'
    try {
      await migrateDatabase(db, before)
      await db.run(sql`insert into achievement_sets (id, provider, provider_set_id)
        values ('steam:220', 'steam', '220')`)
      // Each achievement: its artwork, and its artwork while locked.
      const made: Record<string, [string | null, string | null]> = {
        older: [`${older}/a.jpg`, `${older}/a_bw.jpg`],
        newer: [`${newer}/b.jpg`, `${newer}/b_bw.jpg`],
        none: [null, null],
        elsewhere: ['https://example.com/apps/220/c.jpg', null],
      }
      let position = 0
      for (const [id, [icon, locked]] of Object.entries(made)) {
        await db.run(sql`insert into achievements (set_id, achievement_id, position, name, icon, icon_locked, first_seen_at)
          values ('steam:220', ${id}, ${position++}, ${id}, ${icon}, ${locked}, 1)`)
      }

      await migrateDatabase(db)

      const rows = await db.all<{
        achievement_id: string
        icon: string | null
        icon_locked: string | null
      }>(sql`select achievement_id, icon, icon_locked from achievements order by position`)
      expect(rows).toEqual([
        { achievement_id: 'older', icon: `${newer}/a.jpg`, icon_locked: `${newer}/a_bw.jpg` },
        { achievement_id: 'newer', icon: `${newer}/b.jpg`, icon_locked: `${newer}/b_bw.jpg` },
        { achievement_id: 'none', icon: null, icon_locked: null },
        {
          achievement_id: 'elsewhere',
          icon: 'https://example.com/apps/220/c.jpg',
          icon_locked: null,
        },
      ])
    } finally {
      rmSync(before, { recursive: true, force: true })
    }
  })
})
