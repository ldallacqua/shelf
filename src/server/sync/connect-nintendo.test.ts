import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NINTENDO_ACCOUNTS, NINTENDO_REDIRECT } from '@/domain/sync/nintendo'
import type * as Accounts from '@/server/auth/account'
import type { Db } from '@/server/db/client'
import { createNintendoHandlers, newNintendoMockState } from '@/server/mocks/nintendo'
import { MOCK_NINTENDO } from '@/server/mocks/owner'
import { readLink } from '@/server/sync/memory'
import { open } from '@/server/sync/sealed'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { finishNintendoLink, NINTENDO_TRIP_COOKIE, startNintendoLink } from './connect'

/**
 * Signing in on Nintendo's page, end to end against the Nintendo double:
 * the trip there, the link pasted back, its code exchanged for a session
 * kept sealed for the account that started it, and the pastes that must
 * link nothing.
 */

const state: { db?: Db; signedIn?: string } = {}

vi.mock('@/server/db/client', async (actual) => ({
  ...(await actual<object>()),
  database: () => state.db,
  databaseIsDurable: () => true,
}))

vi.mock('@/server/auth/account', async (actual) => {
  const real = await actual<typeof Accounts>()
  const account = () =>
    state.signedIn
      ? { id: state.signedIn, name: 'Player', handle: 'player', shelfPublic: true }
      : undefined
  return {
    ...real,
    checkAccount: async () => ({ account: account() }),
    currentAccount: async () => account(),
    requireAccount: async () => {
      const found = account()
      if (!found) throw new real.NotSignedInError()
      return found
    },
  }
})

const ORIGIN = 'http://localhost'
const KEY = Buffer.alloc(32, 3).toString('base64')
let nintendo: ReturnType<typeof newNintendoMockState>

beforeEach(async () => {
  vi.stubEnv('PLATFORM_TOKEN_KEY', KEY)
  nintendo = newNintendoMockState()
  network.use(...createNintendoHandlers(nintendo))
  state.db = await createTestDatabase()
  state.signedIn = await createTestAccount(state.db, 'player')
})

afterEach(() => vi.unstubAllEnvs())

/** Starts a sign-in: where it sends the browser, its state, and the cookie that keeps the round trip. */
const start = async () => {
  const response = await startNintendoLink(
    new Request(`${ORIGIN}/api/v1/me/platforms/nintendo/connect?locale=en`),
  )
  const location = new URL(response.headers.get('Location')!)
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!
  return { response, location, state: location.searchParams.get('state')!, cookie }
}

/** The link on Nintendo's "Select this account" button, for that sign-in. */
const buttonLink = (forState: string, code: string = MOCK_NINTENDO.code) =>
  `${NINTENDO_REDIRECT}#session_token_code=${code}&state=${forState}&session_state=x`

const paste = async (link: string, cookie?: string) => {
  const response = await finishNintendoLink(
    new Request(`${ORIGIN}/api/v1/me/platforms/nintendo/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify({ link }),
    }),
  )
  return { response, body: (await response.json()) as { outcome?: string } }
}

describe('linking Nintendo', () => {
  it('sends the browser to Nintendo’s own page, keeping the round trip in a cookie of its own', async () => {
    const { response, location, cookie } = await start()
    expect(response.status).toBe(303)
    expect(`${location.origin}${location.pathname}`).toBe(`${NINTENDO_ACCOUNTS}/authorize`)
    expect(location.searchParams.get('session_token_code_challenge_method')).toBe('S256')
    expect(cookie).toMatch(new RegExp(`^${NINTENDO_TRIP_COOKIE}=`))
    const set = response.headers.get('Set-Cookie')!
    expect(set).toContain('HttpOnly')
    expect(set).toContain('Path=/api/v1/me/platforms/nintendo')
    // The secret travels to Nintendo only as its hash.
    const verifier = cookie.split('.')[1]!
    expect(location.toString()).not.toContain(verifier)
  })

  it('sends someone signed out to sign in first', async () => {
    state.signedIn = undefined
    const response = await startNintendoLink(
      new Request(`${ORIGIN}/api/v1/me/platforms/nintendo/connect?locale=pt-BR`),
    )
    expect(response.headers.get('Location')).toBe(
      `${ORIGIN}/pt-BR/sign-in?from=${encodeURIComponent('/pt-BR/account')}`,
    )
  })

  it('links the account the pasted link signed in, its session sealed, and ends the round trip', async () => {
    const trip = await start()
    const { body, response } = await paste(`  ${buttonLink(trip.state)}\n`, trip.cookie)
    expect(body).toEqual({ outcome: 'linked' })
    expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0')

    const link = await readLink(state.db!, state.signedIn!, 'nintendo')
    expect(link).toMatchObject({
      externalId: MOCK_NINTENDO.accountId,
      name: MOCK_NINTENDO.nickname,
    })
    expect(link!.secret).not.toContain(MOCK_NINTENDO.sessionToken)
    expect(open(link!.secret!, state.signedIn!, 'nintendo')).toBe(MOCK_NINTENDO.sessionToken)
  })

  it('links nothing for what is not the button’s link, and lets another paste try', async () => {
    const trip = await start()
    const page = `${NINTENDO_ACCOUNTS}/authorize?state=${trip.state}`
    const { body, response } = await paste(page, trip.cookie)
    expect(body).toEqual({ outcome: 'not-the-link' })
    expect(response.headers.get('Set-Cookie')).toBeNull()
    expect((await paste(buttonLink(trip.state), trip.cookie)).body).toEqual({ outcome: 'linked' })
  })

  it('links nothing for a link from another sign-in, or with no sign-in begun in this browser', async () => {
    const trip = await start()
    const other = await start()
    expect((await paste(buttonLink(other.state), trip.cookie)).body).toEqual({
      outcome: 'another-sign-in',
    })
    expect((await paste(buttonLink(trip.state))).body).toEqual({ outcome: 'another-sign-in' })
    expect(await readLink(state.db!, state.signedIn!, 'nintendo')).toBeUndefined()
  })

  it('says when Nintendo refuses the code: it is good once', async () => {
    const trip = await start()
    nintendo.used.add(MOCK_NINTENDO.code)
    expect((await paste(buttonLink(trip.state), trip.cookie)).body).toEqual({
      outcome: 'code-refused',
    })
    expect(await readLink(state.db!, state.signedIn!, 'nintendo')).toBeUndefined()
  })

  it('says when this server cannot keep the session, before asking Nintendo anything', async () => {
    vi.stubEnv('PLATFORM_TOKEN_KEY', '')
    const trip = await start()
    expect((await paste(buttonLink(trip.state), trip.cookie)).body).toEqual({ outcome: 'unset' })
    expect(nintendo.asked).toEqual([])
  })

  it('refuses someone signed out', async () => {
    const trip = await start()
    state.signedIn = undefined
    expect((await paste(buttonLink(trip.state), trip.cookie)).response.status).toBe(401)
  })
})
