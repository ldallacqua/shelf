import { connection } from 'next/server'

import { apiPlatforms } from '@/server/api/platforms'
import { ownerRead } from '@/server/api/writes'
import { myPlatforms } from '@/server/services/sync'

/**
 * `GET /api/v1/me/platforms`: every store and console a shelf can be synced
 * from, and the signed-in account's link to each (ADR 003). Kept by no one.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  return ownerRead(apiPlatforms, await myPlatforms())
}
