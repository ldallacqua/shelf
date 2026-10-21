import { http, HttpResponse } from 'msw'

import { IMAGE_HOST } from '@/domain/igdb/images'
import { IGDB_API, TWITCH_TOKEN_URL } from '@/server/igdb/client'
import { parseMultiQuery, parseQuery, QueryError, runQuery } from '@/server/mocks/apicalypse'
import type { Fixtures } from '@/server/seed/fixtures'

/**
 * Test doubles for Twitch, IGDB and GitHub, answering the way the real
 * services answer: for IGDB, from `fixtures/`, a token first and then
 * queries that need it; for GitHub, two made-up accounts, the owner and
 * someone else. Any other address on those hosts is refused loudly, so a
 * test can never be quietly talking to something that is not there.
 */

export const MOCK_CLIENT_ID = 'mock-client-id'
export const MOCK_CLIENT_SECRET = 'mock-client-secret'

export const MOCK_GITHUB_CLIENT_ID = 'mock-github-client-id'
export const MOCK_GITHUB_CLIENT_SECRET = 'mock-github-client-secret'

/**
 * The GitHub accounts the doubles know, by the code GitHub would hand back.
 * A browser test sends its trip to GitHub straight back with one of these
 * codes, and the server then asks GitHub about it, as it would for real.
 */
export const MOCK_GITHUB_ACCOUNTS = {
  owner: { id: 9_000_001, login: 'shelf-owner', name: 'Shelf Owner' },
  stranger: { id: 9_000_002, login: 'someone-else', name: 'Someone Else' },
} as const

export type MockGithubAccount = keyof typeof MOCK_GITHUB_ACCOUNTS

/**
 * An assistant that signs in to the owner's MCP endpoint, known, as MCP
 * assistants are, by the address of its Client ID Metadata Document. It
 * sends the owner back to a loopback address, as an assistant on a desktop
 * does; a browser test catches that address.
 */
export const MOCK_ASSISTANT = {
  clientId: 'https://assistant.example/shelf-tests/client.json',
  name: 'Test Assistant',
  redirectUri: 'http://127.0.0.1:47231/callback',
} as const

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

    // GitHub: a code for an access token, then the profile and its emails.
    http.post('https://github.com/login/oauth/access_token', async ({ request }) => {
      const form = new URLSearchParams(await request.text())
      const code = form.get('code') ?? ''
      const known = code in MOCK_GITHUB_ACCOUNTS
      const client =
        form.get('client_id') === MOCK_GITHUB_CLIENT_ID &&
        form.get('client_secret') === MOCK_GITHUB_CLIENT_SECRET
      if (!known || !client) {
        return HttpResponse.json({ error: 'bad_verification_code' })
      }
      return HttpResponse.json({
        access_token: `mock-github-token-${code}`,
        token_type: 'bearer',
        scope: 'read:user,user:email',
      })
    }),
    http.get('https://api.github.com/user', ({ request }) => {
      const account = githubAccount(request)
      if (!account) return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
      return HttpResponse.json({
        id: account.id,
        login: account.login,
        name: account.name,
        email: null,
        avatar_url: `https://avatars.githubusercontent.com/u/${account.id}`,
      })
    }),
    http.get('https://api.github.com/user/emails', ({ request }) => {
      const account = githubAccount(request)
      if (!account) return HttpResponse.json({ message: 'Bad credentials' }, { status: 401 })
      return HttpResponse.json([
        { email: `${account.login}@example.com`, primary: true, verified: true },
      ])
    }),

    // A cover, when a game is added and its colors are read: a flat color
    // made from its id. The repository holds no cover art.
    http.get(`${IMAGE_HOST}/*`, ({ request }) => {
      const id = new URL(request.url).pathname.split('/').pop() ?? ''
      let hue = 0
      for (const char of id) hue = (hue * 31 + char.charCodeAt(0)) % 360
      return new HttpResponse(
        `<svg xmlns="http://www.w3.org/2000/svg" width="90" height="128"><rect width="90" height="128" fill="hsl(${hue} 55% 38%)"/><rect width="90" height="44" fill="hsl(${(hue + 40) % 360} 60% 55%)"/></svg>`,
        { headers: { 'Content-Type': 'image/svg+xml' } },
      )
    }),

    // The test assistant's Client ID Metadata Document.
    http.get(MOCK_ASSISTANT.clientId, () =>
      HttpResponse.json(
        {
          client_id: MOCK_ASSISTANT.clientId,
          client_name: MOCK_ASSISTANT.name,
          redirect_uris: [MOCK_ASSISTANT.redirectUri],
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: 'none',
        },
        { headers: { 'Cache-Control': 'max-age=3600' } },
      ),
    ),

    // Anything else on these hosts has no double. Say so; never let it through.
    http.all('https://github.com/*', () =>
      HttpResponse.json({ message: 'No test double for this GitHub address' }, { status: 501 }),
    ),
    http.all('https://api.github.com/*', () =>
      HttpResponse.json({ message: 'No test double for this GitHub address' }, { status: 501 }),
    ),
    http.all('https://api.igdb.com/*', () =>
      HttpResponse.json({ message: 'No test double for this IGDB address' }, { status: 501 }),
    ),
    http.all('https://id.twitch.tv/*', () =>
      HttpResponse.json({ message: 'No test double for this Twitch address' }, { status: 501 }),
    ),
  ]
}

const githubAccount = (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const code = token.replace(/^mock-github-token-/, '')
  return code in MOCK_GITHUB_ACCOUNTS ? MOCK_GITHUB_ACCOUNTS[code as MockGithubAccount] : undefined
}

export const newMockState = (): MockState => ({ tokensIssued: 0, requests: [] })
