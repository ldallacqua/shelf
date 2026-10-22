import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

import { expect, test } from './fixtures'

/**
 * The MCP endpoints (architecture, section 16), as an assistant meets them,
 * through the official client. They answer the same to every browser, so
 * they run once.
 */

test.skip(
  ({ browserName, size }) => browserName !== 'chromium' || size !== 'desktop',
  'it answers the same to every browser',
)

const BASE = 'http://localhost:3300'

type Library = { stats: { games: number }; games: { slug: string; status: string }[] }

const connect = async (path: string, era: 'modern' | 'legacy', token?: string) => {
  const client = new Client(
    { name: 'shelf-tests', version: '1' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  )
  await client.connect(
    new StreamableHTTPClientTransport(new URL(path, BASE), {
      ...(token ? { requestInit: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    }),
  )
  return client
}

for (const era of ['modern', 'legacy'] as const) {
  test(`anyone can read the library through /api/mcp, on the ${era} protocol`, async ({
    request,
  }) => {
    const client = await connect('/api/mcp', era)
    try {
      const { tools } = await client.listTools()
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        'get_game',
        'list_filter_values',
        'list_shelves',
        'search_library',
      ])
      expect(tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(true)

      // The same answers as the API, for the shelf its handle names (ADR 004).
      const shelf = 'sample'
      const found = await client.callTool({
        name: 'search_library',
        arguments: { shelf, q: 'status:playing', limit: 3 },
      })
      const api = (await (
        await request.get('/api/v1/u/sample/library?q=status:playing&limit=3')
      ).json()) as Library
      expect((found.structuredContent as Library).stats).toEqual(api.stats)
      expect((found.structuredContent as Library).games.map((game) => game.slug)).toEqual(
        api.games.map((game) => game.slug),
      )

      const game = await client.callTool({
        name: 'get_game',
        arguments: { shelf, slug: 'bloodborne' },
      })
      expect(game.structuredContent).toMatchObject({ slug: 'bloodborne', title: 'Bloodborne' })
      const missing = await client.callTool({
        name: 'get_game',
        arguments: { shelf, slug: 'not-a-game' },
      })
      expect(missing.isError).toBe(true)

      const values = await client.callTool({ name: 'list_filter_values', arguments: { shelf } })
      expect(Object.keys((values.structuredContent as { facets: object }).facets)).toContain(
        'genre',
      )
      const shelves = await client.callTool({ name: 'list_shelves', arguments: { shelf } })
      expect((shelves.structuredContent as { shelves: unknown[] }).shelves.length).toBeGreaterThan(
        0,
      )

      // A shelf no account has, or none named: said, not answered.
      const nobody = await client.callTool({
        name: 'search_library',
        arguments: { shelf: 'no-such-shelf', q: '' },
      })
      expect(nobody.isError).toBe(true)
    } finally {
      await client.close()
    }
  })
}

test('the owner’s endpoint turns away an assistant with no token, and says where to sign in', async ({
  request,
}) => {
  const turnedAway = await request.post('/api/mcp/owner', {
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  expect(turnedAway.status()).toBe(401)
  const challenge = turnedAway.headers()['www-authenticate'] ?? ''
  const metadata = /resource_metadata="([^"]+)"/.exec(challenge)?.[1]
  expect(metadata).toBe(`${BASE}/.well-known/oauth-protected-resource/api/mcp/owner`)

  // Where to sign in, as RFC 9728 and RFC 8414 put it.
  const resource = (await (await request.get(metadata!)).json()) as {
    resource: string
    authorization_servers: string[]
  }
  expect(resource).toMatchObject({
    resource: `${BASE}/api/mcp/owner`,
    authorization_servers: [`${BASE}/api/auth`],
  })
  const server = (await (
    await request.get('/.well-known/oauth-authorization-server/api/auth')
  ).json()) as Record<string, unknown>
  expect(server).toMatchObject({
    issuer: `${BASE}/api/auth`,
    authorization_endpoint: `${BASE}/api/auth/oauth2/authorize`,
    token_endpoint: `${BASE}/api/auth/oauth2/token`,
    client_id_metadata_document_supported: true,
    code_challenge_methods_supported: ['S256'],
  })
})

test('a made-up token opens nothing', async ({ request }) => {
  const made = await request.post('/api/mcp/owner', {
    headers: { Authorization: 'Bearer eyJhbGciOiJub25lIn0.eyJzdWIiOiJ4In0.' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
  })
  expect(made.status()).toBe(401)
})

test.describe('signed in on the site', () => {
  test.use({ signedIn: true })

  test('is not signed in here: the endpoint takes only its own tokens', async ({ page }) => {
    const withCookie = await page.request.post('/api/mcp/owner', {
      data: { jsonrpc: '2.0', id: 1, method: 'tools/list' },
    })
    expect(withCookie.status()).toBe(401)
  })
})
