import { describe, expect, it } from 'vitest'

import type { Shelf } from '@/domain/library/group'
import { testGame } from '@/domain/library/testing'

import { listRows, offsetsOf, orderOf, rowOf, windowOf } from './list-rows'
import { stepsOf } from './store'

const ember = { game: testGame('Ember') }
const tide = { game: testGame('Tide') }
const shelves: Shelf[] = [
  { kind: 'status', key: 'status:playing', status: 'playing', items: [ember, tide] },
  { kind: 'status', key: 'status:backlog', status: 'backlog', items: [ember] },
]

describe('the library beside a game', () => {
  it('folds the rows without changing the unique previous/next order', () => {
    const rows = listRows(shelves, new Set(['status:playing']))
    expect(rows.map((row) => row.kind)).toEqual(['heading', 'heading', 'game'])
    expect(rowOf(rows, 'ember')).toBe(2)
    expect(rowOf(rows, 'tide')).toBe(-1)
    const order = orderOf(shelves)
    expect(order.map((game) => game.slug)).toEqual(['ember', 'tide'])
    expect(stepsOf(order, 'ember')).toEqual({ previous: undefined, next: order[1] })
    expect(stepsOf(order, 'tide')).toEqual({ previous: order[0], next: undefined })
    expect(stepsOf(order, 'not-shown')).toEqual({})
  })

  it('has no heading when ungrouped', () => {
    expect(
      listRows([{ kind: 'all', key: 'all', items: [ember] }], new Set()).map((row) => row.kind),
    ).toEqual(['game'])
  })

  it('windows rows at exact boundaries, with overscan and no rows beyond either end', () => {
    const offsets = offsetsOf(listRows(shelves, new Set()), 36, 44)
    expect(offsets).toEqual([0, 36, 80, 124, 160, 204])
    expect(windowOf(offsets, 36, 80, 0)).toEqual({ start: 1, end: 2 })
    expect(windowOf(offsets, 36, 80, 1)).toEqual({ start: 0, end: 3 })
    expect(windowOf(offsets, 160, 300, 1)).toEqual({ start: 3, end: 5 })
    expect(windowOf([0], 0, 100, 8)).toEqual({ start: 0, end: 0 })
  })
})
