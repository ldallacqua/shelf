import 'server-only'

import { setupServer } from 'msw/node'

import { onVercel } from '@/server/env'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { loadFixtures } from '@/server/seed/fixtures'

/**
 * The owner's account while the test doubles answer: made-up values the
 * browser tests sign in with (`e2e/fixtures.ts`). Never a real address or
 * a real password.
 */
export const MOCK_OWNER = {
  email: 'owner@shelf.test',
  password: 'test-doubles-only-owner-password',
} as const

/**
 * Starts the test doubles inside the running server. Only when asked
 * (`SHELF_MOCKS=1`), and never on Vercel: a deployment must not be able to
 * answer with made-up data, whatever its settings say.
 */
export const startMocks = () => {
  if (onVercel()) {
    throw new Error('SHELF_MOCKS is set on Vercel. Test doubles refuse to start on a deployment.')
  }

  // The doubles accept only these, so real credentials are never sent to them.
  process.env.TWITCH_CLIENT_ID = MOCK_CLIENT_ID
  process.env.TWITCH_CLIENT_SECRET = MOCK_CLIENT_SECRET
  // The made-up owner is the one account; a real session secret is never needed here.
  process.env.OWNER_EMAIL = MOCK_OWNER.email
  process.env.OWNER_PASSWORD = MOCK_OWNER.password
  process.env.BETTER_AUTH_SECRET = 'test-doubles-only-sign-in-secret-not-a-real-one'

  const server = setupServer(...createHandlers(loadFixtures()))
  // Everything that is not IGDB or Twitch goes through untouched.
  server.listen({ onUnhandledFrame: 'bypass' })
  console.warn(
    'Test doubles are answering for IGDB and Twitch, with a made-up owner (SHELF_MOCKS=1).',
  )
  return server
}
