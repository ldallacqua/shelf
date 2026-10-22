import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { migrateDatabase } from '@/server/db/migrate'
import { users } from '@/server/db/schema'
import { createTestAccount, createTestDatabase } from '@/test/database'

const nameOf = async (db: Awaited<ReturnType<typeof createTestDatabase>>, id: string) =>
  (await db.select({ name: users.name }).from(users).where(eq(users.id, id)))[0]?.name

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
