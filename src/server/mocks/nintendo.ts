import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { http, HttpResponse } from 'msw'

import { NINTENDO_ACCOUNTS, NINTENDO_CLIENT_ID } from '@/domain/sync/nintendo'
import { MOCK_NINTENDO } from '@/server/mocks/owner'
import { NINTENDO_ACCOUNT_API, NINTENDO_STORE_API } from '@/server/sync/nintendo'

/**
 * A test double for Nintendo, answering as Nintendo answers: the made-up
 * code becomes the made-up session, the session a token, and the token the
 * made-up account and its play history from `fixtures/nintendo/`. Anything
 * else is refused as Nintendo refuses it, so a test can never be talking to
 * the real Nintendo.
 */

export type NintendoMockState = {
  /** The questions asked, by path. */
  asked: string[]
  /** Codes already exchanged: Nintendo takes each once. */
  used: Set<string>
  /** When set, the play history answers with this status instead. */
  failWith?: number
}

export const newNintendoMockState = (): NintendoMockState => ({ asked: [], used: new Set() })

/** A token shaped as Nintendo's id tokens are, naming the made-up account. */
const ID_TOKEN = [
  'eyJhbGciOiJub25lIn0',
  Buffer.from(JSON.stringify({ sub: MOCK_NINTENDO.accountId })).toString('base64url'),
  'test-doubles-only',
].join('.')

const read = (file: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      /* turbopackIgnore: true */ join(process.cwd(), 'fixtures', 'nintendo', file),
      'utf8',
    ),
  ) as Record<string, unknown>

const refused = (error: string, status = 400) => HttpResponse.json({ error }, { status })

export const createNintendoHandlers = (state: NintendoMockState = newNintendoMockState()) => {
  const history = read('play-history.json')
  const bearer = (request: Request) =>
    request.headers.get('authorization') === `Bearer ${MOCK_NINTENDO.accessToken}`

  return [
    http.post(`${NINTENDO_ACCOUNTS}/api/session_token`, async ({ request }) => {
      state.asked.push('session_token')
      const form = new URLSearchParams(await request.text())
      const code = form.get('session_token_code') ?? ''
      if (form.get('client_id') !== NINTENDO_CLIENT_ID) return refused('invalid_client')
      if (code !== MOCK_NINTENDO.code || !form.get('session_token_code_verifier')) {
        return refused('invalid_request')
      }
      if (state.used.has(code)) return refused('invalid_grant')
      state.used.add(code)
      return HttpResponse.json({ session_token: MOCK_NINTENDO.sessionToken, code: 'test' })
    }),

    http.post(`${NINTENDO_ACCOUNTS}/api/token`, async ({ request }) => {
      state.asked.push('token')
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
      if (body.client_id !== NINTENDO_CLIENT_ID) return refused('invalid_client')
      if (body.session_token !== MOCK_NINTENDO.sessionToken) return refused('invalid_grant')
      return HttpResponse.json({
        access_token: MOCK_NINTENDO.accessToken,
        id_token: ID_TOKEN,
        expires_in: 900,
        token_type: 'Bearer',
        scope: ['openid', 'user'],
      })
    }),

    http.get(`${NINTENDO_ACCOUNT_API}/users/me`, ({ request }) => {
      state.asked.push('users/me')
      if (!bearer(request)) return refused('invalid_token', 401)
      // Nintendo says much more about an account; Shelf reads only these two.
      return HttpResponse.json({
        id: MOCK_NINTENDO.accountId,
        nickname: MOCK_NINTENDO.nickname,
        country: 'BR',
        language: 'pt-BR',
      })
    }),

    http.get(`${NINTENDO_STORE_API}/users/me/play_histories`, ({ request }) => {
      state.asked.push('play_histories')
      if (!bearer(request)) return refused('invalid_token', 401)
      if (!request.headers.get('gentry-locale')) return refused('locale_required')
      if (state.failWith) return new HttpResponse(null, { status: state.failWith })
      return HttpResponse.json(history)
    }),
  ]
}
