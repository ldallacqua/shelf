import { describe, expect, it } from 'vitest'

import type { ShelfItem } from '@/domain/library/group'
import { testGame } from '@/domain/library/testing'

import { followOpen, neighborsOf, openGameAt } from './open-game'
import type { DrawnShelf } from './view-props'

/**
 * The game open over the shelf stays the game I opened (spec 7.2): given
 * Completed while the filter is on Backlog, it leaves the shelf behind the
 * panel, and the panel keeps showing it rather than the game that took its
 * place.
 */

const stand = (title: string, status = 'backlog' as const, platform = 6): ShelfItem => {
  const game = testGame(title, { status, copies: [{ platform, format: 'digital' }] })
  return { game, copy: game.copies[0]! }
}

const shelf = (key: string, items: ShelfItem[]): DrawnShelf => ({
  kind: 'all',
  key: key as 'all',
  items,
  total: items.length,
})

const celeste = stand('Celeste')
const hades = stand('Hades')
const tunic = stand('Tunic')

describe('the open game', () => {
  it('is the box it was opened on while nothing has moved', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    const shelves = [shelf('all', [celeste, hades, tunic])]
    expect(followOpen(shelves, open, undefined)).toEqual({
      item: hades,
      box: { key: 'all', index: 1 },
    })
  })

  it('follows its game when another moves into its place', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    // Celeste left the filter: Hades now stands first.
    const shelves = [shelf('all', [hades, tunic])]
    expect(followOpen(shelves, open, undefined)).toEqual({
      item: hades,
      box: { key: 'all', index: 0 },
    })
  })

  it('follows its game onto another shelf, its own copy first', () => {
    const open = openGameAt({ key: 'status:backlog', index: 1 }, hades)
    const done = { ...hades, game: { ...hades.game, status: 'completed' as const } }
    const shelves = [shelf('status:backlog', [celeste, tunic]), shelf('status:completed', [done])]
    expect(followOpen(shelves, open, undefined)).toEqual({
      item: done,
      box: { key: 'status:completed', index: 0 },
    })
  })

  it('stays open on its game when the filter no longer shows it, and keeps its place there', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    const done = { ...hades.game, status: 'completed' as const }
    const shelves = [shelf('all', [celeste, tunic])]
    const followed = followOpen(shelves, open, [celeste.game, done, tunic.game])
    expect(followed).toEqual({ item: { game: done, copy: hades.copy } })
    // Tunic took its place, so it is next; Celeste stood before it.
    expect(neighborsOf(shelves, open, followed.box)).toEqual({
      previous: { key: 'all', index: 0 },
      next: { key: 'all', index: 1 },
    })
  })

  it('falls back to the box in its place when its game is nowhere: its address changed', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    const renamed = stand('Hades II')
    const shelves = [shelf('all', [celeste, renamed])]
    expect(followOpen(shelves, open, [celeste.game, renamed.game])).toEqual({
      item: renamed,
      box: { key: 'all', index: 1 },
    })
  })

  it('has its neighbors along the shelf, and across to the next', () => {
    const shelves = [shelf('a', [celeste, hades]), shelf('b', [tunic])]
    const open = openGameAt({ key: 'a', index: 1 }, hades)
    expect(neighborsOf(shelves, open, { key: 'a', index: 1 })).toEqual({
      previous: { key: 'a', index: 0 },
      next: { key: 'b', index: 0 },
    })
  })
})
