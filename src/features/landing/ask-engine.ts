import type { Library } from '@/domain/library/library'
import { buildIndex, evaluate, gamesIn } from '@/domain/query/evaluate'
import { parseQuery } from '@/domain/query/parse'

import demo from './demo-library.json'

/**
 * The example shelf and the real filter language over it. The server uses
 * it to build the page; the browser fetches it only when a visitor types a
 * filter of their own, since the steps that play out are worked out ahead.
 */
export const demoLibrary = demo as unknown as Library

const index = buildIndex(demoLibrary)

/** The games a filter finds, by slug, in the shelf's order, and whether any of it went unread. */
export const matchesOf = (query: string): { slugs: string[]; unread: boolean } => {
  const parsed = parseQuery(query)
  return {
    slugs: gamesIn(index, evaluate(index, parsed.tree)).map((game) => game.slug),
    unread: parsed.problems.length > 0,
  }
}
