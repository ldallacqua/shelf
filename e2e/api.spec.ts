import { expect, test } from './fixtures'

/**
 * The public API (spec 7, docs/api.md): read-only JSON under /api/v1, open
 * to any site, described by its own OpenAPI document. It answers the same
 * to every browser, so it is checked once, in one project.
 */

type Game = { title: string; rating: number | null; status: string; genres: string[] }
type Library = {
  query: { q: string; sort: string; group: string; seed: string }
  problems: { text: string; reason: string; from: number; to: number }[]
  stats: { games: number }
  shelves: { key: string; count: number }[]
  games: Game[]
  next: string | null
}

test.describe('the public API', () => {
  test.skip(
    ({ browserName, size }) => browserName !== 'chromium' || size !== 'desktop',
    'it answers the same to every browser',
  )

  test('GET /library filters, sorts and pages, in the filter language @smoke', async ({
    request,
  }) => {
    const answer = await request.get('/api/v1/library?q=genre:rpg&sort=-rating&group=none&limit=5')
    expect(answer.status()).toBe(200)
    expect(answer.headers()['content-type']).toContain('application/json')
    expect(answer.headers()['access-control-allow-origin']).toBe('*')

    const first = (await answer.json()) as Library
    expect(first.query).toMatchObject({ q: 'genre:rpg', sort: '-rating', group: 'none' })
    expect(first.stats.games).toBe(86)
    expect(first.shelves).toEqual([{ key: 'all', count: 86 }])
    expect(first.games).toHaveLength(5)
    expect(first.games.every((game) => game.genres.includes('rpg'))).toBe(true)
    const ratings = first.games.map((game) => game.rating ?? 0)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    expect(first.next).not.toBeNull()

    const second = (await (
      await request.get(
        `/api/v1/library?q=genre:rpg&sort=-rating&group=none&limit=5&cursor=${first.next}`,
      )
    ).json()) as Library
    expect(second.games).toHaveLength(5)
    const titles = new Set(first.games.map((game) => game.title))
    expect(second.games.some((game) => titles.has(game.title))).toBe(false)
  })

  test('says which parts of a filter it could not understand, and answers the rest', async ({
    request,
  }) => {
    const answer = (await (
      await request.get(`/api/v1/library?q=${encodeURIComponent('halo:3 zelda')}`)
    ).json()) as Library
    expect(answer.problems).toEqual([{ text: 'halo:3', reason: 'unknown-key', from: 0, to: 6 }])
    expect(answer.stats.games).toBe(9)
  })

  test('takes a bad parameter as its default, and a limit within bounds', async ({ request }) => {
    const answer = await request.get('/api/v1/library?group=cube&limit=100000')
    expect(answer.status()).toBe(200)
    const body = (await answer.json()) as Library
    expect(body.query.group).toBe('platform')
    expect(body.games.length).toBeLessThanOrEqual(200)
  })

  test('GET /library/facets counts each value given the rest of the filter', async ({
    request,
  }) => {
    const answer = (await (await request.get('/api/v1/library/facets?q=genre:rpg')).json()) as {
      total: number
      facets: Record<string, { value: string; count: number }[]>
      ranges: Record<string, { min: number; max: number } | null>
    }
    expect(answer.total).toBe(86)
    // Statuses split the matching games between them.
    const statuses = answer.facets.status!.reduce((sum, value) => sum + value.count, 0)
    expect(statuses).toBe(86)
    // A genre's own count leaves the genre condition out: what picking it instead would give.
    expect(answer.facets.genre!.find((value) => value.value === 'rpg')?.count).toBe(86)
    expect(answer.facets.genre!.find((value) => value.value === 'strategy')?.count).toBe(22)
    // Keywords are thousands: they have a file of their own.
    expect(answer.facets.keyword).toBeUndefined()
    expect(answer.ranges.rating).toMatchObject({ min: expect.any(Number), max: 10 })
  })

  test('GET /shelves lists the smart shelves; one that is not there is a 404', async ({
    request,
  }) => {
    const list = (await (await request.get('/api/v1/shelves')).json()) as {
      shelves: { slug: string; query: string; path: string }[]
    }
    expect(list.shelves).toContainEqual(
      expect.objectContaining({
        slug: 'short-ones',
        query: 'status:backlog length:<10',
        path: '/shelves/short-ones',
      }),
    )

    const one = await request.get('/api/v1/shelves/short-ones')
    expect(one.status()).toBe(200)
    expect(await one.json()).toMatchObject({ name: 'Short ones', sort: 'length', group: 'none' })

    const missing = await request.get('/api/v1/shelves/not-a-shelf')
    expect(missing.status()).toBe(404)
    expect(await missing.json()).toMatchObject({ error: { code: 'not-found' } })
  })

  test('GET /games/{slug} answers one game, with what its page shows a visitor', async ({
    request,
  }) => {
    const answer = await request.get('/api/v1/games/bloodborne')
    expect(answer.status()).toBe(200)
    expect(answer.headers()['access-control-allow-origin']).toBe('*')
    const game = await answer.json()
    expect(game).toMatchObject({
      slug: 'bloodborne',
      title: 'Bloodborne',
      releases: [{ platform: 'ps4', name: 'PlayStation 4', date: '2015-03-24' }],
    })
    expect(game.screenshots.length).toBeGreaterThan(0)

    const missing = await request.get('/api/v1/games/not-a-game')
    expect(missing.status()).toBe(404)
    expect(await missing.json()).toEqual({
      error: { code: 'not-found', message: 'There is no game called not-a-game' },
    })
  })

  test('describes itself in OpenAPI 3.1', async ({ request }) => {
    const document = (await (await request.get('/api/v1/openapi.json')).json()) as {
      openapi: string
      paths: Record<string, unknown>
      components: { schemas: Record<string, unknown> }
    }
    expect(document.openapi).toMatch(/^3\.1\./)
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/library',
        '/library/facets',
        '/games/{slug}',
        '/igdb/search',
        '/igdb/match',
        '/additions',
        '/additions/undo',
        '/entries',
        '/entries/{id}',
        '/entries/{id}/copies',
        '/entries/{id}/copies/{copy}',
        '/removed/{undo}',
        '/shelves',
        '/shelves/{slug}',
      ]),
    )
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining(['Game', 'GamePage', 'Library', 'Facets', 'SmartShelf', 'Error']),
    )
  })
})

