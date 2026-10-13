import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { igdbNamedSchema } from '@/domain/igdb/schema'
import {
  createIgdbClient,
  IGDB_API,
  IgdbError,
  memoryTokenStore,
  TWITCH_TOKEN_URL,
  type IgdbClientOptions,
  type StoredToken,
} from '@/server/igdb/client'
import {
  createHandlers,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  newMockState,
} from '@/server/mocks/handlers'
import { loadFixtures } from '@/server/seed/fixtures'
import { network as server } from '@/test/network'

const state = newMockState()
const handlers = createHandlers(loadFixtures(), state)

beforeEach(() => server.use(...handlers))
afterEach(() => {
  state.tokensIssued = 0
  state.requests.length = 0
})

/**
 * A clock the test controls: waiting costs no real time. A sleeper wakes at
 * the moment it asked for, and sleepers that started together wake in order,
 * as they would on a real clock.
 */
const fakeClock = (start = 1_000_000_000_000) => {
  let time = start
  const sleeps: number[] = []
  return {
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms)
      const wake = time + ms
      await new Promise((resolve) => setTimeout(resolve, 0))
      time = Math.max(time, wake)
    },
    advance: (ms: number) => {
      time += ms
    },
    sleeps,
  }
}

const credentials = () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET })

const makeClient = (overrides: Partial<IgdbClientOptions> = {}) => {
  const clock = fakeClock()
  const warn = vi.fn()
  const client = createIgdbClient({
    credentials,
    tokens: memoryTokenStore(),
    now: clock.now,
    sleep: clock.sleep,
    warn,
    ...overrides,
  })
  return { client, clock, warn }
}

const GENRES = 'fields name,slug; limit 5;'
const genres = (client: ReturnType<typeof makeClient>['client']) =>
  client.query('genres', GENRES, igdbNamedSchema)

const DAY = 24 * 60 * 60 * 1000

