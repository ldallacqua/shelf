import { parseQuery } from './parse'
import { conjuncts, join, type QueryNode } from './tree'
import { writeQuery } from './write'

/**
 * A filter within another, both holding: their parts joined with `and`,
 * each part once, in one order, in the canonical spelling. A link that
 * narrows the page's filter (a trophy wall's genre, a chart's bar) leads to
 * the same address however the parts were come to, and narrowing by a part
 * already there leads back to the page. Following such links ends.
 *
 * Before, each link wrapped the page's filter in brackets after its own, so
 * every page led to a deeper one, without end: a crawler following them
 * spent the database's month of reads in days (architecture, section 25).
 *
 * What either filter has that the language does not understand is left out,
 * as the page it filters left it out. Since words are matched each on its
 * own, the order changes nothing a filter finds.
 */
export const filterWithin = (filter: string, outer?: string): string => {
  const parts = new Map<string, QueryNode>()
  for (const text of [filter, outer ?? '']) {
    for (const part of conjuncts(parseQuery(text).tree)) parts.set(writeQuery(part), part)
  }
  const ordered = [...parts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, part]) => part)
  return writeQuery(join('and', ordered))
}
