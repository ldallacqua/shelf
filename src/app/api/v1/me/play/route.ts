import { connection } from 'next/server'

import { apiPlayable, ownerRead } from '@/server/api/writes'
import { myPlayable } from '@/server/services/editing'

/**
 * `GET /api/v1/me/play`: each of the signed-in account's games, by its
 * address in the library file, with its entry and its apps on Steam: what
 * Ready to play in Shelf for Windows matches against what the computer has
 * (spec 7.7). Kept by nothing.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  return ownerRead(apiPlayable, await myPlayable())
}
