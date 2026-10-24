import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'

import { createNintendoHandlers, newNintendoMockState } from '@/server/mocks/nintendo'
import { MOCK_NINTENDO } from '@/server/mocks/owner'
import { createNintendo, NINTENDO_ACCOUNT_API } from '@/server/sync/nintendo'
import { network } from '@/test/network'

/** Nintendo's adapter on its own, against the double: what it does when Nintendo says less. */

let state: ReturnType<typeof newNintendoMockState>
const nintendo = createNintendo()

beforeEach(() => {
  state = newNintendoMockState()
  network.use(...createNintendoHandlers(state))
})

describe('the account a session is for', () => {
  it('is the id and nickname Nintendo gives', async () => {
    expect(await nintendo.account(MOCK_NINTENDO.sessionToken)).toEqual({
      id: MOCK_NINTENDO.accountId,
      nickname: MOCK_NINTENDO.nickname,
    })
  })

  it('is the one its token names when Nintendo will not say more', async () => {
    network.use(
      http.get(`${NINTENDO_ACCOUNT_API}/users/me`, () => new HttpResponse(null, { status: 403 })),
    )
    expect(await nintendo.account(MOCK_NINTENDO.sessionToken)).toEqual({
      id: MOCK_NINTENDO.accountId,
    })
  })
})

describe('the play history', () => {
  it('says Nintendo could not be read when it answers with an error', async () => {
    state.failWith = 503
    await expect(nintendo.playHistory(MOCK_NINTENDO.sessionToken)).rejects.toMatchObject({
      problem: 'unreachable',
    })
  })

  it('says the session ended when Nintendo will not give a token for it', async () => {
    await expect(nintendo.playHistory(MOCK_NINTENDO.endedSessionToken)).rejects.toMatchObject({
      problem: 'signed-out',
    })
  })
})
