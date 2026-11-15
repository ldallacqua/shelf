import { describe, expect, it } from 'vitest'

import { parseDuelMemory, stillStanding, WAITING, writeDuelMemory } from './memory'

describe('parseDuelMemory', () => {
  it('starts from what is waiting when nothing was kept', () => {
    expect(parseDuelMemory(null)).toEqual({ from: WAITING, chosen: [] })
    expect(parseDuelMemory('not json')).toEqual({ from: WAITING, chosen: [] })
    expect(parseDuelMemory('42')).toEqual({ from: WAITING, chosen: [] })
  })

  it('reads back what it wrote', () => {
    const memory = {
      from: ['backlog' as const, 'wishlist' as const],
      chosen: ['c', 'd'],
      duel: { contenders: ['a', 'b', 'c'], picks: ['b'] },
    }
    expect(parseDuelMemory(writeDuelMemory(memory))).toEqual(memory)
  })

  it('keeps only the statuses a duel draws from', () => {
    const stored = JSON.stringify({ from: ['completed', 'backlog', 'backlog', 'nonsense'] })
    expect(parseDuelMemory(stored).from).toEqual(['backlog'])
    expect(parseDuelMemory(JSON.stringify({ from: ['completed'] })).from).toEqual(WAITING)
  })

  it('keeps sixteen chosen games at most, each once', () => {
    const many = Array.from({ length: 20 }, (_, index) => `g${index}`)
    const stored = JSON.stringify({ from: ['backlog'], chosen: ['g0', 'g0', ...many] })
    expect(parseDuelMemory(stored).chosen).toEqual(many.slice(0, 16))
    expect(parseDuelMemory(JSON.stringify({ chosen: [1, 2] })).chosen).toEqual([])
  })

  it('forgets a duel that cannot be one', () => {
    const read = (duel: unknown) => parseDuelMemory(JSON.stringify({ from: ['backlog'], duel }))
    expect(read({ contenders: ['a'], picks: [] }).duel).toBeUndefined()
    expect(read({ contenders: ['a', 'a'], picks: [] }).duel).toBeUndefined()
    expect(read({ contenders: ['a', 'b'], picks: ['c'] }).duel).toBeUndefined()
    expect(read({ contenders: ['a', 'b'], picks: ['a', 'b'] }).duel).toBeUndefined()
    expect(read({ contenders: 'a,b', picks: [] }).duel).toBeUndefined()
    const many = Array.from({ length: 17 }, (_, index) => `g${index}`)
    expect(read({ contenders: many, picks: [] }).duel).toBeUndefined()
  })
})

describe('stillStanding', () => {
  it('keeps a duel whose games are all on the shelf', () => {
    const duel = { contenders: ['a', 'b', 'c'], picks: ['a'] }
    expect(stillStanding(duel, new Set(['a', 'b', 'c', 'd']))).toEqual({ duel })
  })

  it('ends a duel when one of its games left the shelf, with the rest to start again', () => {
    const duel = { contenders: ['a', 'b', 'c'], picks: ['a'] }
    expect(stillStanding(duel, new Set(['a', 'c']))).toEqual({ left: ['a', 'c'] })
  })
})
