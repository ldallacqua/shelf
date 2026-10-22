import { beforeAll, describe, expect, it } from 'vitest'

import type { Library } from '@/domain/library/library'
import { parseSort } from '@/domain/library/sort'
import { arrangeLibrary, indexOnce } from '@/domain/library/view'
import { evaluate, gamesIn, standingCopies, type LibraryIndex } from '@/domain/query/evaluate'
import { facetCounts } from '@/domain/query/facets'
import { listKeys } from '@/domain/query/keys'
import { parseQuery } from '@/domain/query/parse'
import { readLibrary } from '@/server/library/read'
import { createTestDatabase, sampleLibraryId } from '@/test/database'

/**
 * The speed budget (spec 5.6, architecture section 15): with the stress
 * library of 1,280 games, a change of filter or sort shows its result in
 * under 50 ms, counts beside every value included. It is measured here, in
 * the unit tests, so a slow change fails the build.
 */

const BUDGET_MS = 50

let library: Library
let index: LibraryIndex

beforeAll(async () => {
  const db = await createTestDatabase('stress')
  library = await readLibrary(db, await sampleLibraryId(db))
  index = indexOnce(library)
}, 60_000)

/** Everything a change does: read the filter, match, sort, shelve, and count every value. */
const change = (q: string, sort: string) => {
  const { tree } = parseQuery(q)
  const games = gamesIn(index, evaluate(index, tree))
  const shelves = arrangeLibrary(
    games,
    library.names,
    { group: 'platform', sort: parseSort(sort), seed: 'k3x9' },
    'en',
    standingCopies(index, tree),
  )
  let counted = 0
  for (const key of listKeys) counted += facetCounts(index, tree, key).length
  return { games: games.length, shelves: shelves.length, counted }
}

/** The middle of several runs, so one slow moment does not fail the test. */
const timed = (run: () => unknown): number => {
  const times: number[] = []
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  return times.sort((a, b) => a - b)[3]!
}

describe('a filter or sort change on 1,280 games', () => {
  it('is the stress library', () => {
    expect(library.games.length).toBeGreaterThanOrEqual(1000)
  })

  for (const [q, sort] of [
    ['', 'title'],
    ['status:backlog', '-rating'],
    ['genre:rpg,adventure -theme:horror owned:playstation', 'added'],
    ['(owned:ps5 format:physical) OR rating:>=9', '-hours'],
    ['zelda OR mario OR "final fantasy"', 'random'],
    ['year:2010..2020 hours:<10 -has:rating', 'color'],
  ] as const) {
    it(`takes under ${BUDGET_MS} ms: ${q || 'no filter'}, sorted by ${sort}`, () => {
      const result = change(q, sort)
      expect(result.counted).toBeGreaterThan(0)
      const ms = timed(() => change(q, sort))
      console.info(`${q || '(none)'} / ${sort}: ${ms.toFixed(1)} ms, ${result.games} games`)
      expect(ms).toBeLessThan(BUDGET_MS)
    })
  }
})
