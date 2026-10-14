import { describe, expect, it } from 'vitest'

import { STARTER_SHELVES } from '@/domain/library/shelves'
import {
  LibraryError,
  readShelves,
  readVersion,
  removeShelf,
  saveShelf,
} from '@/server/library/store'
import { createTestDatabase } from '@/test/database'

/** Smart shelves in the database (spec 5.5). */

describe('the starter shelves', () => {
  it('are in a new library, from its first migration on', async () => {
    const db = await createTestDatabase()
    expect(await readShelves(db)).toEqual(STARTER_SHELVES)
  })

  it('are in every data set a seed makes', async () => {
    for (const set of ['default', 'empty'] as const) {
      expect(await readShelves(await createTestDatabase(set))).toEqual(STARTER_SHELVES)
    }
  })
})

describe('saving a shelf', () => {
  it('adds a shelf after the others, with an address from its name', async () => {
    const db = await createTestDatabase()
    const slug = await saveShelf(db, {
      name: 'Couch co-op, finished',
      query: 'tag:couch-co-op status:completed',
      sort: '-completed',
      group: 'platform',
    })
    expect(slug).toBe('couch-co-op-finished')
    const shelves = await readShelves(db)
    expect(shelves.at(-1)).toEqual({
      slug,
      name: 'Couch co-op, finished',
      query: 'tag:couch-co-op status:completed',
      sort: '-completed',
      group: 'platform',
    })
  })

  it('gives a second shelf of the same name an address of its own', async () => {
    const db = await createTestDatabase()
    const shelf = {
      name: 'Backlog',
      query: 'status:backlog',
      sort: 'title',
      group: 'none',
    } as const
    expect(await saveShelf(db, shelf)).toBe('backlog-2')
    expect(await saveShelf(db, shelf)).toBe('backlog-3')
  })

  it('changes a shelf and keeps its address, even when it is renamed', async () => {
    const db = await createTestDatabase()
    const slug = await saveShelf(db, {
      slug: 'backlog',
      name: 'The pile',
      query: 'status:backlog -has:playtime',
      sort: 'length',
      group: 'platform',
    })
    expect(slug).toBe('backlog')
    expect((await readShelves(db)).find((shelf) => shelf.slug === 'backlog')).toEqual({
      slug: 'backlog',
      name: 'The pile',
      query: 'status:backlog -has:playtime',
      sort: 'length',
      group: 'platform',
    })
  })

  it('cleans a sort or grouping it does not know, and refuses a name it cannot use', async () => {
    const db = await createTestDatabase()
    const slug = await saveShelf(db, {
      name: '  Odd one  ',
      query: '',
      sort: 'popularity',
      group: 'colour' as never,
    })
    expect((await readShelves(db)).find((shelf) => shelf.slug === slug)).toMatchObject({
      name: 'Odd one',
      sort: 'title',
      group: 'none',
    })
    await expect(
      saveShelf(db, { name: '   ', query: '', sort: 'title', group: 'none' }),
    ).rejects.toThrow(LibraryError)
    await expect(
      saveShelf(db, { name: 'x'.repeat(61), query: '', sort: 'title', group: 'none' }),
    ).rejects.toThrow(LibraryError)
  })

  it('says so when the shelf to change or remove is not there', async () => {
    const db = await createTestDatabase()
    await expect(
      saveShelf(db, { slug: 'nope', name: 'Nope', query: '', sort: 'title', group: 'none' }),
    ).rejects.toMatchObject({ code: 'not-found' })
    await expect(removeShelf(db, 'nope')).rejects.toMatchObject({ code: 'not-found' })
  })

  it('removes a shelf', async () => {
    const db = await createTestDatabase()
    await removeShelf(db, 'wishlist')
    expect((await readShelves(db)).map((shelf) => shelf.slug)).not.toContain('wishlist')
  })

  it('leaves the library’s version alone: the library file holds no shelves', async () => {
    const db = await createTestDatabase('default')
    const before = await readVersion(db)
    await saveShelf(db, { name: 'New', query: '', sort: 'title', group: 'none' })
    await removeShelf(db, 'new')
    expect(await readVersion(db)).toBe(before)
  })
})
