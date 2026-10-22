import 'server-only'

import { join } from 'node:path'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'

import { FIRST_HANDLE, handleFrom, isHandle } from '@/domain/accounts/handle'
import type { Db } from '@/server/db/client'
import {
  entries,
  entryVersions,
  libraries,
  libraryMeta,
  removedEntries,
  shelves,
  tags,
  users,
} from '@/server/db/schema'
import { newLibraryKey } from '@/server/library/store'

/**
 * Brings a database up to the current schema by applying the SQL files in
 * `drizzle/` that it has not seen, then gives every row and every account
 * what accounts need. Safe to run again: applied files are recorded in the
 * database and skipped, and the step after them changes only what lacks.
 */
export const migrateDatabase = async (db: Db, folder = join(process.cwd(), 'drizzle')) => {
  await migrate(db, { migrationsFolder: folder })
  await settleAccounts(db)
}

/** `wanted`, or `wanted-2`, `wanted-3`… whichever no account has. */
const freeHandle = async (db: Db, wanted: string): Promise<string> => {
  const base = isHandle(wanted) ? wanted : `${wanted || 'shelf'}-shelf`.replace(/^-+/, '')
  for (let n = 1; ; n += 1) {
    const handle = n === 1 ? base : `${base.slice(0, 20)}-${n}`
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, handle))
      .limit(1)
    if (!taken) return handle
  }
}

/**
 * What the library had before accounts goes to the oldest account, the one
 * there was (ADR 004), with the handle its old addresses lead to. Rows the
 * code still serving wrote during a deployment are taken in the same way on
 * the next one; a shelf whose address the account already has is dropped.
 * Then every account gets a handle and a library row, if it has none.
 */
export const settleAccounts = async (db: Db) => {
  const [oldest] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .orderBy(asc(users.createdAt))
    .limit(1)

  if (oldest) {
    const [orphan] = await db
      .select({ id: entries.id })
      .from(entries)
      .where(isNull(entries.userId))
      .limit(1)
    await db.batch([
      // A fresh database's starter shelves, from an early migration, belong to
      // no one; the account has its own by those names already.
      db
        .delete(shelves)
        .where(
          and(
            isNull(shelves.userId),
            inArray(
              shelves.slug,
              db.select({ slug: shelves.slug }).from(shelves).where(eq(shelves.userId, oldest.id)),
            ),
          ),
        ),
      db.update(entries).set({ userId: oldest.id }).where(isNull(entries.userId)),
      db.update(tags).set({ userId: oldest.id }).where(isNull(tags.userId)),
      db.update(shelves).set({ userId: oldest.id }).where(isNull(shelves.userId)),
      db.update(removedEntries).set({ userId: oldest.id }).where(isNull(removedEntries.userId)),
    ])
    if (orphan && !oldest.username) {
      await db
        .update(users)
        .set({ username: await freeHandle(db, FIRST_HANDLE) })
        .where(eq(users.id, oldest.id))
    }
    // The library row the old counter becomes: the old files' versions are not reused.
    if (orphan) {
      const [meta] = await db.select({ version: libraryMeta.version }).from(libraryMeta).limit(1)
      await db
        .insert(libraries)
        .values({
          userId: oldest.id,
          version: meta?.version ?? 0,
          key: newLibraryKey(),
          createdAt: Date.now(),
        })
        .onConflictDoNothing()
    }
  }

  // A version belongs to its entry's library.
  await db
    .update(entryVersions)
    .set({
      userId: sql`(select ${entries.userId} from ${entries} where ${entries.id} = ${entryVersions.entryId})`,
    })
    .where(isNull(entryVersions.userId))

  const unnamed = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(isNull(users.username))
  for (const user of unnamed) {
    const handle = await freeHandle(db, handleFrom(user.email.split('@')[0] ?? ''))
    await db.update(users).set({ username: handle }).where(eq(users.id, user.id))
  }

  const withoutLibrary = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.id} not in (select ${libraries.userId} from ${libraries})`)
  for (const user of withoutLibrary) {
    await db
      .insert(libraries)
      .values({ userId: user.id, version: 0, key: newLibraryKey(), createdAt: Date.now() })
      .onConflictDoNothing()
  }
}
