import { connection } from 'next/server'

import { apiUnsorted } from '@/server/api/placing'
import { ownerRead } from '@/server/api/writes'
import { myUnsorted } from '@/server/services/placing'

/**
 * `GET /api/v1/me/unsorted`: the signed-in account's unsorted games, with
 * their hours and last play on each source, and how many games stand in
 * each status (spec 4.5). Kept by no one.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  return ownerRead(apiUnsorted, await myUnsorted())
}
