import { isNull } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { STARTER_SHELVES } from '@/domain/library/shelves'
import type { Db } from '@/server/db/client'
import { migrateDatabase } from '@/server/db/migrate'
import { shelves } from '@/server/db/schema'
import {
  LibraryError,
  readShelves,
  readVersion,
  removeShelf,
  saveShelf,
} from '@/server/library/store'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'

/** Smart shelves in the database (spec 5.5), each library's its own (ADR 004). */

let db: Db
let me: string

beforeEach(async () => {
  db = await createTestDatabase()
  me = await createTestAccount(db, 'me')
})

describe('the starter shelves', () => {
  it('are in a new account’s library', async () => {
    expect(await readShelves(db, me)).toEqual(STARTER_SHELVES)
  })

  it('are in every data set a seed makes', async () => {
    for (const set of ['default', 'empty'] as const) {
      const seeded = await createTestDatabase(set)
      expect(await readShelves(seeded, await sampleLibraryId(seeded))).toEqual(STARTER_SHELVES)
    }
  })

  it('from before accounts, go to the first account without doubling its own', async () => {
    // The fresh database's own, from an early migration, belong to no one.
    expect((await db.select().from(shelves).where(isNull(shelves.userId))).length).toBe(
      STARTER_SHELVES.length,
    )
    await migrateDatabase(db)
    expect(await db.select().from(shelves).where(isNull(shelves.userId))).toEqual([])
    expect(await readShelves(db, me)).toEqual(STARTER_SHELVES)
  })
})

describe('saving a shelf', () => {
  it('adds a shelf after the others, with an address from its name', async () => {
    const slug = await saveShelf(db, me, {
      name: 'Couch co-op, finished',
      query: 'tag:couch-co-op status:completed',
      sort: '-completed',
      group: 'platform',
    })
    expect(slug).toBe('couch-co-op-finished')
    const saved = await readShelves(db, me)
    expect(saved.at(-1)).toEqual({
      slug,
      name: 'Couch co-op, finished',
      query: 'tag:couch-co-op status:completed',
      sort: '-completed',
      group: 'platform',
    })
  })

  it('gives a second shelf of the same name an address of its own', async () => {
    const shelf = {
      name: 'Backlog',
      query: 'status:backlog',
      sort: 'title',
      group: 'none',
    } as const
    expect(await saveShelf(db, me, shelf)).toBe('backlog-2')
    expect(await saveShelf(db, me, shelf)).toBe('backlog-3')
  })

  it('keeps addresses per library: two libraries may each have a shelf at one', async () => {
    const other = await createTestAccount(db, 'other')
    const shelf = { name: 'Couch co-op', query: 'tag:co-op', sort: 'title', group: 'none' } as const
    expect(await saveShelf(db, me, shelf)).toBe('couch-co-op')
    expect(await saveShelf(db, other, shelf)).toBe('couch-co-op')
    await removeShelf(db, me, 'couch-co-op')
    expect((await readShelves(db, other)).map((each) => each.slug)).toContain('couch-co-op')
  })

  it('changes a shelf and keeps its address, even when it is renamed', async () => {
    const slug = await saveShelf(db, me, {
      slug: 'backlog',
      name: 'The pile',
      query: 'status:backlog -has:playtime',
      sort: 'length',
      group: 'platform',
    })
    expect(slug).toBe('backlog')
    expect((await readShelves(db, me)).find((shelf) => shelf.slug === 'backlog')).toEqual({
      slug: 'backlog',
      name: 'The pile',
      query: 'status:backlog -has:playtime',
      sort: 'length',
      group: 'platform',
    })
  })

  it('cleans a sort or grouping it does not know, and refuses a name it cannot use', async () => {
    const slug = await saveShelf(db, me, {
      name: '  Odd one  ',
      query: '',
      sort: 'popularity',
      group: 'colour' as never,
    })
    expect((await readShelves(db, me)).find((shelf) => shelf.slug === slug)).toMatchObject({
      name: 'Odd one',
      sort: 'title',
      group: 'none',
    })
    await expect(
      saveShelf(db, me, { name: '   ', query: '', sort: 'title', group: 'none' }),
    ).rejects.toThrow(LibraryError)
    await expect(
      saveShelf(db, me, { name: 'x'.repeat(61), query: '', sort: 'title', group: 'none' }),
    ).rejects.toThrow(LibraryError)
  })

  it('says so when the shelf to change or remove is not there, or is another library’s', async () => {
    const other = await createTestAccount(db, 'other')
    const theirs = await saveShelf(db, other, {
      name: 'Theirs',
      query: '',
      sort: 'title',
      group: 'none',
    })
    for (const slug of ['nope', theirs]) {
      await expect(
        saveShelf(db, me, { slug, name: 'Mine now', query: '', sort: 'title', group: 'none' }),
      ).rejects.toMatchObject({ code: 'not-found' })
      await expect(removeShelf(db, me, slug)).rejects.toMatchObject({ code: 'not-found' })
    }
    expect((await readShelves(db, other)).find((shelf) => shelf.slug === theirs)?.name).toBe(
      'Theirs',
    )
  })

  it('removes a shelf', async () => {
    await removeShelf(db, me, 'wishlist')
    expect((await readShelves(db, me)).map((shelf) => shelf.slug)).not.toContain('wishlist')
  })

  it('leaves the library’s version alone: the library file holds no shelves', async () => {
    const before = await readVersion(db, me)
    await saveShelf(db, me, { name: 'New', query: '', sort: 'title', group: 'none' })
    await removeShelf(db, me, 'new')
    expect(await readVersion(db, me)).toBe(before)
  })
})
