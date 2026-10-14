/**
 * Runs once when the server starts. Its only job is to switch IGDB and
 * Twitch for test doubles when `SHELF_MOCKS=1`, which is how the browser
 * tests run against a production build without ever reaching the real IGDB.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SHELF_MOCKS === '1') {
    const { startMocks } = await import('@/server/mocks/start')
    startMocks()
  }
}
