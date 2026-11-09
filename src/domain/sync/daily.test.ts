import { describe, expect, it } from 'vitest'

import { runDaily, type DailyLink } from '@/domain/sync/daily'

/** A made-up link that writes down each piece of work it is asked for. */
const linkOf = (
  name: string,
  log: string[],
  {
    steps = 1,
    achievements,
    problem = false,
    throws = false,
  }: { steps?: number; achievements?: number; problem?: boolean; throws?: boolean } = {},
): DailyLink => {
  let stepsLeft = steps
  let achievementsLeft = achievements ?? 0
  return {
    step: (first) => {
      log.push(`${name} ${first ? 'read' : 'step'}`)
      if (throws) return Promise.reject(new Error('down'))
      stepsLeft -= 1
      return Promise.resolve({ remaining: stepsLeft, problem })
    },
    ...(achievements === undefined
      ? {}
      : {
          achievements: () => {
            log.push(`${name} achievements`)
            achievementsLeft -= 1
            return Promise.resolve({ remaining: achievementsLeft, stop: false })
          },
        }),
    failed: () => log.push(`${name} failed`),
  }
}

describe('the daily sync', () => {
  it('reads every link before finishing any, and reads achievements last', async () => {
    const log: string[] = []
    const read = await runDaily(
      [linkOf('steam', log, { steps: 2, achievements: 2 }), linkOf('nintendo', log, { steps: 2 })],
      () => true,
    )
    expect(log).toEqual([
      'steam read',
      'nintendo read',
      'steam step',
      'nintendo step',
      'steam achievements',
      'steam achievements',
    ])
    expect(read).toBe(2)
  })

  it('reads the second link even when the first has hours of achievements to read', async () => {
    const log: string[] = []
    let calls = 0
    // Time for four pieces of work: the reads, then two of the many achievements.
    await runDaily(
      [linkOf('steam', log, { achievements: 1000 }), linkOf('nintendo', log)],
      () => calls++ < 4,
    )
    expect(log.slice(0, 2)).toEqual(['steam read', 'nintendo read'])
    expect(log.filter((line) => line === 'steam achievements')).toHaveLength(2)
  })

  it('leaves a link that failed out of the rest, and goes on with the others', async () => {
    const log: string[] = []
    const read = await runDaily(
      [linkOf('steam', log, { throws: true, achievements: 1 }), linkOf('nintendo', log)],
      () => true,
    )
    expect(log).toEqual(['steam read', 'steam failed', 'nintendo read'])
    expect(read).toBe(1)
  })

  it('reads no achievements for a link with games left to add or a problem', async () => {
    const log: string[] = []
    let calls = 0
    await runDaily(
      [
        linkOf('steam', log, { steps: 5, achievements: 1 }),
        linkOf('other', log, { problem: true, achievements: 1 }),
      ],
      () => calls++ < 3,
    )
    expect(log).toEqual(['steam read', 'other read', 'steam step'])
  })

  it('starts nothing once the time is spent', async () => {
    const log: string[] = []
    expect(await runDaily([linkOf('steam', log)], () => false)).toBe(0)
    expect(log).toEqual([])
  })
})