describe('the Twitch token', () => {
  it('is asked for once, however many requests start together', async () => {
    const { client } = makeClient()
    const results = await Promise.all(Array.from({ length: 6 }, () => genres(client)))
    expect(results.every((list) => list.length === 5)).toBe(true)
    expect(state.tokensIssued).toBe(1)
  })

  it('is stored, so a server that has just started does not ask again', async () => {
    const tokens = memoryTokenStore()
    await genres(makeClient({ tokens }).client)
    await genres(makeClient({ tokens }).client)
    expect(state.tokensIssued).toBe(1)
    expect((await tokens.read())?.accessToken).toBe('mock-token-1')
  })

  it('is replaced a day before it expires', async () => {
    const { client, clock } = makeClient()
    await genres(client)
    const lifetime = 5_000_000 * 1000
    clock.advance(lifetime - 2 * DAY)
    await genres(client)
    expect(state.tokensIssued).toBe(1)
    clock.advance(DAY + 1)
    await genres(client)
    expect(state.tokensIssued).toBe(2)
  })

  it('is replaced, once, when IGDB refuses the stored one', async () => {
    const stale: StoredToken = { accessToken: 'revoked', expiresAt: Date.now() * 2 }
    const { client } = makeClient({ tokens: memoryTokenStore(stale) })
    const [first, second] = await Promise.all([genres(client), genres(client)])
    expect(first).toHaveLength(5)
    expect(second).toHaveLength(5)
    expect(state.tokensIssued).toBe(1)
  })

  it('gives up as unauthorized when a fresh token is refused too', async () => {
    server.use(http.post(`${IGDB_API}/genres`, () => new HttpResponse(null, { status: 401 })))
    const { client } = makeClient()
    await expect(genres(client)).rejects.toMatchObject({ code: 'unauthorized', status: 401 })
    expect(state.tokensIssued).toBe(2)
  })

  it('reports refused credentials without repeating them', async () => {
    const secret = 'a-very-secret-value'
    const { client } = makeClient({
      credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: secret }),
    })
    const error = await genres(client).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(IgdbError)
    expect(error).toMatchObject({ code: 'unauthorized' })
    expect(JSON.stringify(error) + String((error as Error).message)).not.toContain(secret)
  })

  it('sends the secret in the body, never in the address', async () => {
    let address = ''
    let body = ''
    server.use(
      http.post(TWITCH_TOKEN_URL, async ({ request }) => {
        address = request.url
        body = await request.text()
        return HttpResponse.json({ access_token: 't', expires_in: 3600, token_type: 'bearer' })
      }),
      http.post(`${IGDB_API}/genres`, () => HttpResponse.json([])),
    )
    await genres(makeClient().client)
    expect(address).toBe(TWITCH_TOKEN_URL)
    expect(body).toContain(`client_secret=${MOCK_CLIENT_SECRET}`)
  })

  it('says Twitch is unavailable when it cannot be reached', async () => {
    server.use(http.post(TWITCH_TOKEN_URL, () => HttpResponse.error()))
    await expect(genres(makeClient().client)).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('the rate limit', () => {
  it('starts at most four requests a second', async () => {
    const clock = fakeClock()
    const starts: number[] = []
    const client = createIgdbClient({
      credentials,
      tokens: memoryTokenStore({ accessToken: 'unused', expiresAt: clock.now() * 2 }),
      now: clock.now,
      sleep: clock.sleep,
      // Records the moment each request leaves, then answers without a network.
      fetch: async () => {
        starts.push(clock.now())
        return Response.json([])
      },
    })
    await Promise.all(Array.from({ length: 9 }, () => genres(client)))
    starts.sort((a, b) => a - b)
    for (let i = 1; i < starts.length; i += 1) {
      expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(250)
    }
    expect((starts.at(-1) ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(2000)
  })

  it('never has more than four requests open at once', async () => {
    // Slots come quickly here, so only the open-request limit holds requests back.
    const { client } = makeClient({ perSecond: 10_000, maxInFlight: 4 })
    let open = 0
    let most = 0
    server.use(
      http.post(`${IGDB_API}/genres`, async () => {
        open += 1
        most = Math.max(most, open)
        await delay(15)
        open -= 1
        return HttpResponse.json([])
      }),
    )
    await Promise.all(Array.from({ length: 12 }, () => genres(client)))
    expect(most).toBe(4)
  })

  it('waits as long as IGDB asks, then tries again', async () => {
    const { client, clock } = makeClient()
    server.use(
      http.post(
        `${IGDB_API}/genres`,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '2' } }),
        { once: true },
      ),
    )
    expect(await genres(client)).toHaveLength(5)
    expect(clock.sleeps).toContain(2000)
  })

  it('gives up as rate-limited after two retries', async () => {
    let calls = 0
    server.use(
      http.post(`${IGDB_API}/genres`, () => {
        calls += 1
        return new HttpResponse(null, { status: 429 })
      }),
    )
    await expect(genres(makeClient().client)).rejects.toMatchObject({ code: 'rate-limited' })
    expect(calls).toBe(3)
  })
})

describe('failures', () => {
  it('retries a server error and recovers', async () => {
    server.use(
      http.post(`${IGDB_API}/genres`, () => new HttpResponse(null, { status: 503 }), {
        once: true,
      }),
    )
    expect(await genres(makeClient().client)).toHaveLength(5)
  })

  it('says IGDB is unavailable when it keeps failing', async () => {
    server.use(http.post(`${IGDB_API}/genres`, () => new HttpResponse(null, { status: 500 })))
    await expect(genres(makeClient().client)).rejects.toMatchObject({
      code: 'unavailable',
      status: 500,
    })
  })

  it('says IGDB is unavailable when it cannot be reached', async () => {
    server.use(http.post(`${IGDB_API}/genres`, () => HttpResponse.error()))
    await expect(genres(makeClient().client)).rejects.toMatchObject({ code: 'unavailable' })
  })

  it('does not retry a query IGDB rejects', async () => {
    const { client } = makeClient()
    await expect(client.query('genres', 'nonsense here;', igdbNamedSchema)).rejects.toMatchObject({
      code: 'bad-query',
      status: 400,
    })
    expect(state.requests).toHaveLength(1)
  })

  it('refuses an address the test double does not know, instead of reaching the internet', async () => {
    const { client } = makeClient()
    await expect(client.query('no_such_endpoint', GENRES, igdbNamedSchema)).rejects.toBeInstanceOf(
      IgdbError,
    )
  })
})

describe('checking what comes back', () => {
  it('skips a record that does not fit, and says which without quoting it', async () => {
    server.use(
      http.post(`${IGDB_API}/genres`, () =>
        HttpResponse.json([
          { id: 1, name: 'Adventure', slug: 'adventure' },
          { id: 2, slug: 'private-looking-content' },
          { id: 3, name: 'Puzzle', slug: 'puzzle' },
        ]),
      ),
    )
    const { client, warn } = makeClient()
    expect((await genres(client)).map((genre) => genre.id)).toEqual([1, 3])
    expect(warn).toHaveBeenCalledTimes(1)
    const message = String(warn.mock.calls[0]?.[0])
    expect(message).toContain('id 2')
    expect(message).toContain('name')
    expect(message).not.toContain('private-looking-content')
  })

  it('refuses an answer that is not a list', async () => {
    server.use(http.post(`${IGDB_API}/genres`, () => HttpResponse.json({ oops: true })))
    await expect(genres(makeClient().client)).rejects.toMatchObject({ code: 'bad-response' })
  })

  it('refuses an answer that is not JSON', async () => {
    server.use(http.post(`${IGDB_API}/genres`, () => HttpResponse.text('<html>maintenance</html>')))
    await expect(genres(makeClient().client)).rejects.toMatchObject({ code: 'bad-response' })
  })
})

describe('multi', () => {
  const id = z.object({ id: z.number() })

  it('answers several queries in one request, in the order asked', async () => {
    const { client } = makeClient()
    const [skyrim, tombRaider, nothing] = await client.multi(
      [
        { endpoint: 'games', body: 'fields name; where id = 472;' },
        { endpoint: 'games', body: 'fields name; where id = 37777;' },
        { endpoint: 'games', body: 'fields name; where id = 999999999;' },
      ],
      id,
    )
    expect(skyrim).toEqual([{ id: 472 }])
    expect(tombRaider).toEqual([{ id: 37777 }])
    expect(nothing).toEqual([])
    expect(state.requests).toHaveLength(1)
    expect(state.requests[0]?.endpoint).toBe('multiquery')
  })

  it('refuses more than IGDB’s ten at a time', async () => {
    const eleven = Array.from({ length: 11 }, () => ({ endpoint: 'games', body: 'fields name;' }))
    await expect(makeClient().client.multi(eleven, id)).rejects.toThrow(/at most 10/)
  })

  it('sends nothing for no queries', async () => {
    expect(await makeClient().client.multi([], id)).toEqual([])
    expect(state.requests).toHaveLength(0)
  })
})
