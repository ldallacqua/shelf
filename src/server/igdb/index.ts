import 'server-only'

import { database } from '@/server/db/client'
import { igdbEnv } from '@/server/env'
import { createIgdbApi, type IgdbApi } from '@/server/igdb/api'
import { createIgdbClient } from '@/server/igdb/client'
import { databaseTokenStore } from '@/server/igdb/token-store'

let shared: IgdbApi | undefined

/**
 * IGDB for this server: one client, so every caller shares one rate limit
 * and one token, which is kept in the database between cold starts.
 *
 * Nothing a visitor can reach calls this. Search, adding and refreshing all
 * require the owner's session (build step 7), so a visitor cannot spend the
 * IGDB allowance.
 */
export const igdb = (): IgdbApi =>
  (shared ??= createIgdbApi(
    createIgdbClient({ credentials: igdbEnv, tokens: databaseTokenStore(database()) }),
  ))
