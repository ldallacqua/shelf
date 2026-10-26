import { describe, expect, it, vi } from 'vitest'

import type * as Accounts from '@/server/auth/account'

import { GET as myGame } from './games/[slug]/route'
import { POST as answerMany } from './platforms/[source]/answers/route'
import { GET as connect } from './platforms/[source]/connect/route'
import { POST as answerItem } from './platforms/[source]/items/[id]/route'
import { GET as listItems } from './platforms/[source]/items/route'
import { POST as pasteLink } from './platforms/[source]/link/route'
import { DELETE as unlink, PATCH as setDaily } from './platforms/[source]/route'
import { GET as backFromSteam } from './platforms/[source]/return/route'
import { POST as syncStep } from './platforms/[source]/sync/route'
import { GET as myPlatforms } from './platforms/route'
import { GET as myKeywords } from './keywords/route'
import { GET as myLibrary } from './library/route'
import { GET as myPlayable } from './play/route'
import { GET as me, PATCH as changeMe } from './route'
import { GET as myShelves } from './shelves/route'
import { GET as myTags } from './tags/route'
import { GET as myTally } from './tally/route'
import { GET as myUnsorted } from './unsorted/route'

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

// Outside a request, as here, Next.js has no request to wait for.
vi.mock('next/server', async (actual) => ({
  ...(await actual<object>()),
  connection: async () => undefined,
}))

vi.mock('@/server/db/client', () => ({
  database: () => {
    throw new Error('A refused request reached the database')
  },
  databaseIsDurable: () => true,
}))

const asked = (path: string, init?: RequestInit) => new Request(`http://localhost${path}`, init)
const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const steamParams = { params: Promise.resolve({ source: 'steam' }) }
const nintendoParams = { params: Promise.resolve({ source: 'nintendo' }) }

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
  ['its platforms', () => myPlatforms()],
  ['its unsorted games', () => myUnsorted()],
  ['its games by status', () => myTally()],
  ['its games, to play', () => myPlayable()],
  [
    'a sync step',
    () => syncStep(asked('/api/v1/me/platforms/steam/sync', post({ read: true })), steamParams),
  ],
  [
    'what Steam listed',
    () => listItems(asked('/api/v1/me/platforms/steam/items?list=needs-you'), steamParams),
  ],
  [
    'an answer about it',
    () =>
      answerItem(asked('/api/v1/me/platforms/steam/items/x', post({ kind: 'again' })), {
        params: Promise.resolve({ source: 'steam', id: 'x' }),
      }),
  ],
  [
    'one answer for many',
    () =>
      answerMany(
        asked(
          '/api/v1/me/platforms/nintendo/answers',
          post({ ids: ['x'], answer: { kind: 'confirm', format: 'digital' } }),
        ),
        nintendoParams,
      ),
  ],
  [
    'the link pasted from Nintendo’s page',
    () =>
      pasteLink(
        asked('/api/v1/me/platforms/nintendo/link', post({ link: 'npf5c38e31cd085304b://auth#' })),
        nintendoParams,
      ),
  ],
  [
    'the daily sync',
    () =>
      setDaily(
        asked('/api/v1/me/platforms/steam', { ...post({ daily: false }), method: 'PATCH' }),
        steamParams,
      ),
  ],
  [
    'unlinking',
    () => unlink(asked('/api/v1/me/platforms/steam', { method: 'DELETE' }), steamParams),
  ],
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

  it('sends someone signed out to sign in before Steam, not to Steam', async () => {
    const response = await connect(
      asked('/api/v1/me/platforms/steam/connect?locale=pt-BR'),
      steamParams,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      'http://localhost/pt-BR/sign-in?from=%2Fpt-BR%2Faccount',
    )
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('sends someone signed out to sign in before Nintendo, not to Nintendo', async () => {
    const response = await connect(
      asked('/api/v1/me/platforms/nintendo/connect?locale=en'),
      nintendoParams,
    )
    expect(response.headers.get('Location')).toBe(
      'http://localhost/en/sign-in?from=%2Fen%2Faccount',
    )
    expect(response.headers.get('Set-Cookie')).toBeNull()
  })

  it('links nothing for an answer from Steam that this browser did not ask for', async () => {
    const response = await backFromSteam(
      asked('/api/v1/me/platforms/steam/return?state=made-up&locale=en'),
      steamParams,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      'http://localhost/en/account?steam=failed#platforms',
    )
  })

  it('says who is asking: nobody, and only to this browser', async () => {
    const response = await me(asked('/api/v1/me'))
    expect(await response.json()).toEqual({ signedIn: false })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
})
