import 'server-only'

import { revalidateTag } from 'next/cache'

import type { Stage } from '@/domain/admin/jobs'
import { createAdmin, type Admin, type StageStep, type StepDone } from '@/server/admin/runs'
import { database } from '@/server/db/client'
import { adminPassword } from '@/server/env'
import { recordsKnown, recordsLeft, refreshNow } from '@/server/services/refresh'
import { readSteamPagesNow, steamPagesKnown, steamPagesLeft } from '@/server/services/steam-pages'
import { readSteamReviews } from '@/server/services/steam-reviews'
import { syncDaily } from '@/server/services/sync'
import { libraryTag } from '@/server/services/tags'

/**
 * The admin page's jobs against this server's database, IGDB and Steam: what each stage does in
 * one step, and how a run goes on to its next step.
 */

/** What one step may spend, inside a request allowed five minutes (`maxDuration`). */
export const STEP_BUDGET_MS = 240_000

/** IGDB's records asked about at once: IGDB answers five hundred to a request. */
const RECORDS_AT_ONCE = 500

/** What one more batch of IGDB's records is given, at least, before a step stops starting them. */
const RECORDS_BATCH_MS = 60_000

const nothing: StepDone = { checked: 0, changed: 0, libraries: [], more: false }

const add = (sum: StepDone, read: { checked: number; changed: number; libraries: string[] }) => ({
  ...sum,
  checked: sum.checked + read.checked,
  changed: sum.changed + read.changed,
  libraries: [...new Set([...sum.libraries, ...read.libraries])],
})

const stages: Record<Stage, StageStep> = {
  // The oldest records first, in batches, while the step has time; more while some weren't asked
  // since the run began. A batch that asked about nothing has nothing more to give.
  igdb: async (since, budgetMs) => {
    const end = Date.now() + budgetMs
    let sum = nothing
    let left = 0
    for (;;) {
      const read = await refreshNow(RECORDS_AT_ONCE)
      sum = add(sum, read)
      left = read.checked > 0 ? await recordsLeft(database(), since) : 0
      if (left === 0 || Date.now() + RECORDS_BATCH_MS > end) break
    }
    return { ...sum, more: left > 0 }
  },
  'steam-reviews': async () => ({ ...(await readSteamReviews()), more: false }),
  'steam-pages-new': async (_since, budgetMs) => {
    const read = await readSteamPagesNow('unread', budgetMs)
    return { ...read, more: read.checked > 0 && (await steamPagesLeft(database())) > 0 }
  },
  'steam-pages': async (since, budgetMs) => {
    const read = await readSteamPagesNow('all', budgetMs, since)
    return { ...read, more: read.checked > 0 && (await steamPagesLeft(database(), since)) > 0 }
  },
  sync: async (_since, budgetMs) => {
    const { synced, libraries } = await syncDaily(budgetMs)
    return { checked: synced, changed: libraries.length, libraries, more: false }
  },
}

let shared: Admin | undefined

/** The admin page's jobs on this server. */
export const admin = (): Admin =>
  (shared ??= createAdmin({
    db: database(),
    stages,
    facts: async () => {
      const db = database()
      const [onSteam, neverRead, records] = await Promise.all([
        steamPagesKnown(db),
        steamPagesLeft(db),
        recordsKnown(db),
      ])
      return { onSteam, neverRead, ...records }
    },
  }))

/** What going on with a run needs: the jobs, the password the next step is asked with, and fetch. */
export type GoingOn = {
  jobs: Pick<Admin, 'step' | 'fail'>
  password: string | undefined
  send: typeof fetch
  expire: (libraryId: string) => void
}

/**
 * Takes a run's next step, then, while there is more, asks this server for the one after, as a
 * request of its own with its own five minutes: the step answers at once and works after.
 * Vercel's own advice for work past a function's time. Shelves the step changed are expired.
 */
export const continueRunWith = async (
  { jobs, password, send, expire }: GoingOn,
  id: string,
  origin: string,
): Promise<void> => {
  const { more, libraries } = await jobs.step(id, STEP_BUDGET_MS).catch(async (error) => {
    await jobs.fail(id, error instanceof Error ? error.message : String(error))
    return { more: false, libraries: [] as string[] }
  })
  for (const library of libraries) expire(library)
  if (!more) return
  if (!password) return jobs.fail(id, 'The admin password is gone from this server.')
  try {
    const answer = await send(`${origin}/api/admin/runs/${encodeURIComponent(id)}/step`, {
      method: 'POST',
      headers: { authorization: `Bearer ${password}` },
      signal: AbortSignal.timeout(30_000),
    })
    if (!answer.ok) await jobs.fail(id, `The next step was refused (${answer.status}).`)
  } catch {
    await jobs.fail(id, 'The next step could not be asked for.')
  }
}

/** A run's next step on this server. */
export const continueRun = (id: string, origin: string): Promise<void> =>
  continueRunWith(
    {
      jobs: admin(),
      password: adminPassword(),
      send: fetch,
      expire: (library) => revalidateTag(libraryTag(library), { expire: 0 }),
    },
    id,
    origin,
  )
