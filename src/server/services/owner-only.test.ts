import { describe, expect, it, vi } from 'vitest'

import type * as Owner from '@/server/auth/owner'

import {
  addGameForOwner,
  addManyForOwner,
  groupingFor,
  matchForOwner,
  searchToAdd,
  undoAddForOwner,
  undoManyForOwner,
} from '@/server/services/adding'
import {
  addCopyForOwner,
  ownerGame,
  patchForOwner,
  removeCopyForOwner,
  removeForOwner,
  restoreForOwner,
  setFormatForOwner,
} from '@/server/services/editing'
import { removeShelfForOwner, saveShelfForOwner } from '@/server/services/shelves'

/**
 * Spec 11: every change is checked on the server. A server action can be
 * called by anyone who finds its address, so each service a route or an
 * action calls is asked, here, by someone who is not the owner. None may
 * reach the database or IGDB.
 */

vi.mock('@/server/auth/owner', async (actual) => {
  const real = await actual<typeof Owner>()
  return {
    ...real,
    isOwner: async () => false,
    currentOwner: async () => undefined,
    requireOwner: async () => {
      throw new real.NotOwnerError()
    },
  }
})

// Anything past the owner check would need these; reaching them fails the test.
vi.mock('@/server/db/client', () => ({
  database: () => {
    throw new Error('A refused request reached the database')
  },
  databaseIsDurable: () => true,
}))
vi.mock('@/server/igdb', () => ({
  igdb: () => {
    throw new Error('A refused request reached IGDB')
  },
}))

const ID = '00000000-0000-4000-a000-000000000000'

const requests: [string, () => Promise<{ ok: boolean; reason?: string }>][] = [
  ['search IGDB', () => searchToAdd('hades')],
  ['ask where a game goes', () => groupingFor(231)],
  ['add a game', () => addGameForOwner({ igdbId: 231, status: 'backlog', copies: [] })],
  [
    'undo an add',
    () =>
      undoAddForOwner({ entryId: ID, gameId: ID, newEntry: true, newVersion: true, copyIds: [] }),
  ],
  ['match a pasted list', () => matchForOwner(['Hades', 'Celeste (2018) [Switch]'])],
  ['add many games', () => addManyForOwner([{ igdbId: 231, status: 'backlog', copies: [] }])],
  [
    'undo adding many',
    () =>
      undoManyForOwner([
        { entryId: ID, gameId: ID, newEntry: true, newVersion: true, copyIds: [] },
      ]),
  ],
  ['read a game with its private note', () => ownerGame('bloodborne')],
  ['change what is mine', () => patchForOwner('bloodborne', { mine: { status: 'dropped' } })],
  ['set tags and playtime', () => patchForOwner('bloodborne', { tags: ['x'], minutes: 60 })],
  ['change the main version', () => patchForOwner('bloodborne', { mainVersion: ID })],
  ['add a copy', () => addCopyForOwner('bloodborne', { platformId: 6, format: 'digital' })],
  ['switch a copy’s format', () => setFormatForOwner('bloodborne', ID, 'digital')],
  ['remove a copy', () => removeCopyForOwner('bloodborne', ID)],
  ['remove a game', () => removeForOwner('bloodborne')],
  ['put a removed game back', () => restoreForOwner(ID)],
  [
    'save a shelf',
    () => saveShelfForOwner({ name: 'Mine', query: '', sort: 'title', group: 'none' }),
  ],
  ['remove a shelf', () => removeShelfForOwner('short-ones')],
]

describe('without the owner', () => {
  for (const [what, request] of requests) {
    it(`refuses to ${what}`, async () => {
      expect(await request()).toEqual({ ok: false, reason: 'not-signed-in' })
    })
  }
})
