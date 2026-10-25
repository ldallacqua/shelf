import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createIgdbApi, quote } from '@/server/igdb/api'
import { createIgdbClient, memoryTokenStore } from '@/server/igdb/client'
import {
  createHandlers,
  MOCK_CLIENT_ID,
  MOCK_CLIENT_SECRET,
  newMockState,
} from '@/server/mocks/handlers'
import { loadFixtures } from '@/server/seed/fixtures'
import { network } from '@/test/network'

const fixtures = loadFixtures()
const state = newMockState()
const handlers = createHandlers(fixtures, state)

beforeEach(() => network.use(...handlers))
afterEach(() => {
  state.requests.length = 0
})

const api = createIgdbApi(
  createIgdbClient({
    credentials: () => ({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET }),
    tokens: memoryTokenStore(),
    // No waiting between requests: these tests are about the questions, not the pace.
    perSecond: 100_000,
    sleep: async () => undefined,
  }),
)

describe('games', () => {
  it('returns full records for the ids asked', async () => {
    const records = await api.games([472, 37034, 472])
    expect(records.map((record) => record.id).sort((a, b) => a - b)).toEqual([472, 37034])
    const port = records.find((record) => record.id === 37034)
    expect(port).toMatchObject({ parent_game: 472, game_type: { id: 11 } })
    expect(port?.cover?.image_id).toBeTruthy()
  })

  it('asks for nothing when given no ids', async () => {
    expect(await api.games([])).toEqual([])
    expect(state.requests).toHaveLength(0)
  })

  it('splits a long list into requests of at most 500', async () => {
    const ids = [...fixtures.games.keys()].slice(0, 700)
    expect(await api.games(ids)).toHaveLength(700)
    expect(state.requests).toHaveLength(2)
  })
})

describe('timeToBeat', () => {
  it('maps each game to its figures', async () => {
    const times = await api.timeToBeat([472, 37777])
    expect(times.get(472)?.normally).toBeGreaterThan(0)
    expect(times.get(37777)?.normally).toBeGreaterThan(0)
  })
})

describe('lineages', () => {
  it('needs no request for a game that stands alone', async () => {
    const [skyrim] = await api.games([472])
    state.requests.length = 0
    expect(skyrim && (await api.lineages([skyrim])).get(472)).toEqual([])
    expect(state.requests).toHaveLength(0)
  })

  it('needs no request when the record above is already in hand', async () => {
    const records = await api.games([472, 37034])
    state.requests.length = 0
    const lineages = await api.lineages(records)
    expect(lineages.get(37034)).toEqual([{ igdbId: 472, via: 'port' }])
    expect(state.requests).toHaveLength(0)
  })

  it('fetches the records above, one request per level', async () => {
    // The Last of Us Remastered-style chain from the fixtures: a remaster of an expanded game.
    const [record] = await api.games([21004])
    state.requests.length = 0
    expect(record && (await api.lineages([record])).get(21004)).toEqual([
      { igdbId: 1569, via: 'remaster' },
      { igdbId: 398453, via: 'expanded' },
    ])
    expect(state.requests).toHaveLength(2)
  })
})

describe('search', () => {
  it('finds games by words in the title, and leaves editions out', async () => {
    const hits = await api.search('tomb raider')
    expect(hits.length).toBeGreaterThanOrEqual(3)
    for (const hit of hits) {
      expect(hit.name.toLowerCase()).toContain('tomb raider')
      expect(hit.version_parent).toBeUndefined()
    }
    expect(hits.map((hit) => hit.id)).not.toContain(123051)
  })

  it('finds a word still being typed, which IGDB’s search does not', async () => {
    const names = (await api.search('shadow of the tomb rai')).map((hit) => hit.name)
    expect(names).toContain('Shadow of the Tomb Raider')
    const bodies = state.requests.map((request) => request.body)
    expect(bodies).toHaveLength(2)
    expect(bodies).toContainEqual(expect.stringMatching(/^search "shadow of the tomb rai";/))
    expect(bodies).toContainEqual(
      expect.stringContaining(
        'name ~ *"shadow"* & name ~ *"of"* & name ~ *"the"* & name ~ *"tomb"* & name ~ *"rai"*; sort total_rating_count desc;',
      ),
    )
  })

  it('puts the games with the whole word first, and each game once', async () => {
    const hits = await api.search('war')
    const names = hits.map((hit) => hit.name)
    const whole = names.filter((name) => /\bwar\b/i.test(name))
    expect(whole.length).toBeGreaterThan(0)
    expect(names.slice(0, whole.length)).toEqual(whole)
    // Then Hogwarts, Star Wars and the rest, which hold the word only inside another.
    expect(names.length).toBeGreaterThan(whole.length)
    expect(new Set(hits.map((hit) => hit.id)).size).toBe(hits.length)
  })

  it('survives quotes and backslashes in what was typed', async () => {
    expect(await api.search('say "hi" \\ ; where id = 1')).toEqual([])
    const bodies = state.requests.map((request) => request.body)
    expect(bodies).toContainEqual(
      expect.stringContaining('search "say \\"hi\\" \\\\ ; where id = 1"'),
    )
    expect(bodies).toContainEqual(expect.stringContaining('name ~ *"\\"hi\\""* & name ~ *"\\\\"*'))
  })
})

describe('findByTitles', () => {
  it('looks up ten titles a request, and keeps the answers in order', async () => {
    const titles = [
      'Hades',
      'Celeste',
      'Portal 2',
      'Bloodborne',
      'Elden Ring',
      'Hollow Knight',
      'No Such Game Exists',
      'Inside',
      'Limbo',
      'Control',
      'resident evil 4',
      'Journey',
    ]
    const found = await api.findByTitles(titles)
    expect(state.requests.map((request) => request.endpoint)).toEqual(['multiquery', 'multiquery'])
    expect(found).toHaveLength(titles.length)
    expect(found[0]?.[0]?.name).toBe('Hades')
    expect(found[6]).toEqual([])
    // Two games share this title; both come back, to be told apart by year.
    expect(found[10]?.map((hit) => hit.name)).toEqual(['Resident Evil 4', 'Resident Evil 4'])
    expect(found[11]?.[0]?.name).toBe('Journey')
  })
})

describe('named and platforms', () => {
  it('names ids of a kind', async () => {
    const genres = await api.named('genre', [12, 31])
    expect(genres.map((genre) => genre.name).sort()).toEqual(['Adventure', 'Role-playing (RPG)'])
  })

  it('lists every platform, or the ones asked for', async () => {
    expect((await api.platforms()).length).toBeGreaterThan(200)
    expect((await api.platforms([130, 167])).map((platform) => platform.name).sort()).toEqual([
      'Nintendo Switch',
      'PlayStation 5',
    ])
  })
})

describe('quote', () => {
  it('escapes what would end the text early', () => {
    expect(quote('Marvel\'s "Spider-Man"')).toBe('"Marvel\'s \\"Spider-Man\\""')
    expect(quote('back\\slash')).toBe('"back\\\\slash"')
    expect(quote('line\nbreak')).toBe('"line break"')
  })
})
