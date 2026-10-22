import { expect, test } from './fixtures'

/**
 * The daily refresh (architecture, section 8), as Vercel calls it: with its
 * secret, which is the test doubles' made-up one here (`MOCK_CRON_SECRET`).
 * It writes when each record was last checked, so it runs with the writers.
 */
const SECRET = 'test-doubles-only-cron-secret'

test.describe('the daily refresh', () => {
  test.skip(
    ({ browserName, size }) => browserName !== 'chromium' || size !== 'desktop',
    'the server answers the same to every browser',
  )

  test('answers only the call that carries its secret', async ({ request }) => {
    for (const authorization of [undefined, 'Bearer not-the-secret', SECRET]) {
      const refused = await request.get('/api/cron/refresh', {
        headers: authorization ? { authorization } : {},
      })
      expect(refused.status(), authorization ?? 'no secret').toBe(401)
    }

    const answer = await request.get('/api/cron/refresh', {
      headers: { authorization: `Bearer ${SECRET}` },
    })
    expect(answer.status()).toBe(200)
    // IGDB's test double has the records as the seed stored them: nothing changed.
    expect(await answer.json()).toEqual({ checked: 100, changed: 0, libraries: 0 })
  })
})
