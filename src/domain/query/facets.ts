import { countBits, countShared } from './bitmap'
import { evaluate, isCopyKey, type LibraryIndex } from './evaluate'
import type { FilterKey, ListKey } from './keys'
import { conjuncts, isAboutKey, join, type QueryNode } from './tree'

/**
 * Counts beside every value (spec 5.4): how many games would match if I
 * picked it, given everything else that is active. "Everything else" is the
 * filter without its own conditions on that key, so the counts beside RPG
 * and Strategy do not shrink to nothing once RPG is picked.
 */

export type FacetValue = { word: string; name: string; count: number }

/** The filter without its top-level conditions on one key. */
export const withoutKey = (tree: QueryNode | undefined, key: FilterKey): QueryNode | undefined =>
  join(
    'and',
    conjuncts(tree).filter((node) => !isAboutKey(node, key)),
  )

/** Every value of a list filter with its count, in the order the index holds them. */
export const facetCounts = (
  index: LibraryIndex,
  tree: QueryNode | undefined,
  key: ListKey,
): FacetValue[] => {
  const rest = withoutKey(tree, key)
  const values = [...index.lists[key].values()]

  // A platform or a format is about a copy, and with the filter's other
  // condition on copies it describes one copy: "discs, on PS4". That is
  // counted by asking the whole question for each value. There are a few
  // dozen platforms at most.
  if (isCopyKey(key)) {
    return values.map((value) => ({
      word: value.word,
      name: value.name,
      count: countBits(
        evaluate(
          index,
          join('and', [...conjuncts(rest), { type: 'term', key, values: [value.word] }]),
        ),
      ),
    }))
  }

  const base = evaluate(index, rest)
  return values.map((value) => ({
    word: value.word,
    name: value.name,
    count: countShared(base, value.bits),
  }))
}

/**
 * Values in the order a long list shows them: those that would match
 * something first, most games first, then by name. Those that would match
 * nothing sink to the bottom.
 */
export const rankFacets = (values: readonly FacetValue[], locale: string): FacetValue[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...values].sort(
    (a, b) =>
      Number(b.count > 0) - Number(a.count > 0) ||
      b.count - a.count ||
      collator.compare(a.name, b.name),
  )
}

/** The lowest and highest value a number filter takes in the library, ignoring games with none. */
export const extentOf = (values: Float64Array): [number, number] | undefined => {
  let low = Infinity
  let high = -Infinity
  for (const value of values) {
    if (Number.isNaN(value)) continue
    if (value < low) low = value
    if (value > high) high = value
  }
  return low === Infinity ? undefined : [low, high]
}
