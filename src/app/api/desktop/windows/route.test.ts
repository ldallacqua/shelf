import { afterEach, describe, expect, it, vi } from 'vitest'

import { LATEST_RELEASE } from '@/domain/desktop/release'

import { GET } from './route'

const INSTALLER =
  'https://github.com/ldallacqua/shelf/releases/download/desktop-v0.18.0/Shelf_0.18.0_x64-setup.exe'

afterEach(() => vi.restoreAllMocks())

/** Answers the one address the route may ask, as GitHub would; nothing here reaches GitHub. */
const github = (answer: () => Response | Promise<Response>) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    expect(String(input)).toBe(LATEST_RELEASE)
    return answer()
  })

describe('GET /api/desktop/windows', () => {
  it('sends the browser to the installer the newest release names', async () => {
    github(() =>
      Response.json({ version: '0.18.0', platforms: { 'windows-x86_64': { url: INSTALLER } } }),
    )
    const response = await GET()
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(INSTALLER)
  })

  it('sends it to the newest release’s page when GitHub fails, is slow, or names anything else', async () => {
    for (const answer of [
      () => new Response(null, { status: 503 }),
      () => Promise.reject(new Error('timed out')),
      () =>
        Response.json({ platforms: { 'windows-x86_64': { url: 'https://example.com/a.exe' } } }),
      () => new Response('not json'),
    ]) {
      github(answer)
      const response = await GET()
      expect(response.status).toBe(302)
      expect(response.headers.get('Location')).toBe(
        'https://github.com/ldallacqua/shelf/releases/latest',
      )
      vi.restoreAllMocks()
    }
  })
})
