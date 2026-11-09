import { describe, expect, it } from 'vitest'

import type { ShelfItem } from '@/domain/library/group'
import { testGame } from '@/domain/library/testing'

import { followOpen, openGameAt } from './open-game'
import type { DrawnShelf } from './view-props'

/**
 * The box pulled from the 3D wall stays the game I pulled (ADR 009): given
 * Completed while grouped by status, it moves to its new shelf and stays out.
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

describe('the pulled box', () => {
  it('is the box it was pulled from while nothing has moved', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    const shelves = [shelf('all', [celeste, hades, tunic])]
    expect(followOpen(shelves, open)).toEqual({ item: hades, box: { key: 'all', index: 1 } })
  })

  it('follows its game when another moves into its place', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    // Celeste left the filter: Hades now stands first.
    const shelves = [shelf('all', [hades, tunic])]
    expect(followOpen(shelves, open)).toEqual({ item: hades, box: { key: 'all', index: 0 } })
  })

  it('follows its game onto another shelf, its own copy first', () => {
    const open = openGameAt({ key: 'status:backlog', index: 1 }, hades)
    const done = { ...hades, game: { ...hades.game, status: 'completed' as const } }
    const shelves = [shelf('status:backlog', [celeste, tunic]), shelf('status:completed', [done])]
    expect(followOpen(shelves, open)).toEqual({
      item: done,
      box: { key: 'status:completed', index: 0 },
    })
  })

  it('goes back when the filter no longer shows its game, not onto the box in its place', () => {
    const open = openGameAt({ key: 'all', index: 1 }, hades)
    expect(followOpen([shelf('all', [celeste, tunic])], open)).toBeUndefined()
  })
})
