import { describe, expect, it } from 'vitest'

import { dueWork, readOrder, READ_AGAIN, type KnownApp, type KnownSet } from './due'

const NOW = 1_800_000_000_000
const ME = '76561190000000001'

const set = (more: Partial<KnownSet> = {}): KnownSet => ({
  count: 10,
  definedAt: NOW - 1000,
  changedAt: NOW - 2000,
  triedAt: NOW - 1000,
  failed: false,
  ...more,
})

const read = (more: Partial<NonNullable<KnownApp['progress']>> = {}) => ({
  externalId: ME,
  readAt: NOW - 1000,
  playedAt: 500,
  triedAt: NOW - 1000,
  problem: null,
  ...more,
})

describe('what is due', () => {
  it('reads a game never read: its definitions and progress', () => {
    expect(dueWork({ lastPlayedAt: null }, ME, NOW)).toEqual({
      definitions: true,
      progress: true,
    })
  })

  it('reads nothing of a game read a moment ago and not played since', () => {
    expect(dueWork({ lastPlayedAt: 500, set: set(), progress: read() }, ME, NOW)).toEqual({
      definitions: false,
      progress: false,
    })
  })

  it('reads progress again once the game is played, by the source’s own moment', () => {
    // Played "before" Shelf's last read by Shelf's clock, but later than Steam said then.
    const app = { lastPlayedAt: 600, set: set(), progress: read() }
    expect(dueWork(app, ME, NOW).progress).toBe(true)
  })

  it('reads progress again after the set changed, and after a week', () => {
    expect(
      dueWork({ lastPlayedAt: 500, set: set({ changedAt: NOW - 10 }), progress: read() }, ME, NOW)
        .progress,
    ).toBe(true)
    const weekOld = read({ readAt: NOW - READ_AGAIN.progress - 1 })
    expect(dueWork({ lastPlayedAt: 500, set: set(), progress: weekOld }, ME, NOW).progress).toBe(
      true,
    )
  })

  it('reads a game’s definitions again after a month, and none of its progress when it has none', () => {
    const old = set({ count: 0, definedAt: NOW - READ_AGAIN.definitions - 1 })
    expect(dueWork({ lastPlayedAt: null, set: old }, ME, NOW).definitions).toBe(true)
    expect(dueWork({ lastPlayedAt: null, set: set({ count: 0 }) }, ME, NOW)).toEqual({
      definitions: false,
      progress: false,
    })
  })

  it('waits an hour after a failure, or after the account was private', () => {
    const failed = set({ definedAt: null, count: null, failed: true, triedAt: NOW - 1000 })
    expect(dueWork({ lastPlayedAt: null, set: failed }, ME, NOW)).toMatchObject({
      definitions: false,
      progress: false,
    })
    expect(
      dueWork({ lastPlayedAt: null, set: failed }, ME, NOW + READ_AGAIN.failed).definitions,
    ).toBe(true)
    const hidden = read({ readAt: null, problem: 'private', triedAt: NOW - 1000 })
    expect(dueWork({ lastPlayedAt: 500, set: set(), progress: hidden }, ME, NOW).progress).toBe(
      false,
    )
  })

  it('reads progress kept for another account as never read', () => {
    const theirs = read({ externalId: '76561190000000002' })
    expect(dueWork({ lastPlayedAt: 500, set: set(), progress: theirs }, ME, NOW).progress).toBe(
      true,
    )
  })
})

describe('the order games are read in', () => {
  it('is the latest played first, then the most played, then by id', () => {
    const apps = [
      { storeId: 'b', lastPlayedAt: null, minutes: 0 },
      { storeId: 'c', lastPlayedAt: 10, minutes: 5 },
      { storeId: 'a', lastPlayedAt: null, minutes: 0 },
      { storeId: 'd', lastPlayedAt: null, minutes: 90 },
      { storeId: 'e', lastPlayedAt: 20, minutes: 1 },
    ]
    expect(apps.sort(readOrder).map((app) => app.storeId)).toEqual(['e', 'c', 'd', 'a', 'b'])
  })
})
