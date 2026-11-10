import { describe, expect, it } from 'vitest'

import type { SavesView, Snapshot } from './saves'
import { destinationOf, needsMe, standingOf } from './saves-standing'

/** A game's saves in one answer (ADR 009, decision 5), from made-up answers of the app. */

const backup = (id: string, createdAt: number, over: Partial<Snapshot> = {}): Snapshot => ({
  id,
  createdAt,
  device: 'here',
  files: 1,
  bytes: 10,
  here: false,
  ...over,
})

const view = (over: Partial<SavesView> = {}): SavesView => ({
  on: true,
  matched: 'Made-up Game',
  others: [],
  registry: false,
  cloud: [],
  manifest: true,
  base: null,
  locations: [],
  files: 1,
  bytes: 10,
  snapshots: [backup('b', 2000, { here: true }), backup('a', 1000)],
  heads: ['b'],
  changedAt: 2000,
  state: 'in-step',
  last: null,
  busy: false,
  caps: { mostMb: 500, kept: 20 },
  place: null,
  reachable: true,
  away: null,
  ...over,
})

describe('where backups go', () => {
  it('is a service, a folder, or this computer alone', () => {
    expect(destinationOf(view({ place: 'Google Drive', service: true }))).toEqual({
      kind: 'service',
      name: 'Google Drive',
    })
    expect(destinationOf(view({ place: 'D:\\Synced\\Shelf saves', service: false }))).toEqual({
      kind: 'folder',
      path: 'D:\\Synced\\Shelf saves',
    })
    expect(destinationOf(view())).toEqual({ kind: 'here' })
  })

  it('knows a service by its name from an app too old to say', () => {
    expect(destinationOf(view({ place: 'OneDrive' })).kind).toBe('service')
    expect(destinationOf(view({ place: 'E:\\Saves' })).kind).toBe('folder')
  })
})

describe('a game’s saves in one answer', () => {
  it('is off until turned on', () => {
    expect(standingOf(view({ on: false, state: 'choose' }))).toEqual({ kind: 'off' })
  })

  it('says when and where they were last kept', () => {
    expect(standingOf(view({ place: 'Google Drive', service: true }))).toEqual({
      kind: 'kept',
      to: { kind: 'service', name: 'Google Drive' },
      at: 2000,
    })
    expect(standingOf(view())).toMatchObject({ kind: 'kept', to: { kind: 'here' } })
  })

  it('puts a choice first, then newer saves', () => {
    const away = { place: 'Google Drive', service: true, reachable: false, away: 'full' } as const
    expect(standingOf(view({ ...away, state: 'choose' })).kind).toBe('choose')
    expect(standingOf(view({ state: 'behind', heads: ['a'] }))).toMatchObject({
      kind: 'behind',
      newer: { id: 'a' },
    })
  })

  it('says what the destination needs before anything waiting there', () => {
    const service = { place: 'OneDrive', service: true, reachable: false } as const
    expect(standingOf(view({ ...service, away: 'signed-out' })).kind).toBe('signed-out')
    expect(standingOf(view({ ...service, away: 'full' })).kind).toBe('full')
    expect(standingOf(view({ ...service, away: null })).kind).toBe('unreachable')
  })

  it('never says a backup reached a place it is still waiting to go to', () => {
    const waiting = view({
      place: 'Google Drive',
      service: true,
      snapshots: [backup('b', 2000, { here: true, waiting: true }), backup('a', 1000)],
    })
    expect(standingOf(waiting)).toMatchObject({ kind: 'waiting', at: 2000 })
  })

  it('makes finding the saves the task when nothing was found', () => {
    expect(standingOf(view({ state: 'nothing' })).kind).toBe('setup')
    expect(standingOf(view({ files: 0, snapshots: [], heads: [], state: 'changed' })).kind).toBe(
      'setup',
    )
  })

  it('says what changed since the last backup, or that there is none yet', () => {
    expect(standingOf(view({ state: 'changed' }))).toMatchObject({ kind: 'changed', at: 2000 })
    expect(standingOf(view({ state: 'changed', snapshots: [], heads: [] }))).toMatchObject({
      kind: 'changed',
      at: undefined,
    })
  })

  it('is a warning only where the person has something to do', () => {
    expect(needsMe({ kind: 'setup' })).toBe(true)
    expect(needsMe({ kind: 'choose' })).toBe(true)
    expect(needsMe({ kind: 'full', to: { kind: 'service', name: 'OneDrive' } })).toBe(true)
    expect(needsMe({ kind: 'unreachable', to: { kind: 'folder', path: 'E:' } })).toBe(false)
    expect(needsMe({ kind: 'kept', to: { kind: 'here' }, at: 1 })).toBe(false)
  })
})
