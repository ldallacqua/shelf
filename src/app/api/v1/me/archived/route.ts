import { connection } from 'next/server'

import { apiArchivedGames, ownerRead } from '@/server/api/writes'
import { myArchived } from '@/server/services/editing'

/**
 * `GET /api/v1/me/archived`: the signed-in account's archived games, the
 * latest first (spec 7.4), for the account page, the one place they are
 * listed. Kept by nothing.
 */
export async function GET() {
  // Whose it is comes from the session: never built ahead.
  await connection()
  const result = await myArchived()
  return ownerRead(
    apiArchivedGames,
    result.ok
      ? {
          ok: true,
          value: {
            games: result.value.map(({ colors, ...game }) =>
              colors ? { ...game, colors: [...colors] } : game,
            ),
          },
        }
      : result,
  )
}
