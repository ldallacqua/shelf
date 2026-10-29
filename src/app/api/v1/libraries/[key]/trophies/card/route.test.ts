import { createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'

import { testGame, testLibrary } from '@/domain/library/testing'
import { trophyWall } from '@/domain/library/trophies'
import type * as Library from '@/server/services/library'

import en from '../../../../../../../../messages/en.json'

import { GET } from './route'

/** A public shelf's trophy card (issue 68): an image a shared link shows, and nothing for anything else. */

const library = testLibrary([
  testGame('Hades', { status: 'completed', completedOn: '2025-03-02', cover: 'co1abc' }),
])

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ namespace }: { namespace: string }) =>
    createTranslator({ locale: 'en', messages: en, namespace: namespace as 'Trophies.card' }),
}))

vi.mock('@/server/services/library', async (actual) => ({
  ...(await actual<typeof Library>()),
  findPublicLibraryByKey: async (key: string) =>
    key === 'k'
      ? { id: 'ana', handle: 'ana', name: 'Ana', public: true, key: 'k', version: 1 }
      : undefined,
  getTrophyWall: async (_id: string, scope?: number) => trophyWall(library, 2026, 'en', { scope }),
}))

vi.mock('@/server/services/achievements', () => ({
  getAchievementWall: async () => ({}),
  languageOf: (value: unknown) => (value === 'pt-BR' ? 'pt-BR' : 'en'),
}))

const asked = (key: string, query = '') =>
  GET(new Request(`http://localhost/api/v1/libraries/${key}/trophies/card${query}`), {
    params: Promise.resolve({ key }),
  })

describe('a shelf’s trophy card', () => {
  it('is an image of 1200 by 630, kept an hour, its covers asked for and drawn without when they fail', async () => {
    const fetched = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network in tests'))
    const response = await asked('k', '?year=2025&locale=en')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toContain('max-age=3600')
    const png = new Uint8Array(await response.arrayBuffer())
    // A PNG's header, then its width and height.
    expect([...png.slice(1, 4)].map((byte) => String.fromCharCode(byte)).join('')).toBe('PNG')
    const view = new DataView(png.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
    expect(fetched).toHaveBeenCalledWith(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
      expect.anything(),
    )
    fetched.mockRestore()
  })

  it('draws a cover that is not what it says as its colors, and the rest of the card whole', async () => {
    const fetched = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<svg xmlns="http://www.w3.org/2000/svg"/>', {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    )
    const response = await asked('k', '?locale=en')
    expect(response.status).toBe(200)
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(1000)
    fetched.mockRestore()
  })

  it('is nothing for a shelf that is not public', async () => {
    expect((await asked('nobody')).status).toBe(404)
  })
})
