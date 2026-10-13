import 'server-only'

import { join } from 'node:path'

import { migrate } from 'drizzle-orm/libsql/migrator'

import type { Db } from '@/server/db/client'

/**
 * Brings a database up to the current schema by applying the SQL files in
 * `drizzle/` that it has not seen. Safe to run again: applied files are
 * recorded in the database and skipped.
 */
export const migrateDatabase = (db: Db, folder = join(process.cwd(), 'drizzle')) =>
  migrate(db, { migrationsFolder: folder })
