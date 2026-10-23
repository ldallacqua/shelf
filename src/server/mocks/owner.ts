/**
 * The sample account (ADR 004): the one every seed fills, at `/u/sample`.
 * It has no password, so nobody signs in to it, except while the test
 * doubles answer: then the browser tests sign in to it with the made-up
 * password below (`e2e/fixtures.ts`). Never a real address or a real
 * password.
 */
export const SAMPLE_ACCOUNT = {
  handle: 'sample',
  name: 'Sample',
  email: 'owner@shelf.test',
} as const

/** What the browser tests sign in with, only while the test doubles answer. */
export const MOCK_OWNER = {
  email: SAMPLE_ACCOUNT.email,
  password: 'test-doubles-only-owner-password',
} as const

/** What the browser tests start the daily refresh with, only while the test doubles answer. */
export const MOCK_CRON_SECRET = 'test-doubles-only-cron-secret'

/**
 * A made-up Steam account and key, only while the test doubles answer
 * (`server/mocks/steam.ts`). Seventeen digits, as a SteamID64 is, but in a
 * range Steam does not hand out.
 */
export const MOCK_STEAM = {
  key: 'test-doubles-only-steam-key',
  /** Its games are `fixtures/steam/owned-games.json`. */
  steamId: '76561190000000001',
  /** One whose game details are private. */
  privateSteamId: '76561190000000002',
  name: 'Sample on Steam',
} as const
