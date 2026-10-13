import 'server-only'

import type { Db } from '@/server/db/client'
import { igdbToken } from '@/server/db/schema'
import type { TokenStore } from '@/server/igdb/client'

/**
 * Keeps the Twitch token in the database, so a server that has just started
 * uses the one already issued instead of asking for another.
 */
export const databaseTokenStore = (db: Db): TokenStore => ({
  read: async () => {
    const [row] = await db.select().from(igdbToken).limit(1)
    return row ? { accessToken: row.accessToken, expiresAt: row.expiresAt } : undefined
  },
  write: async (token) => {
    await db
      .insert(igdbToken)
      .values({ id: 1, ...token })
      .onConflictDoUpdate({ target: igdbToken.id, set: token })
  },
})
