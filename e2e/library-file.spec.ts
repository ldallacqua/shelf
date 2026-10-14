import { expect, test } from './fixtures'

/**
 * The library file: the whole library as one cached document
 * (architecture, section 6). These tests need no page, only requests.
 */
const ANY_VERSION = '/api/v1/library/snapshot/0'

test.describe('the library file @smoke', () => {
  test('an old address is sent on to the current one, and that is not cached', async ({
    request,
  }) => {
    const response = await request.get(ANY_VERSION, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(response.headers()['location']).toMatch(/^\/api\/v1\/library\/snapshot\/\d+$/)
    expect(response.headers()['cache-control']).toBe('no-store')
  })

  test('the current address answers with the sample library, cacheable for a year', async ({
    request,
  }) => {
    const response = await request.get(ANY_VERSION)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(response.headers()['cache-control']).toBe('public, max-age=31536000, immutable')

    const file = await response.json()
    expect(file.format).toBe(1)
    // The address names the same version the file carries.
    expect(response.url()).toMatch(new RegExp(`/snapshot/${file.version}$`))
    expect(file.games.length).toBeGreaterThanOrEqual(200)
    expect(file.names.platform.length).toBeGreaterThan(10)
  })

  test('holds no notes, public or private', async ({ request }) => {
    const text = await (await request.get(ANY_VERSION)).text()
    // Sentences the sample library uses as notes.
    expect(text).not.toContain('Finished the main story over one long weekend')
    expect(text).not.toContain('The manual is still in the case')
  })

  test('an address that is not a version still finds the library', async ({ request }) => {
    const response = await request.get('/api/v1/library/snapshot/latest')
    expect(response.status()).toBe(200)
    expect((await response.json()).games.length).toBeGreaterThan(0)
  })
})
