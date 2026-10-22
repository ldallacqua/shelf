import { expect, libraryKey, test } from './fixtures'

/**
 * A public library's file: the whole library as one cached document
 * (architecture, section 6), at an address with the library's key
 * (ADR 004). Each test reads the key from the library page's own request.
 */
test.describe('the library file @smoke', () => {
  let anyVersion = ''

  test.beforeEach(async ({ page }) => {
    anyVersion = `/api/v1/libraries/${await libraryKey(page)}/snapshot/0`
  })

  test('an old address is sent on to the current one, and that is not cached', async ({
    request,
  }) => {
    const response = await request.get(anyVersion, { maxRedirects: 0 })
    expect(response.status()).toBe(307)
    expect(response.headers()['location']).toMatch(/^\/api\/v1\/libraries\/[^/]+\/snapshot\/\d+$/)
    expect(response.headers()['cache-control']).toBe('no-store')
  })

  test('the current address answers with the sample library, cacheable for a year', async ({
    request,
  }) => {
    const response = await request.get(anyVersion)
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
    const text = await (await request.get(anyVersion)).text()
    // Sentences the sample library uses as notes.
    expect(text).not.toContain('Finished the main story over one long weekend')
    expect(text).not.toContain('The manual is still in the case')
  })

  test('an address that is not a version still finds the library', async ({ request }) => {
    const response = await request.get(anyVersion.replace(/0$/, 'latest'))
    expect(response.status()).toBe(200)
    expect((await response.json()).games.length).toBeGreaterThan(0)
  })

  test('a key that is no public library’s finds nothing', async ({ request }) => {
    const response = await request.get('/api/v1/libraries/not-a-key/snapshot/0', {
      maxRedirects: 0,
    })
    expect(response.status()).toBe(404)
  })
})
