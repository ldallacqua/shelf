import 'server-only'

import type { Refusal } from '@/domain/library/adding'
import type { Changed } from '@/domain/library/editing'
import { placeMany, type Placing, type Standing } from '@/domain/library/placing'
import { database } from '@/server/db/client'
import { readStanding, readUnsorted } from '@/server/library/read'
import { readVersion, setStatuses } from '@/server/library/store'
import { forAccount, type Done } from '@/server/services/for-account'

/**
 * Placing what a sync brought in (spec 4.5), in the signed-in account's own
 * library: its unsorted games and the tally, and many games given one
 * status at once. One game's status or rating is the editor's own write,
 * `PATCH /entries/{id}`.
 */

/** My unsorted games, and how many games stand in each status. */
export const myUnsorted = (): Promise<Done<Placing>> =>
  forAccount((account) => readUnsorted(database(), account.id))

/** How many of my games stand in each status, and nothing else: what setting a shelf up reads. */
export const myTally = (): Promise<Done<Standing>> =>
  forAccount((account) => readStanding(database(), account.id))

/** Many of my games given one status, in one write; or none, if any is not mine. */
export const placeMine = (body: unknown): Promise<Done<Changed>> => {
  const parsed = placeMany.safeParse(body)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount(async (account) => {
    const db = database()
    await setStatuses(db, account.id, parsed.data.entries, parsed.data.status)
    return { version: await readVersion(db, account.id) }
  }, true)
}
