import { connection } from 'next/server'

import { apiTally } from '@/server/api/placing'
import { ownerRead } from '@/server/api/writes'
import { myTally } from '@/server/services/placing'

/**
 * `GET /api/v1/me/tally`: how many of the signed-in account's games stand in
 * each status, and nothing else, for the page that sets a new shelf up.
 * Kept by no one.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  return ownerRead(apiTally, await myTally())
}
