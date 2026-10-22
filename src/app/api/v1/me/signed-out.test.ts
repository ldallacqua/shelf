import { describe, expect, it, vi } from 'vitest'

import type * as Accounts from '@/server/auth/account'

import { GET as myGame } from './games/[slug]/route'
import { GET as myKeywords } from './keywords/route'
import { GET as myLibrary } from './library/route'
import { GET as me, PATCH as changeMe } from './route'
import { GET as myShelves } from './shelves/route'
import { GET as myTags } from './tags/route'

/**
 * ADR 004: a private shelf is read through `/api/v1/me/…`, for its own
 * account only. Asked by someone not signed in, each answers 401, kept by
 * nothing, before reaching the database.
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

vi.mock('@/server/db/client', () => ({
  database: () => {
    throw new Error('A refused request reached the database')
  },
  databaseIsDurable: () => true,
}))

const asked = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)

const reads: [string, () => Promise<Response>][] = [
  ['its own library', () => myLibrary(asked('/api/v1/me/library'))],
  [
    'a game of its own',
    () =>
      myGame(asked('/api/v1/me/games/bloodborne'), {
        params: Promise.resolve({ slug: 'bloodborne' }),
      }),
  ],
  ['its keywords', () => myKeywords(asked('/api/v1/me/keywords'))],
  ['its tags', () => myTags(asked('/api/v1/me/tags'))],
  ['its smart shelves', () => myShelves(asked('/api/v1/me/shelves'))],
  [
    'a change to the account',
    () =>
      changeMe(
        asked('/api/v1/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shelfPublic: false }),
        }),
      ),
  ],
]

describe('signed out, one’s own library', () => {
  for (const [what, read] of reads) {
    it(`answers 401 for ${what}, kept by nothing`, async () => {
      const response = await read()
      expect(response.status).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(await response.json()).toMatchObject({ error: { code: 'not-signed-in' } })
    })
  }

  it('says who is asking: nobody, and only to this browser', async () => {
    const response = await me(asked('/api/v1/me'))
    expect(await response.json()).toEqual({ signedIn: false })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
