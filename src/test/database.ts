import { eq, sql } from 'drizzle-orm'

import { SAMPLE_ACCOUNT } from '@/server/mocks/owner'
import { openDatabase, type Db } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { users } from '@/server/db/schema'
import { startLibrary } from '@/server/library/store'
import { seedLibrary, type SeedSet } from '@/server/seed/seed'

/**
 * A fresh database in memory, migrated to the current schema: the real
 * engine and the real migrations, gone when the test ends.
 */
export const createTestDatabase = async (seed?: SeedSet): Promise<Db> => {
  const db = openDatabase({ kind: 'memory' })
  await migrateDatabase(db)
  if (seed) await seedLibrary(db, seed)
  return db
}

/**
 * An account with an empty library of its own (ADR 004), by its handle, made
 * as sign-up makes one: the library a test writes to. Its id is the
 * library's.
 */
export const createTestAccount = async (
  db: Db,
  handle = 'tester',
  { shelfPublic = true }: { shelfPublic?: boolean } = {},
): Promise<string> => {
  const id = `user-${handle}`
  const at = Date.now()
  // Only the columns accounts have had since they began, so a test of an older migration can
  // make one too; a column added since takes its default.
  await db.run(sql`insert into users (id, name, email, email_verified, username, shelf_public, created_at, updated_at)
    values (${id}, ${handle}, ${`${handle}@shelf.test`}, 1, ${handle}, ${shelfPublic ? 1 : 0}, ${at}, ${at})`)
  await startLibrary(db, id)
  return id
}

/** The sample account's id, which every seed fills: its library's id. */
export const sampleLibraryId = async (db: Db): Promise<string> => {
  const [found] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, SAMPLE_ACCOUNT.handle))
    .limit(1)
  if (!found) throw new Error('No sample account: seed the database first.')
  return found.id
}
