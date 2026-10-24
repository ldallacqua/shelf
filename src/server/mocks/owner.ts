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

/**
 * What seals a platform's tokens while the test doubles answer: 32 bytes,
 * in base64, of nothing secret.
 */
export const MOCK_TOKEN_KEY = Buffer.from('test-doubles-only-platform-key!!').toString('base64')

/**
 * A made-up Nintendo Account, only while the test doubles answer
 * (`server/mocks/nintendo.ts`). Its play history is
 * `fixtures/nintendo/play-history.json`. The code, session and token are
 * shaped as Nintendo's are, three parts of base64url, and say what they are.
 */
export const MOCK_NINTENDO = {
  accountId: 'a0b1c2d3e4f5a6b7',
  nickname: 'Sample on Nintendo',
  code: 'test.doubles-only-nintendo.code',
  sessionToken: 'test.doubles-only-nintendo.session',
  accessToken: 'test.doubles-only-nintendo.access',
  /** A session Nintendo has ended: the token exchange refuses it. */
  endedSessionToken: 'test.doubles-only-nintendo.ended',
} as const
