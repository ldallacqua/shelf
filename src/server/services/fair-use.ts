import 'server-only'

import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import type { Account } from '@/server/auth/account'
import { database } from '@/server/db/client'
import { rateLimits } from '@/server/db/schema'
import { mocksRequested } from '@/server/env'

/**
 * Every account shares one IGDB allowance, four requests a second (ADR
 * 004). So each account may search, match pasted lines and add games only
 * so often an hour; past that, the request is refused with "too many" until
 * the hour has gone by. The count is kept in the database, where every
 * server sees it, in sign-in's own table under keys of ours. The browser
 * tests all come from one account, so with the test doubles on there is no
 * limit, as for sign-in.
 */

const HOUR = 60 * 60 * 1000

export const FAIR_USE = {
  /** A search as one types: a few for every game added. */
  search: { per: HOUR, max: 600 },
  /** Up to ten pasted lines each. */
  match: { per: HOUR, max: 100 },
  /** Games added, one or many at a time. */
  add: { per: HOUR, max: 300 },
} as const

export type FairUse = keyof typeof FAIR_USE

export class TooManyError extends Error {
  constructor(what: FairUse) {
    super(`Too many requests to ${what} this hour.`)
    this.name = 'TooManyError'
  }
}

/** Counts `amount` against this account's hour, and refuses when it is spent. */
export const spend = async (account: Account, what: FairUse, amount = 1): Promise<void> => {
  if (mocksRequested()) return
  const { per, max } = FAIR_USE[what]
  const now = Date.now()
  const stale = sql`${now} - ${rateLimits.lastRequest} > ${per}`
  const [row] = await database()
    .insert(rateLimits)
    .values({
      id: randomUUID(),
      key: `shelf:${what}:${account.id}`,
      count: amount,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${stale} then ${amount} else ${rateLimits.count} + ${amount} end`,
        lastRequest: sql`case when ${stale} then ${now} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: rateLimits.count })
  if ((row?.count ?? 0) > max) throw new TooManyError(what)
}
