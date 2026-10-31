import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { readLibrary } from '@/server/library/read'
import { LibraryError, readVersion } from '@/server/library/store'
import { createTestAccount, createTestDatabase, sampleLibraryId } from '@/test/database'

import { createEditing } from './editing'

let db: Db
let sample: string
let editing: ReturnType<typeof createEditing>

/** In the default library with a private note, two copies and tags (`seed/mine.ts`). */
const SLUG = 'donkey-kong-country'
const PC = 6

beforeEach(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  editing = createEditing(db, sample)
})

describe('a game as its owner edits it', () => {
  it('carries the ids, the private note, and every platform it could be owned on', async () => {
    const game = await editing.read(SLUG)
    expect(game.slug).toBe(SLUG)
    expect(game.entryId).toBeTruthy()
    expect(game.notes).toBe('Played it through twice, back to back.')
    expect(game.notesPublic).toBe(false)
    expect(game.copies.every((copy) => copy.id && copy.platformId)).toBe(true)
    expect(game.versions[0]).toMatchObject({ slug: SLUG, relation: 'primary' })
    expect(game.platforms.length).toBeGreaterThan(0)
  })

  it('lists the versions folded in, the one that names it first', async () => {
    const skyrim = await editing.read('the-elder-scrolls-v-skyrim')
    expect(skyrim.versions.map((version) => version.relation)).toEqual(['primary', 'port'])
  })

  it('says so for a slug that is no game', async () => {
    await expect(editing.read('no-such-game')).rejects.toBeInstanceOf(LibraryError)
  })
})

describe('changing a game', () => {
  it('changes what is mine about it, and raises the version', async () => {
    const before = await readVersion(db, sample)
    const { version } = await editing.patch(SLUG, {
      mine: { status: 'completed', completedOn: '2026-10-01', rating: 85, notesPublic: true },
    })
    expect(version).toBe(before + 1)
    const game = (await readLibrary(db, sample)).games.find((each) => each.slug === SLUG)
    expect(game).toMatchObject({
      status: 'completed',
      completedOn: '2026-10-01',
      rating: 85,
      hasNotes: true,
    })
  })

  it('adds a copy, switches its format, and removes it', async () => {
    await editing.addCopy(SLUG, { platformId: PC, format: 'digital' })
    const added = (await editing.read(SLUG)).copies.find((copy) => copy.platformId === PC)!
    expect(added.format).toBe('digital')
    await editing.setFormat(SLUG, added.id, 'physical')
    expect((await editing.read(SLUG)).copies.find((copy) => copy.id === added.id)?.format).toBe(
      'physical',
    )
    await editing.removeCopy(SLUG, added.id)
    expect((await editing.read(SLUG)).copies.some((copy) => copy.id === added.id)).toBe(false)
  })

  it('sets tags and the time left idle, in one step', async () => {
    await editing.patch(SLUG, { tags: ['Couch', 'Nineties'], idle: 600 })
    const game = await editing.read(SLUG)
    expect(game.tags).toEqual(['Couch', 'Nineties'])
    expect(game.idle).toBe(600)
  })
})

describe('the versions and copies of a game', () => {
  it('makes another version the main one', async () => {
    const skyrim = await editing.read('the-elder-scrolls-v-skyrim')
    const port = skyrim.versions.find((version) => version.relation === 'port')!
    await editing.patch(skyrim.slug, { mainVersion: port.gameId })
    const after = await editing.read(skyrim.entryId)
    expect(after.versions[0]?.gameId).toBe(port.gameId)
  })

  it('will not touch a copy through another game', async () => {
    const other = (await editing.read('the-elder-scrolls-v-skyrim')).copies[0]!
    await expect(editing.removeCopy(SLUG, other.id)).rejects.toBeInstanceOf(LibraryError)
  })
})

describe('removing a game', () => {
  it('takes it off the shelf, and Undo puts back exactly what was there', async () => {
    const before = await readLibrary(db, sample)
    const owned = await editing.read(SLUG)

    const removed = await editing.remove(owned.entryId)
    expect(removed.title).toBe('Donkey Kong Country')
    expect((await readLibrary(db, sample)).games.some((game) => game.slug === SLUG)).toBe(false)

    const restored = await editing.restore(removed.undo)
    expect(restored.slug).toBe(SLUG)
    expect(await editing.read(SLUG)).toEqual(owned)
    const after = await readLibrary(db, sample)
    expect(after.games.find((game) => game.slug === SLUG)).toEqual(
      before.games.find((game) => game.slug === SLUG),
    )
  })

  it('can be undone only once', async () => {
    const { undo } = await editing.remove(SLUG)
    await editing.restore(undo)
    await expect(editing.restore(undo)).rejects.toBeInstanceOf(LibraryError)
  })
})

describe('another account’s editing (ADR 004)', () => {
  it('finds none of this library’s games, by address or id, and changes nothing', async () => {
    const owned = await editing.read(SLUG)
    const theirs = createEditing(db, await createTestAccount(db, 'other'))
    for (const attempt of [
      () => theirs.read(SLUG),
      () => theirs.read(owned.entryId),
      () => theirs.patch(owned.entryId, { mine: { status: 'dropped' } }),
      () => theirs.removeCopy(owned.entryId, owned.copies[0]!.id),
      () => theirs.remove(owned.entryId),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ code: 'not-found' })
    }
    expect(await editing.read(SLUG)).toEqual(owned)
  })
})
