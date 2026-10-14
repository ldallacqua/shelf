import { http, HttpResponse } from 'msw'

import { IGDB_API, TWITCH_TOKEN_URL } from '@/server/igdb/client'
import { parseMultiQuery, parseQuery, QueryError, runQuery } from '@/server/mocks/apicalypse'
import type { Fixtures } from '@/server/seed/fixtures'

/**
 * Test doubles for Twitch and IGDB, answering from `fixtures/` the way the
 * real services answer: a token first, then queries that need it. Any other
 * address on those hosts is refused loudly, so a test can never be quietly
 * talking to something that is not there.
 */

export const MOCK_CLIENT_ID = 'mock-client-id'
export const MOCK_CLIENT_SECRET = 'mock-client-secret'

type Row = Record<string, unknown>

const tables = (fixtures: Fixtures): Record<string, Row[]> => {
  const games: Row[] = [...fixtures.games.values()]
  const known = new Set(games.map((game) => game.id))
  // Originals of ports and editions exist in IGDB too, with the few fields the fixtures kept.
  for (const ancestor of fixtures.ancestors.values()) {
    if (!known.has(ancestor.id)) games.push(ancestor)
  }
  return {
    games,
    game_time_to_beats: [...fixtures.timeToBeat.values()].map((row, index) => ({
      id: index + 1,
      ...row,
    })),
    platforms: fixtures.platforms,
    genres: fixtures.names.genre,
    themes: fixtures.names.theme,
    game_modes: fixtures.names.mode,
    player_perspectives: fixtures.names.perspective,
    franchises: fixtures.names.franchise,
    collections: fixtures.names.series,
    keywords: fixtures.names.keyword,
  }
}

export type MockState = {
  /** Tokens issued so far. A test can read this to see how often Twitch was asked. */
  tokensIssued: number
  /** Every IGDB request: the endpoint and the query text. */
  requests: { endpoint: string; body: string }[]
}

export const createHandlers = (fixtures: Fixtures, state: MockState = newMockState()) => {
  const data = tables(fixtures)
  const valid = new Set<string>()

  const answer = (endpoint: string, body: string): Row[] => {
    const rows = data[endpoint]
    if (!rows) throw new QueryError(`No such endpoint: ${endpoint}`)
    return runQuery(rows, parseQuery(body))
  }

  return [
    http.post(TWITCH_TOKEN_URL, async ({ request }) => {
      const form = new URLSearchParams(await request.text())
      const granted =
        form.get('client_id') === MOCK_CLIENT_ID &&
        form.get('client_secret') === MOCK_CLIENT_SECRET &&
        form.get('grant_type') === 'client_credentials'
      if (!granted) {
        return HttpResponse.json({ status: 400, message: 'invalid client' }, { status: 400 })
      }
      state.tokensIssued += 1
      const token = `mock-token-${state.tokensIssued}`
      valid.add(token)
      return HttpResponse.json({
        access_token: token,
        expires_in: 5_000_000,
        token_type: 'bearer',
      })
    }),

    http.post(`${IGDB_API}/:endpoint`, async ({ request, params }) => {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      if (request.headers.get('client-id') !== MOCK_CLIENT_ID || !valid.has(token)) {
        return HttpResponse.json({ message: 'Authorization Failure.' }, { status: 401 })
      }
      const endpoint = String(params.endpoint)
      const body = await request.text()
      state.requests.push({ endpoint, body })
      try {
        if (endpoint === 'multiquery') {
          return HttpResponse.json(
            parseMultiQuery(body).map((block) => ({
              name: block.name,
              result: answer(block.endpoint, block.body),
            })),
          )
        }
        return HttpResponse.json(answer(endpoint, body))
      } catch (error) {
        if (error instanceof QueryError) {
          return HttpResponse.json([{ title: 'Syntax Error', status: 400, cause: error.message }], {
            status: 400,
          })
        }
        throw error
      }
    }),

    // Anything else on these hosts has no double. Say so; never let it through.
    http.all('https://api.igdb.com/*', () =>
      HttpResponse.json({ message: 'No test double for this IGDB address' }, { status: 501 }),
    ),
    http.all('https://id.twitch.tv/*', () =>
      HttpResponse.json({ message: 'No test double for this Twitch address' }, { status: 501 }),
    ),
  ]
}

export const newMockState = (): MockState => ({ tokensIssued: 0, requests: [] })
