import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STEAM_OPENID } from '@/domain/sync/steam'
import type * as Accounts from '@/server/auth/account'
import type { Db } from '@/server/db/client'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { mockSteamAnswer } from '@/server/mocks/steam-answer'
import { createSteamHandlers } from '@/server/mocks/steam'
import { readLink } from '@/server/sync/memory'
import { createTestAccount, createTestDatabase } from '@/test/database'
import { network } from '@/test/network'

import { finishSteamLink, LINK_STATE_COOKIE, startSteamLink } from './connect'

/**
 * "Sign in through Steam", end to end against the Steam double: the trip
 * there, the answer checked with Steam, the link saved for the account that
 * started it, and the answers that must link nothing.
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

beforeEach(async () => {
  network.use(...createSteamHandlers())
  state.db = await createTestDatabase()
  state.signedIn = await createTestAccount(state.db, 'player')
})

/** Starts a link; what Steam is asked to send back to, and the cookie that goes with it. */
const start = async (query = '') => {
  const response = await startSteamLink(
    new Request(`${ORIGIN}/api/v1/me/platforms/steam/connect?locale=en${query}`),
  )
  const location = new URL(response.headers.get('Location')!)
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0]!
  return { response, location, returnTo: location.searchParams.get('openid.return_to')!, cookie }
}

const comeBack = (returnTo: string, answer: URLSearchParams, cookie?: string) =>
  finishSteamLink(
    new Request(`${returnTo}&${answer.toString()}`, cookie ? { headers: { cookie } } : {}),
  )

describe('linking Steam', () => {
  it('sends the browser to Steam’s own sign-in, to come back here', async () => {
    const { response, location, returnTo, cookie } = await start()
    expect(response.status).toBe(303)
    expect(`${location.origin}${location.pathname}`).toBe(STEAM_OPENID)
    expect(location.searchParams.get('openid.mode')).toBe('checkid_setup')
    expect(location.searchParams.get('openid.realm')).toBe(ORIGIN)
    expect(returnTo).toMatch(/^http:\/\/localhost\/api\/v1\/me\/platforms\/steam\/return\?state=/)
    expect(cookie).toMatch(new RegExp(`^${LINK_STATE_COOKIE}=`))
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly')
  })

  it('links the account Steam vouched for, and returns to the account page', async () => {
    const { returnTo, cookie } = await start()
    const response = await comeBack(returnTo, mockSteamAnswer(returnTo), cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=linked#platforms`)
    expect((await readLink(state.db!, state.signedIn!, 'steam'))?.externalId).toBe(
      MOCK_STEAM.steamId,
    )
  })

  it('returns to the page that sets a new shelf up, when linking began there', async () => {
    const { returnTo, cookie } = await start('&back=start')
    expect(returnTo).toMatch(/&back=start$/)
    const linked = await comeBack(returnTo, mockSteamAnswer(returnTo), cookie)
    expect(linked.headers.get('Location')).toBe(`${ORIGIN}/en/account/start?steam=linked`)

    const again = await start('&back=start')
    const failed = await comeBack(again.returnTo, mockSteamAnswer(again.returnTo))
    expect(failed.headers.get('Location')).toBe(`${ORIGIN}/en/account/start?steam=failed`)
  })

  it('returns to the account page for a page it does not know', async () => {
    const { returnTo, cookie } = await start('&back=https://example.com')
    expect(returnTo).not.toContain('back=')
    const response = await comeBack(returnTo, mockSteamAnswer(returnTo), cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=linked#platforms`)
  })

  it('links nothing for an answer whose page to come back to was changed on the way', async () => {
    const { returnTo, cookie } = await start()
    const changed = `${returnTo}&back=start`
    const response = await comeBack(changed, mockSteamAnswer(returnTo), cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account/start?steam=failed`)
    expect(await readLink(state.db!, state.signedIn!, 'steam')).toBeUndefined()
  })

  it('sends someone signed out to sign in first, then back to the page it began on', async () => {
    state.signedIn = undefined
    const response = await startSteamLink(
      new Request(`${ORIGIN}/api/v1/me/platforms/steam/connect?locale=en&back=start`),
    )
    expect(response.headers.get('Location')).toBe(
      `${ORIGIN}/en/sign-in?from=${encodeURIComponent('/en/account/start')}`,
    )
  })

  it('links nothing when the answer comes back to a browser that did not ask', async () => {
    const { returnTo } = await start()
    const response = await comeBack(returnTo, mockSteamAnswer(returnTo))
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=failed#platforms`)
    expect(await readLink(state.db!, state.signedIn!, 'steam')).toBeUndefined()
  })

  it('links nothing for an answer Steam was asked to send somewhere else', async () => {
    const { returnTo, cookie } = await start()
    const elsewhere = returnTo.replace('locale=en', 'locale=pt-BR')
    const response = await comeBack(returnTo, mockSteamAnswer(elsewhere), cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=failed#platforms`)
    expect(await readLink(state.db!, state.signedIn!, 'steam')).toBeUndefined()
  })

  it('links nothing for an answer used once already', async () => {
    const { returnTo, cookie } = await start()
    const answer = mockSteamAnswer(returnTo)
    await comeBack(returnTo, answer, cookie)
    const stranger = await createTestAccount(state.db!, 'stranger')
    state.signedIn = stranger
    const response = await comeBack(returnTo, answer, cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=failed#platforms`)
    expect(await readLink(state.db!, stranger, 'steam')).toBeUndefined()
  })

  it('links nothing for an answer that is not a positive one from Steam', async () => {
    const { returnTo, cookie } = await start()
    const answer = mockSteamAnswer(returnTo)
    answer.set('openid.mode', 'cancel')
    const response = await comeBack(returnTo, answer, cookie)
    expect(response.headers.get('Location')).toBe(`${ORIGIN}/en/account?steam=failed#platforms`)
  })
})
