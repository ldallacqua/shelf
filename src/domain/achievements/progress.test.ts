import { describe, expect, it } from 'vitest'

import type { AchievementSetView, AchievementView } from './achievements'
import { arrangeAchievements, progressOf, summarize } from './progress'

const achievement = (id: string, more: Partial<AchievementView> = {}): AchievementView => ({
  id,
  name: id,
  hidden: false,
  state: 'locked',
  ...more,
})

const set = (achievements: AchievementView[], more: Partial<AchievementSetView> = {}) =>
  ({
    provider: 'steam',
    setId: '1',
    title: 'A game',
    state: 'ready',
    readAt: 1000,
    achievements,
    ...more,
  }) satisfies AchievementSetView

describe('a set’s progress', () => {
  it('counts what is unlocked, and rounds down so nearly all is never 100%', () => {
    const list = Array.from({ length: 200 }, (_, at) =>
      achievement(String(at), { state: at < 199 ? 'unlocked' : 'locked' }),
    )
    expect(progressOf(set(list))).toEqual({
      earned: 199,
      total: 200,
      unknown: 0,
      percent: 99,
      complete: false,
    })
  })

  it('gives no percentage while some achievement’s state is not known', () => {
    expect(
      progressOf(
        set([achievement('a', { state: 'unlocked' }), achievement('b', { state: 'unknown' })]),
      ),
    ).toEqual({ earned: 1, total: 2, unknown: 1, complete: false })
  })

  it('is nothing until the progress is read, and never complete for a set with none', () => {
    expect(progressOf(set([], { state: 'pending' }))).toBeUndefined()
    expect(progressOf(set([], { state: 'private' }))).toBeUndefined()
    expect(progressOf(set([], { state: 'none' }))).toBeUndefined()
    expect(progressOf(set([]))).toEqual({ earned: 0, total: 0, unknown: 0, complete: false })
  })
})

describe('a library’s totals', () => {
  const all = (id: string, at: number, rate: number) =>
    achievement(id, { state: 'unlocked', unlockedAt: at, rate })

  it('counts a game perfect only when every set of it with achievements is complete', () => {
    const summary = summarize([
      { slug: 'done', title: 'Done', sets: [set([all('a', 5, 50)]), set([], { state: 'none' })] },
      {
        slug: 'half',
        title: 'Half',
        sets: [set([all('b', 6, 3)]), set([achievement('c')], { setId: '2' })],
      },
      // Not read yet: neither counted nor perfect.
      { slug: 'later', title: 'Later', sets: [set([], { state: 'pending' })] },
      {
        slug: 'unknown',
        title: 'Unknown',
        sets: [set([all('d', 7, 1)]), set([], { state: 'private' })],
      },
    ])
    expect(summary).toMatchObject({ games: 3, unlocked: 3, available: 4, perfect: 1 })
  })

  it('lists the latest unlocks by when they were, and the rarest by Steam’s rates', () => {
    const summary = summarize(
      [
        {
          slug: 'one',
          title: 'One',
          sets: [
            set([
              all('old', 100, 40),
              all('new', 300, 90),
              achievement('when?', { state: 'unlocked', rate: 0.5 }),
              achievement('locked', { rate: 0.1 }),
            ]),
          ],
        },
        { slug: 'two', title: 'Two', sets: [set([all('mid', 200, 2)], { readAt: 5000 })] },
      ],
      { recent: 2, rarest: 3 },
    )
    expect(summary.recent.map((each) => each.achievement.id)).toEqual(['new', 'mid'])
    expect(summary.rarest.map((each) => each.achievement.id)).toEqual(['when?', 'mid', 'old'])
    expect(summary.rarest[1]).toMatchObject({ slug: 'two', game: 'Two', provider: 'steam' })
    expect(summary).toMatchObject({ readFrom: 1000, readTo: 5000 })
  })
})

describe('a set’s list', () => {
  const list = [
    achievement('a', { state: 'unlocked', unlockedAt: 10, rate: 50 }),
    achievement('b', { rate: 5 }),
    achievement('c', { state: 'unlocked', rate: 1 }),
    achievement('d', { state: 'unlocked', unlockedAt: 30 }),
    achievement('e', { state: 'unknown', rate: 20 }),
  ]
  const ids = (arranged: AchievementView[]) => arranged.map((each) => each.id)

  it('keeps the provider’s order, or filters to unlocked or locked', () => {
    expect(ids(arrangeAchievements(list, 'all', 'provider'))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(ids(arrangeAchievements(list, 'unlocked', 'provider'))).toEqual(['a', 'c', 'd'])
    expect(ids(arrangeAchievements(list, 'locked', 'provider'))).toEqual(['b'])
  })

  it('puts the latest unlocked first, those without a moment after, then the rest', () => {
    expect(ids(arrangeAchievements(list, 'all', 'recent'))).toEqual(['d', 'a', 'c', 'b', 'e'])
  })

  it('puts the rarest first, those Steam gives no rate for last', () => {
    expect(ids(arrangeAchievements(list, 'all', 'rarest'))).toEqual(['c', 'b', 'e', 'a', 'd'])
  })
})
