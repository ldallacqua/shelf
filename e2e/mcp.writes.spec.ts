import { createHash, randomBytes } from 'node:crypto'

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'

/**
 * An assistant signing in as me, then changing the library through the
 * owner's MCP endpoint (architecture, section 16): OAuth with PKCE, the
 * assistant known by its Client ID Metadata Document, me saying yes on the
 * consent page. It changes the library, so it runs after the tests that
 * only read; and once, since the browser only signs in.
 */

test.use({ signedIn: true })
test.skip(
  ({ browserName, size }) => browserName !== 'chromium' || size !== 'desktop',
  'once is enough: the browser only says yes',
)
// One assistant, asked in turn: told no, then yes.
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:3300'
const RESOURCE = `${BASE}/api/mcp/owner`
/** The test doubles' assistant: see MOCK_ASSISTANT. */
const ASSISTANT = {
  clientId: 'https://assistant.example/shelf-tests/client.json',
  name: 'Test Assistant',
  redirectUri: 'http://127.0.0.1:47231/callback',
}
/** In the fixtures, on no shelf, related to nothing on one, and added by no other test. */
const GAME = { title: 'Alien: Isolation', igdbId: 4754, pc: 6 }

const base64url = (bytes: Buffer) => bytes.toString('base64url')

/**
 * An assistant's request for my yes: PKCE, its metadata document's address
 * as its id, the owner's endpoint as the resource. `ask`: show the consent
 * page even if I said yes before, as `prompt=consent` asks.
 */
const authorizeAddress = (ask: boolean) => {
  const verifier = base64url(randomBytes(32))
  const state = base64url(randomBytes(8))
  const address = new URL('/api/auth/oauth2/authorize', BASE)
  address.search = new URLSearchParams({
    response_type: 'code',
    client_id: ASSISTANT.clientId,
    redirect_uri: ASSISTANT.redirectUri,
    scope: 'openid offline_access',
    state,
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    resource: RESOURCE,
    ...(ask ? { prompt: 'consent' } : {}),
  }).toString()
  return { address: address.toString(), verifier, state }
}

/** Starts a sign-in in the browser, and catches where the consent page sends it back to. */
async function authorize(page: Page, ask: boolean) {
  const { address, verifier, state } = authorizeAddress(ask)

  // The assistant's own address on this machine: answered here, and read.
  let reached: (url: URL) => void = () => undefined
  const back = new Promise<URL>((resolve) => (reached = resolve))
  await page.unrouteAll()
  await page.route(`${new URL(ASSISTANT.redirectUri).origin}/**`, async (route) => {
    reached(new URL(route.request().url()))
    await route.fulfill({ contentType: 'text/plain', body: 'Back with the assistant.' })
  })
  await page.goto(address)
  return { verifier, state, back }
}

const consent = (page: Page) => page.getByRole('main')

test('saying no sends the assistant back with nothing', async ({ page }) => {
  const { state, back } = await authorize(page, true)
  await expect(page).toHaveURL(/\/en\/consent\?/)
  await expect(consent(page)).toContainText(`${ASSISTANT.name} asks to use your library as you.`)
  await expect(consent(page)).toContainText('It is from assistant.example.')
  await consent(page).getByRole('button', { name: 'Deny' }).click()

  const returned = await back
  expect(returned.searchParams.get('error')).toBe('access_denied')
  expect(returned.searchParams.get('state')).toBe(state)
  expect(returned.searchParams.get('code')).toBeNull()
})

test('saying yes gives the assistant a token, and with it the owner’s tools @smoke', async ({
  page,
  playwright,
}) => {
  // The assistant itself: no browser, and none of my cookies, which the
  // test's own contexts would otherwise carry.
  const request = await playwright.request.newContext({
    baseURL: BASE,
    storageState: { cookies: [], origins: [] },
  })
  const { verifier, state, back } = await authorize(page, true)
  await expect(consent(page)).toContainText('Stay signed in')
  await consent(page).getByRole('button', { name: 'Allow' }).click()
  const returned = await back
  expect(returned.searchParams.get('state')).toBe(state)
  expect(returned.searchParams.get('iss')).toBe(`${BASE}/api/auth`)
  const code = returned.searchParams.get('code')
  expect(code).toBeTruthy()

  // The assistant trades the code for tokens.
  const exchanged = await request.post('/api/auth/oauth2/token', {
    form: {
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: ASSISTANT.redirectUri,
      client_id: ASSISTANT.clientId,
      code_verifier: verifier,
      resource: RESOURCE,
    },
  })
  expect(exchanged.status(), await exchanged.text()).toBe(200)
  const tokens = (await exchanged.json()) as { access_token: string; refresh_token?: string }
  expect(tokens.refresh_token).toBeTruthy()

  const client = new Client(
    { name: ASSISTANT.name, version: '1' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  await client.connect(
    new StreamableHTTPClientTransport(new URL(RESOURCE), {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    }),
  )
  let slug: string | undefined
  try {
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'add_game',
      'get_game',
      'list_filter_values',
      'list_shelves',
      'search_igdb',
      'search_library',
      'set_status',
      'update_entry',
    ])

    const found = await client.callTool({ name: 'search_igdb', arguments: { q: GAME.title } })
    const result = (found.structuredContent as { results: { igdbId: number }[] }).results
    expect(result.map((each) => each.igdbId)).toContain(GAME.igdbId)

    const added = await client.callTool({
      name: 'add_game',
      arguments: {
        igdbId: GAME.igdbId,
        status: 'backlog',
        copies: [{ platform: GAME.pc, format: 'digital' }],
      },
    })
    expect(added.isError, JSON.stringify(added.content)).toBeFalsy()
    slug = (added.structuredContent as { slug: string }).slug

    const statused = await client.callTool({
      name: 'set_status',
      arguments: { id: slug, status: 'playing' },
    })
    expect(statused.isError).toBeFalsy()
    const updated = await client.callTool({
      name: 'update_entry',
      arguments: { id: slug, rating: 8, tags: ['From an assistant'] },
    })
    expect(updated.isError).toBeFalsy()

    // What anyone sees now.
    const game = (await (await request.get(`/api/v1/games/${slug}`)).json()) as {
      status: string
      rating: number
      tags: string[]
      owned: { platform: string; format: string }[]
    }
    expect(game).toMatchObject({
      status: 'playing',
      rating: 8,
      owned: [{ platform: 'pc', format: 'digital' }],
    })

    // A refusal comes back as the tool's error, not a crash.
    const nothing = await client.callTool({
      name: 'set_status',
      arguments: { id: 'not-a-game', status: 'playing' },
    })
    expect(nothing.isError).toBe(true)
  } finally {
    await client.close()
    if (slug) await page.request.delete(`/api/v1/entries/${slug}`)
  }

  // Asked again, I am not asked again: the yes is remembered, and the
  // server sends me straight back with a code. (Read from the redirect
  // itself: a browser follows a server's redirect past any test's route.)
  const again = await page.request.get(authorizeAddress(false).address, { maxRedirects: 0 })
  expect(again.status()).toBe(302)
  const second = new URL(again.headers().location ?? '', BASE)
  expect(second.origin + second.pathname).toBe(ASSISTANT.redirectUri)
  expect(second.searchParams.get('code')).toBeTruthy()

  // And a refresh token keeps it signed in.
  const refreshed = await request.post('/api/auth/oauth2/token', {
    form: {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token!,
      client_id: ASSISTANT.clientId,
      resource: RESOURCE,
    },
  })
  expect(refreshed.status(), await refreshed.text()).toBe(200)
  await request.dispose()
})
