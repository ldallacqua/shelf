import { beforeAll, describe, expect, it } from 'vitest'

import type { Library } from '@/domain/library/library'
import { readKeywords, readLibrary } from '@/server/library/read'
import { createTestDatabase } from '@/test/database'

import { answerFacets, answerLibrary, facetsAnswer, libraryAnswer, libraryParams } from './library'
import { openApiDocument } from './openapi'

/** The public API's reads (architecture, section 16), on the sample library. */

let library: Library
let keywords: Awaited<ReturnType<typeof readKeywords>>

beforeAll(async () => {
  const db = await createTestDatabase('default')
  library = await readLibrary(db)
  keywords = await readKeywords(db)
})

const params = (raw: Record<string, string>) => libraryParams.parse(raw)

describe('GET /library', () => {
  it('answers the whole library, a page at a time, in title order', () => {
    const first = answerLibrary(library, params({}))
    expect(libraryAnswer.parse(first)).toEqual(first)
    expect(first.stats.games).toBe(library.games.length)
    expect(first.games).toHaveLength(50)
    expect(first.games[0]?.title).toBe('13 Sentinels: Aegis Rim')
    expect(first.next).toBe('50')
    const second = answerLibrary(library, params({ cursor: '50', limit: '10' }))
    expect(second.games).toHaveLength(10)
    expect(second.next).toBe('60')
  })

  it('filters, sorts and groups as the page does', () => {
    const answer = answerLibrary(
      library,
      params({ q: 'status:completed owned:ps5', sort: '-rating', group: 'status', limit: '200' }),
    )
    expect(answer.games.length).toBeGreaterThan(0)
    expect(answer.games.every((game) => game.status === 'completed')).toBe(true)
    expect(answer.games.every((game) => game.owned.some((copy) => copy.platform === 'ps5'))).toBe(
      true,
    )
    const ratings = answer.games.map((game) => game.rating ?? -1)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    expect(answer.shelves).toEqual([{ key: 'status:completed', count: answer.stats.games }])
    expect(answer.next).toBeNull()
  })

  it('says what it ignored, and falls back to defaults for what it cannot read', () => {
    const answer = answerLibrary(
      library,
      params({ q: 'colour:red', sort: 'popularity', group: 'mood', limit: 'lots', cursor: '-4' }),
    )
    expect(answer.problems).toEqual([
      { text: 'colour:red', reason: 'unknown-key', from: 0, to: 10 },
    ])
    expect(answer.query).toEqual({ q: 'colour:red', sort: 'title', group: 'platform', seed: '' })
    expect(answer.games).toHaveLength(50)
  })

  it('answers keyword filters when given the keywords', () => {
    const word = keywords.names[0]!.slug
    const without = answerLibrary(library, params({ q: `keyword:${word}` }))
    const withWords = answerLibrary(library, params({ q: `keyword:${word}` }), keywords)
    expect(without.stats.games).toBe(0)
    expect(withWords.stats.games).toBeGreaterThan(0)
  })
})

describe('GET /library/facets', () => {
  it('counts every value under the filter, leaving keywords out', () => {
    const answer = answerFacets(library, 'status:backlog')
    expect(facetsAnswer.parse(answer)).toEqual(answer)
    expect(answer.facets.keyword).toBeUndefined()
    const status = Object.fromEntries(
      answer.facets.status!.map((value) => [value.value, value.count]),
    )
    // The filter's own key is left out of its counts.
    expect(status.backlog).toBe(answer.total)
    expect(status.completed).toBeGreaterThan(0)
    expect(answer.ranges.year?.min).toBeLessThan(answer.ranges.year?.max ?? 0)
    expect(answer.dates.added?.min).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('the OpenAPI document', () => {
  it('describes every read, with the schemas the routes check against', () => {
    const document = openApiDocument()
    expect(document.openapi).toBe('3.1.0')
    expect(Object.keys(document.paths)).toEqual([
      '/library',
      '/library/facets',
      '/shelves',
      '/shelves/{slug}',
      '/library/snapshot/{version}',
    ])
    expect(Object.keys(document.components.schemas ?? {}).sort()).toEqual([
      'Error',
      'Facets',
      'Game',
      'Library',
      'ShelfOutline',
      'SmartShelf',
      'SmartShelves',
    ])
    expect(JSON.stringify(document.components.schemas?.Library)).toContain(
      '#/components/schemas/Game',
    )
  })
})
