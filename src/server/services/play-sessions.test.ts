import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Db } from '@/server/db/client'
import { games } from '@/server/db/schema'
import { readLibrary, readOwnerGame } from '@/server/library/read'
import { findEntryIdBySlug, removeEntryForUndo, restoreEntry } from '@/server/library/store'
import { createTestDatabase, sampleLibraryId } from '@/test/database'

import { appsPlayed, placeAndKeep } from './play-sessions'

/**
 * What Shelf for Windows counted (ADR 005, section 12): the app knows a Steam game only by its
 * app, and sends again whatever it never heard back about.
 */

/** In the default library (`seed/mine.ts`). */
const SLUG = 'donkey-kong-country'
const APP = '424242'

let db: Db
let sample: string
let entryId: string

const sent = (id: string, game: { entry: string } | { steam: string }, seconds = 600) => ({
  id,
  game,
  startedAt: 1_000,
  endedAt: 1_000 + seconds * 2_000,
  seconds,
})

const tracked = async () => (await readOwnerGame(db, sample, entryId))?.tracked

beforeEach(async () => {
  db = await createTestDatabase('default')
  sample = await sampleLibraryId(db)
  entryId = (await findEntryIdBySlug(db, sample, SLUG))!
  // The fixtures' own hours are a seeded session of their own: this game's are read as growth.
  await db
    .update(games)
    .set({ storeIds: [{ source: 'steam', uid: APP }] })
    .where(eq(games.slug, SLUG))
})

describe('what Shelf for Windows counted', () => {
  it('finds a Steam app’s game, and adds to it', async () => {
    const before = (await tracked()) ?? 0
    expect(await placeAndKeep(db, sample, [sent('a', { steam: APP })])).toEqual(['a'])
    expect(await tracked()).toBe(before + 10)
  })

  it('takes a game’s file by its entry', async () => {
    const before = (await tracked()) ?? 0
    expect(await placeAndKeep(db, sample, [sent('a', { entry: entryId })])).toEqual(['a'])
    expect(await tracked()).toBe(before + 10)
  })

  it('leaves out a game not on the shelf, for the app to hold on to', async () => {
    const kept = await placeAndKeep(db, sample, [
      sent('a', { steam: '999' }),
      sent('b', { entry: 'nope' }),
      sent('c', { steam: APP }),
    ])
    expect(kept).toEqual(['c'])
  })

  it('counts the same session once, however often it is sent', async () => {
    const before = (await tracked()) ?? 0
    await placeAndKeep(db, sample, [sent('a', { steam: APP })])
    await placeAndKeep(db, sample, [sent('a', { steam: APP })])
    expect(await tracked()).toBe(before + 10)
  })

  it('shows on the shelf as the game’s hours', async () => {
    const before = (await readLibrary(db, sample)).games.find((game) => game.slug === SLUG)!.minutes
    await placeAndKeep(db, sample, [sent('a', { steam: APP })])
    const after = (await readLibrary(db, sample)).games.find((game) => game.slug === SLUG)!.minutes
    expect(after).toBe(before + 10)
  })

  it('comes back with a game put back after removing it', async () => {
    await placeAndKeep(db, sample, [sent('a', { steam: APP })])
    const before = await tracked()
    const undo = await removeEntryForUndo(db, sample, entryId)
    await restoreEntry(db, sample, undo)
    expect(await tracked()).toBe(before)
  })
})

describe('the games a session has synced by themselves', () => {
  it('are the Steam apps of what was kept, each once', () => {
    const sessions = [
      sent('a', { steam: APP }),
      sent('b', { steam: APP }),
      sent('c', { steam: '7' }),
    ]
    expect(appsPlayed(sessions, ['a', 'b', 'c'])).toEqual([APP, '7'])
  })

  it('leave out a game not on the shelf, which the app sends again every minute', async () => {
    const sessions = [sent('a', { steam: '999' }), sent('b', { steam: APP })]
    expect(appsPlayed(sessions, await placeAndKeep(db, sample, sessions))).toEqual([APP])
  })

  it('leave out a game’s file, which Steam knows nothing of', () => {
    expect(appsPlayed([sent('a', { entry: entryId })], ['a'])).toEqual([])
  })
})
