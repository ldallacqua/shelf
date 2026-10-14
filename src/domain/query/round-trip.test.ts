import { describe, expect, it } from 'vitest'

import { closedValues, dateKeys, listKeys, numberKeys, type ListKey } from './keys'
import { parseQuery } from './parse'
import { join, negate, type Comparison, type QueryNode } from './tree'
import { writeQuery } from './write'

/**
 * The property the architecture asks for (section 15): parse, then write,
 * then parse gives the same tree. Thousands of random filters are written and
 * read back, and thousands of random strings are read, written and read
 * again. The generator is seeded, so a failure repeats.
 */

/** A small seeded generator (mulberry32): the same seed, the same filters. */
const generator = (seed: number) => {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const int = (below: number) => Math.floor(next() * below)
  const pick = <T>(items: readonly T[]): T => items[int(items.length)]!
  return { next, int, pick }
}

type Random = ReturnType<typeof generator>

const WORDS = ['rpg', 'adventure', 'ps5', 'switch', 'eidos-montreal', 'couch-co-op', '100', 'x1']
const TITLE_WORDS = [
  'zelda',
  'Mario',
  'spider-man',
  '007',
  'halo:',
  "baldur's",
  'Ōkami',
  'or',
  'II',
]
const PHRASE_WORDS = [...TITLE_WORDS, 'OR', '-dash', 'genre:rpg', '(x)', 'a,b']

const unique = <T>(values: T[]): T[] => {
  const seen = new Set<string>()
  return values.filter((value) => {
    const id = JSON.stringify(value)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

const number = (random: Random): number =>
  random.next() < 0.7 ? random.int(3000) : random.int(200) / 2

const date = (random: Random): string => {
  const year = 1990 + random.int(41)
  if (random.next() < 0.4) return String(year)
  const month = 1 + random.int(12)
  const ym = `${year}-${String(month).padStart(2, '0')}`
  if (random.next() < 0.5) return ym
  return `${ym}-${String(1 + random.int(28)).padStart(2, '0')}`
}

const comparison = <T>(random: Random, value: () => T): Comparison<T> => {
  const op = random.pick(['eq', 'lt', 'le', 'gt', 'ge', 'range'] as const)
  return op === 'range' ? { op, from: value(), to: value() } : { op, value: value() }
}

const leaf = (random: Random): QueryNode => {
  const roll = random.next()
  if (roll < 0.15) {
    return { type: 'text', text: random.pick(TITLE_WORDS), quoted: false }
  }
  if (roll < 0.25) {
    const words = Array.from({ length: 1 + random.int(3) }, () => random.pick(PHRASE_WORDS))
    return { type: 'text', text: words.join(' '), quoted: true }
  }
  const count = 1 + random.int(3)
  if (roll < 0.65) {
    const key: ListKey = random.pick(listKeys)
    const pool = closedValues[key] ?? WORDS
    return {
      type: 'term',
      key,
      values: unique(Array.from({ length: count }, () => random.pick(pool))),
    }
  }
  if (roll < 0.85) {
    return {
      type: 'term',
      key: random.pick(numberKeys),
      values: unique(Array.from({ length: count }, () => comparison(random, () => number(random)))),
    }
  }
  return {
    type: 'term',
    key: random.pick(dateKeys),
    values: unique(Array.from({ length: count }, () => comparison(random, () => date(random)))),
  }
}

/** A random tree, built only from canonical shapes: what the parser itself would make. */
const randomTree = (random: Random, depth: number): QueryNode => {
  const roll = random.next()
  if (depth <= 0 || roll < 0.35) return leaf(random)
  if (roll < 0.5) return negate(randomTree(random, depth - 1))
  const children = Array.from({ length: 2 + random.int(3) }, () => randomTree(random, depth - 1))
  return join(roll < 0.75 ? 'and' : 'or', children)!
}

const PIECES = [
  ' ',
  ' ',
  '(',
  ')',
  '"',
  '-',
  ':',
  ',',
  '..',
  '>=',
  '<',
  '=',
  'OR',
  'or',
  'genre',
  'status',
  'rating',
  'completed',
  'has',
  'zelda',
  'rpg',
  'playing',
  'notes',
  '8',
  '2025',
  '2025-06',
  '10.5',
  'é',
  'x',
]

describe('a filter survives being written and read back', () => {
  it('for thousands of random trees', () => {
    const random = generator(20261014)
    for (let run = 0; run < 4000; run += 1) {
      const tree = randomTree(random, 4)
      const text = writeQuery(tree)
      const parsed = parseQuery(text)
      expect(parsed.problems, text).toEqual([])
      expect(parsed.tree, text).toEqual(tree)
    }
  })

  it('for thousands of random strings: whatever is understood is written in a form that reads the same', () => {
    const random = generator(42)
    for (let run = 0; run < 4000; run += 1) {
      const input = Array.from({ length: random.int(14) }, () => random.pick(PIECES)).join('')
      const first = parseQuery(input)
      const text = writeQuery(first.tree)
      const again = parseQuery(text)
      expect(again.problems, `${input} → ${text}`).toEqual([])
      expect(again.tree, `${input} → ${text}`).toEqual(first.tree)
      // Every problem points at part of what was typed.
      for (const problem of first.problems) {
        expect(problem.from).toBeGreaterThanOrEqual(0)
        expect(problem.to).toBeLessThanOrEqual(input.length)
        expect(problem.from).toBeLessThan(problem.to)
      }
    }
  })
})
