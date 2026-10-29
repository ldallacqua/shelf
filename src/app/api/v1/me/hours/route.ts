import { connection } from 'next/server'

import { apiStoreHours, ownerRead } from '@/server/api/writes'
import { myStoreHours } from '@/server/services/editing'

/**
 * `GET /api/v1/me/hours`: the signed-in account's games whose stores report
 * far past IGDB's time, not yet looked at, the most hours first: for the
 * account page, to take time left idle out of them or keep them. Kept by
 * nothing.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  const result = await myStoreHours()
  return ownerRead(
    apiStoreHours,
    result.ok
      ? {
          ok: true,
          value: {
            games: result.value.map(({ colors, reported, igdb, ...game }) => ({
              ...game,
              ...(colors ? { colors: [...colors] } : {}),
              hoursReported: reported / 60,
              igdb: { hours: igdb.minutes / 60, of: igdb.of },
            })),
          },
        }
      : result,
  )
}
