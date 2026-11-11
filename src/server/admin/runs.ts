import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, count, desc, eq, sql } from 'drizzle-orm'

import {
  jobStages,
  type AdminFacts,
  type AdminJob,
  type AdminRun,
  type AdminState,
  type Stage,
} from '@/domain/admin/jobs'
import type { Db } from '@/server/db/client'
import { adminRuns, platformLinks } from '@/server/db/schema'

/**
 * Jobs started from the admin page, run in steps. Each step is one request of a few minutes: it
 * does what its stage can in the time it is given, says how far it got in its row, and, while
 * there is more, the request asks for the next step (`continueRun`). So a job is never held to
 * one request's time, and each step can see the run was stopped.
 */

/** What one step of a stage did. `more` while the stage has work left. */
export type StepDone = { checked: number; changed: number; libraries: string[]; more: boolean }

/** One step of a stage: what it can within `budgetMs`, of what was not done since `since`. */
export type StageStep = (since: number, budgetMs: number) => Promise<StepDone>

export type AdminDeps = {
  db: Db
  stages: Record<Stage, StageStep>
  facts: () => Promise<Omit<AdminFacts, 'linked'>>
  now?: () => number
}

/** Runs the page lists. */
const RUNS_SHOWN = 20

/** How much of a failure's words a run keeps. */
const ERROR_LENGTH = 300

const toRun = (row: typeof adminRuns.$inferSelect): AdminRun => ({
  id: row.id,
  job: row.job,
  state: row.state,
  steps: row.steps,
  checked: row.checked,
  changed: row.changed,
  startedAt: row.startedAt,
  updatedAt: row.updatedAt,
  ...(row.finishedAt === null ? {} : { finishedAt: row.finishedAt }),
  ...(row.error === null ? {} : { error: row.error }),
})

export const createAdmin = ({ db, stages, facts, now = Date.now }: AdminDeps) => {
  const read = async (id: string) =>
    (await db.select().from(adminRuns).where(eq(adminRuns.id, id)).limit(1))[0]

  /** Starts a job: its row, running from its first stage. The first step is the caller's to take. */
  const start = async (job: AdminJob): Promise<AdminRun> => {
    const at = now()
    const [row] = await db
      .insert(adminRuns)
      .values({ id: randomUUID(), job, state: 'running', startedAt: at, updatedAt: at })
      .returning()
    return toRun(row!)
  }

  /**
   * One step of a run. `more` while it should go on; the libraries whose shelves it changed, to
   * expire. A run stopped meanwhile keeps what this step did, and goes no further.
   */
  const step = async (
    id: string,
    budgetMs: number,
  ): Promise<{ more: boolean; libraries: string[] }> => {
    const run = await read(id)
    if (!run || run.state !== 'running') return { more: false, libraries: [] }
    const plan = jobStages[run.job]
    const stage = plan[run.stage]
    if (!stage) {
      await db
        .update(adminRuns)
        .set({ state: 'done', updatedAt: now(), finishedAt: now() })
        .where(eq(adminRuns.id, id))
      return { more: false, libraries: [] }
    }
    let done: StepDone
    try {
      done = await stages[stage](run.startedAt, budgetMs)
    } catch (error) {
      const words = error instanceof Error ? error.message : String(error)
      await db
        .update(adminRuns)
        .set({
          state: 'failed',
          error: `${stage}: ${words}`.slice(0, ERROR_LENGTH),
          steps: sql`${adminRuns.steps} + 1`,
          updatedAt: now(),
          finishedAt: now(),
        })
        .where(and(eq(adminRuns.id, id), eq(adminRuns.state, 'running')))
      return { more: false, libraries: [] }
    }
    const next = done.more ? run.stage : run.stage + 1
    const at = now()
    await db
      .update(adminRuns)
      .set({
        steps: sql`${adminRuns.steps} + 1`,
        checked: sql`${adminRuns.checked} + ${done.checked}`,
        changed: sql`${adminRuns.changed} + ${done.changed}`,
        stage: next,
        updatedAt: at,
      })
      .where(eq(adminRuns.id, id))
    // Stopped meanwhile, it stays stopped: only a running run finishes.
    if (next >= plan.length) {
      await db
        .update(adminRuns)
        .set({ state: 'done', finishedAt: at })
        .where(and(eq(adminRuns.id, id), eq(adminRuns.state, 'running')))
    }
    const after = await read(id)
    return { more: after?.state === 'running', libraries: done.libraries }
  }

  /** Stops a run: the step under way finishes, and no other starts. */
  const stop = async (id: string): Promise<boolean> => {
    const stopped = await db
      .update(adminRuns)
      .set({ state: 'stopped', updatedAt: now(), finishedAt: now() })
      .where(and(eq(adminRuns.id, id), eq(adminRuns.state, 'running')))
      .returning({ id: adminRuns.id })
    return stopped.length > 0
  }

  /** Stops a run that could not go on, saying why. */
  const fail = async (id: string, words: string) => {
    await db
      .update(adminRuns)
      .set({
        state: 'failed',
        error: words.slice(0, ERROR_LENGTH),
        updatedAt: now(),
        finishedAt: now(),
      })
      .where(and(eq(adminRuns.id, id), eq(adminRuns.state, 'running')))
  }

  /** What the page shows: the facts beside each job, and the latest runs. */
  const state = async (): Promise<AdminState> => {
    const [rows, known, [linked]] = await Promise.all([
      db.select().from(adminRuns).orderBy(desc(adminRuns.startedAt)).limit(RUNS_SHOWN),
      facts(),
      db.select({ linked: count() }).from(platformLinks).where(eq(platformLinks.daily, true)),
    ])
    return { facts: { ...known, linked: linked?.linked ?? 0 }, runs: rows.map(toRun) }
  }

  return { start, step, stop, fail, state }
}

export type Admin = ReturnType<typeof createAdmin>
