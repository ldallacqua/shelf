import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STALE_MS, shownState, type Stage } from '@/domain/admin/jobs'
import type { Db } from '@/server/db/client'
import { createTestDatabase } from '@/test/database'

import { createAdmin, type StageStep, type StepDone } from './runs'

let db: Db
let time: number

const done = (more = false, checked = 10): StepDone => ({
  checked,
  changed: 2,
  libraries: ['library-1'],
  more,
})

const quiet: StageStep = async () => done()

const jobsWith = (stages: Partial<Record<Stage, StageStep>> = {}) =>
  createAdmin({
    db,
    stages: {
      igdb: quiet,
      'steam-reviews': quiet,
      'steam-pages-new': quiet,
      'steam-pages': quiet,
      sync: quiet,
      ...stages,
    },
    facts: async () => ({ onSteam: 5, neverRead: 1, records: 9 }),
    now: () => time,
  })

beforeEach(async () => {
  db = await createTestDatabase('empty')
  time = Date.UTC(2026, 10, 10)
})

describe('a job from the admin page', () => {
  it('runs a stage in steps while it has more, then is done, adding up what each read', async () => {
    const pages = vi
      .fn<StageStep>()
      .mockResolvedValueOnce(done(true))
      .mockResolvedValueOnce(done(false, 5))
    const jobs = jobsWith({ 'steam-pages': pages })
    const run = await jobs.start('steam-pages')
    expect(run.state).toBe('running')

    expect(await jobs.step(run.id, 1_000)).toEqual({ more: true, libraries: ['library-1'] })
    time += 1
    expect((await jobs.step(run.id, 1_000)).more).toBe(false)
    expect(pages).toHaveBeenCalledWith(run.startedAt, 1_000)

    const [listed] = (await jobs.state()).runs
    expect(listed).toMatchObject({ state: 'done', steps: 2, checked: 15, changed: 4 })
    expect(listed?.finishedAt).toBe(time)
    // A step asked for after the end does nothing.
    expect(await jobs.step(run.id, 1_000)).toEqual({ more: false, libraries: [] })
    expect(pages).toHaveBeenCalledTimes(2)
  })

  it('runs everything’s stages in turn: IGDB, then Steam’s scores, then every Steam page', async () => {
    const order: Stage[] = []
    const record =
      (stage: Stage): StageStep =>
      async () => {
        order.push(stage)
        return done()
      }
    const jobs = jobsWith({
      igdb: record('igdb'),
      'steam-reviews': record('steam-reviews'),
      'steam-pages': record('steam-pages'),
    })
    const run = await jobs.start('everything')
    while ((await jobs.step(run.id, 1_000)).more) {
      // On to the next stage, as the server asks for the next step.
    }
    expect(order).toEqual(['igdb', 'steam-reviews', 'steam-pages'])
    expect((await jobs.state()).runs[0]).toMatchObject({ state: 'done', steps: 3 })
  })

  it('keeps a stage’s failure, in words, and goes no further', async () => {
    const jobs = jobsWith({
      igdb: async () => {
        throw new Error('IGDB answered 429 three times.')
      },
    })
    const run = await jobs.start('everything')
    expect((await jobs.step(run.id, 1_000)).more).toBe(false)
    expect((await jobs.state()).runs[0]).toMatchObject({
      state: 'failed',
      error: 'igdb: IGDB answered 429 three times.',
      steps: 1,
    })
  })

  it('stays stopped when stopped during a step, keeping what the step read', async () => {
    let stopNow = () => Promise.resolve(false)
    const jobs = jobsWith({
      'steam-pages': async () => {
        await stopNow()
        return done(true)
      },
    })
    const run = await jobs.start('steam-pages')
    stopNow = () => jobs.stop(run.id)
    expect((await jobs.step(run.id, 1_000)).more).toBe(false)
    expect((await jobs.state()).runs[0]).toMatchObject({ state: 'stopped', checked: 10 })
    expect(await jobs.stop(run.id)).toBe(false)
  })

  it('lists the latest runs first, with the facts', async () => {
    const jobs = jobsWith()
    await jobs.start('sync')
    time += 1
    await jobs.start('igdb')
    const state = await jobs.state()
    expect(state.runs.map((run) => run.job)).toEqual(['igdb', 'sync'])
    expect(state.facts).toEqual({ onSteam: 5, neverRead: 1, records: 9, linked: 0 })
  })

  it('says a running run stopped answering after ten minutes without a step', async () => {
    const run = await jobsWith().start('sync')
    expect(shownState(run, run.updatedAt + STALE_MS)).toBe('running')
    expect(shownState(run, run.updatedAt + STALE_MS + 1)).toBe('stale')
  })
})
