import { openDatabase, type Db } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
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
