import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { eq, sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { caseShapes, families, plastics } from '@/domain/platforms/platforms'
import { openDatabase } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { entries, libraries, users } from '@/server/db/schema'
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
