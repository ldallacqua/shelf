import 'server-only'

import { setupServer } from 'msw/node'

import { onVercel } from '@/server/env'
import { createHandlers, MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '@/server/mocks/handlers'
import { loadFixtures } from '@/server/seed/fixtures'

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

  const server = setupServer(...createHandlers(loadFixtures()))
  // Everything that is not IGDB or Twitch goes through untouched.
  server.listen({ onUnhandledFrame: 'bypass' })
  console.warn('Test doubles are answering for IGDB and Twitch (SHELF_MOCKS=1).')
  return server
}