/** Any id: the owner is asked for before anything is looked up. */
const ID = '00000000-0000-4000-a000-000000000000'

test.describe('the API’s writes, without the owner’s session', () => {
  test.skip(
    ({ browserName, size }) => browserName !== 'chromium' || size !== 'desktop',
    'it answers the same to every browser',
  )

  const writes = [
    { method: 'GET', path: '/api/v1/igdb/search?q=hades' },
    { method: 'POST', path: '/api/v1/igdb/match', data: { lines: ['Hades', 'Celeste'] } },
    { method: 'POST', path: '/api/v1/entries', data: { igdbId: 231, status: 'backlog' } },
    { method: 'POST', path: '/api/v1/additions', data: { games: [{ igdbId: 231 }] } },
    {
      method: 'POST',
      path: '/api/v1/additions/undo',
      data: {
        undo: [{ entryId: ID, gameId: ID, newEntry: true, newVersion: true, copyIds: [] }],
      },
    },
    // The owner's own read: private notes are in it.
    { method: 'GET', path: '/api/v1/entries/bloodborne' },
    { method: 'PATCH', path: '/api/v1/entries/bloodborne', data: { status: 'dropped' } },
    { method: 'DELETE', path: '/api/v1/entries/bloodborne' },
    {
      method: 'POST',
      path: '/api/v1/entries/bloodborne/copies',
      data: { platform: 48, format: 'digital' },
    },
    {
      method: 'PATCH',
      path: `/api/v1/entries/bloodborne/copies/${ID}`,
      data: { format: 'digital' },
    },
    { method: 'DELETE', path: `/api/v1/entries/bloodborne/copies/${ID}` },
    { method: 'POST', path: `/api/v1/removed/${ID}` },
    { method: 'PUT', path: '/api/v1/shelves/short-ones', data: { name: 'Mine now' } },
    { method: 'DELETE', path: '/api/v1/shelves/short-ones' },
  ] as const

  for (const write of writes) {
    test(`${write.method} ${write.path.split('?')[0]} is refused, and changes nothing`, async ({
      request,
    }) => {
      const version = async () =>
        new URL(
          (await request.get('/api/v1/library/snapshot/0', { maxRedirects: 0 })).headers()
            .location ?? '',
          'http://x',
        ).pathname
      const before = await version()
      for (const cookie of [undefined, 'shelf.session_token=made-up.value']) {
        const response = await request.fetch(write.path, {
          method: write.method,
          headers: cookie ? { cookie } : {},
          ...('data' in write ? { data: write.data } : {}),
        })
        expect(response.status(), cookie ?? 'no cookie').toBe(401)
        expect(await response.json()).toMatchObject({ error: { code: 'not-signed-in' } })
      }
      expect(await version()).toBe(before)
      expect((await request.get('/api/v1/games/bloodborne')).status()).toBe(200)
      expect((await request.get('/api/v1/shelves/short-ones')).status()).toBe(200)
    })
  }
})
