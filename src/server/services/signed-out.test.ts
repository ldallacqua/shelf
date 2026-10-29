import { describe, expect, it, vi } from 'vitest'

import type * as Accounts from '@/server/auth/account'
import { changeMyAccount } from '@/server/services/account'
import {
  addManyOfMine,
  addMyGame,
  groupingFor,
  matchMine,
  rematchMine,
  searchToAdd,
  undoManyOfMine,
  undoMyAdd,
} from '@/server/services/adding'
import {
  addMyCopy,
  archiveMine,
  bringBackMine,
  myArchived,
  myGame as myGameService,
  myStoreHours,
  patchMine,
  removeMine,
  removeMyCopy,
  restoreMine,
  setMyCopyFormat,
} from '@/server/services/editing'
import { myTally, myUnsorted, placeMine } from '@/server/services/placing'
import { removeMyShelf, saveMyShelf } from '@/server/services/shelves'
import {
  answerMine,
  confirmManyMine,
  linkMine,
  listMine,
  myPlatforms,
  setMyDaily,
  syncMine,
  unlinkMine,
} from '@/server/services/sync'

/**
 * Spec 11, ADR 004: every change is checked on the server. A server action
 * can be called by anyone who finds its address, so each service a route or
 * an action calls is asked, here, by someone who is not signed in. None may
 * reach the database or IGDB. The reads of one's own library are asked the
 * same in `app/api/v1/me/signed-out.test.ts`; another account's ids answer
 * "not found" in the store (`library/store.test.ts`).
 */

vi.mock('@/server/auth/account', async (actual) => {
  const real = await actual<typeof Accounts>()
  return {
    ...real,
    checkAccount: async () => ({}),
    currentAccount: async () => undefined,
    requireAccount: async () => {
      throw new real.NotSignedInError()
    },
  }
})

// Anything past the check would need these; reaching them fails the test.
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
vi.mock('@/server/sync/steam', () => ({
  steam: () => {
    throw new Error('A refused request reached Steam')
  },
}))

const ID = '00000000-0000-4000-a000-000000000000'

const requests: [string, () => Promise<{ ok: boolean; reason?: string }>][] = [
  ['search IGDB', () => searchToAdd('hades')],
  ['ask where a game goes', () => groupingFor(231)],
  ['add a game', () => addMyGame({ igdbId: 231, status: 'backlog', copies: [] })],
  ['say which game one of its games is', () => rematchMine('bloodborne', { igdbId: 231 })],
  [
    'undo an add',
    () => undoMyAdd({ entryId: ID, gameId: ID, newEntry: true, newVersion: true, copyIds: [] }),
  ],
  ['match a pasted list', () => matchMine(['Hades', 'Celeste (2018) [Switch]'])],
  ['add many games', () => addManyOfMine([{ igdbId: 231, status: 'backlog', copies: [] }])],
  [
    'undo adding many',
    () =>
      undoManyOfMine([{ entryId: ID, gameId: ID, newEntry: true, newVersion: true, copyIds: [] }]),
  ],
  ['read a game with its private note', () => myGameService('bloodborne')],
  ['change what is mine', () => patchMine('bloodborne', { mine: { status: 'dropped' } })],
  ['set tags and playtime', () => patchMine('bloodborne', { tags: ['x'], minutes: 60 })],
  ['change the main version', () => patchMine('bloodborne', { mainVersion: ID })],
  ['add a copy', () => addMyCopy('bloodborne', { platformId: 6, format: 'digital' })],
  ['switch a copy’s format', () => setMyCopyFormat('bloodborne', ID, 'digital')],
  ['remove a copy', () => removeMyCopy('bloodborne', ID)],
  ['remove a game', () => removeMine('bloodborne')],
  ['put a removed game back', () => restoreMine(ID)],
  ['archive a game', () => archiveMine('bloodborne')],
  ['bring an archived game back', () => bringBackMine(ID)],
  ['list its archived games', () => myArchived()],
  ['list the games whose stores count far past IGDB', () => myStoreHours()],
  ['take idle time out of a game', () => patchMine('bloodborne', { idle: 60 })],
  ['list its unsorted games', () => myUnsorted()],
  ['count its games by status', () => myTally()],
  ['place many games at once', () => placeMine({ entries: [ID], status: 'backlog' })],
  ['save a shelf', () => saveMyShelf({ name: 'Mine', query: '', sort: 'title', group: 'none' })],
  ['remove a shelf', () => removeMyShelf('short-ones')],
  ['change the account', () => changeMyAccount({ handle: 'someone-else' })],
  ['list its platforms', () => myPlatforms()],
  [
    'link a Steam account',
    () => linkMine('steam', { externalId: '76561190000000001', name: 'Someone' }),
  ],
  ['sync from Steam', () => syncMine('steam', { read: true })],
  ['list what Steam listed', () => listMine('steam', 'needs-you')],
  ['answer about a game Steam listed', () => answerMine('steam', ID, { kind: 'again' })],
  ['switch the daily sync', () => setMyDaily('steam', { daily: false })],
  ['unlink Steam', () => unlinkMine('steam')],
  [
    'link a Nintendo account',
    () => linkMine('nintendo', { externalId: 'a0b1c2d3e4f5a6b7', secret: 'a-session' }),
  ],
  [
    'confirm games Nintendo listed',
    () =>
      confirmManyMine('nintendo', { ids: [ID], answer: { kind: 'confirm', format: 'digital' } }),
  ],
]

describe('signed out', () => {
  for (const [what, request] of requests) {
    it(`refuses to ${what}`, async () => {
      expect(await request()).toEqual({ ok: false, reason: 'not-signed-in' })
    })
  }
})
