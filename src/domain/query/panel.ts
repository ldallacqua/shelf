import {
  isDateKey,
  isListKey,
  isNumberKey,
  type DateKey,
  type ListKey,
  type NumberKey,
} from './keys'
import { readDate, readNumber } from './parse'
import { conjuncts, isAboutKey, join, type Comparison, type Problem, type QueryNode } from './tree'
import { writeQuery } from './write'

/**
 * The filter as the panel shows it (spec 5.2): groups joined by or, each a
 * set of conditions joined by and. Per list key, the values included (any
 * of them, or all) and the values excluded; per number or date, one range.
 *
 * The panel edits the tree in place: changing a key replaces that key's
 * conditions where they stood and leaves the rest of the text as written,
 * so the panel and the text stay two views of one filter.
 */

export type RangeKey = NumberKey | DateKey

/** A list filter in the panel: each value off, included or excluded. */
export type ListCondition = {
  include: string[]
  /** All of the included values, not any of them. */
  all: boolean
  exclude: string[]
}

export type RangeCondition = Comparison<number> | Comparison<string>

export type PanelGroup = {
  lists: Partial<Record<ListKey, ListCondition>>
  ranges: Partial<Record<RangeKey, RangeCondition>>
  /** Conditions the panel has no control for (words in the title, groups inside groups). They show as chips. */
  other: QueryNode[]
}

export const NO_CONDITION: ListCondition = { include: [], all: false, exclude: [] }

/** The groups of a filter: the parts of a top-level OR, or the whole filter as one group. */
export const groupsOf = (tree: QueryNode | undefined): QueryNode[] =>
  tree === undefined ? [] : tree.type === 'or' ? tree.children : [tree]

const fromGroups = (groups: readonly (QueryNode | undefined)[]): QueryNode | undefined =>
  join(
    'or',
    groups.filter((group) => group !== undefined),
  )

/** What the panel shows for one group. */
export const readGroup = (group: QueryNode | undefined): PanelGroup => {
  const read: PanelGroup = { lists: {}, ranges: {}, other: [] }
  for (const node of conjuncts(group)) {
    if (node.type === 'term' && isListKey(node.key)) {
      const values = node.values as string[]
      const condition = read.lists[node.key]
      if (!condition) {
        read.lists[node.key] = { include: [...values], all: false, exclude: [] }
      } else if (condition.include.length === 0) {
        condition.include = [...values]
      } else if (values.length === 1 && (condition.all || condition.include.length === 1)) {
        // `genre:rpg genre:strategy`: both.
        condition.all = true
        if (!condition.include.includes(values[0]!)) condition.include.push(values[0]!)
      } else {
        read.other.push(node)
      }
      continue
    }
    if (node.type === 'not' && node.child.type === 'term' && isListKey(node.child.key)) {
      const condition = (read.lists[node.child.key] ??= { include: [], all: false, exclude: [] })
      for (const value of node.child.values as string[]) {
        if (!condition.exclude.includes(value)) condition.exclude.push(value)
      }
      continue
    }
    if (
      node.type === 'term' &&
      (isNumberKey(node.key) || isDateKey(node.key)) &&
      node.values.length === 1 &&
      !read.ranges[node.key]
    ) {
      read.ranges[node.key] = node.values[0] as RangeCondition
      continue
    }
    read.other.push(node)
  }
  return read
}

/** The panel's view of a whole filter: one group at least, so there is always somewhere to start. */
export const readPanel = (tree: QueryNode | undefined): PanelGroup[] => {
  const groups = groupsOf(tree)
  return (groups.length > 0 ? groups : [undefined]).map(readGroup)
}

/** The terms that say a list condition, in the shape the parser makes. */
export const listTerms = (key: ListKey, condition: ListCondition): QueryNode[] => {
  const nodes: QueryNode[] = []
  if (condition.include.length > 0) {
    if (condition.all) {
      for (const value of condition.include) nodes.push({ type: 'term', key, values: [value] })
    } else {
      nodes.push({ type: 'term', key, values: [...condition.include] })
    }
  }
  if (condition.exclude.length > 0) {
    nodes.push({ type: 'not', child: { type: 'term', key, values: [...condition.exclude] } })
  }
  return nodes
}

const rangeTerm = (key: RangeKey, range: RangeCondition | undefined): QueryNode[] =>
  range ? [{ type: 'term', key, values: [range] } as QueryNode] : []

/**
 * A group with one key's conditions replaced: the new ones stand where the
 * first of the old ones stood, or at the end.
 */
const replaceKey = (
  group: QueryNode | undefined,
  key: string,
  nodes: readonly QueryNode[],
): QueryNode | undefined => {
  const parts = conjuncts(group)
  const first = parts.findIndex((node) => isAboutKey(node, key))
  const kept = parts.filter((node) => !isAboutKey(node, key))
  const at =
    first < 0 ? kept.length : parts.slice(0, first).filter((n) => !isAboutKey(n, key)).length
  kept.splice(at, 0, ...nodes)
  return join('and', kept)
}

const editGroup = (
  tree: QueryNode | undefined,
  group: number,
  edit: (node: QueryNode | undefined) => QueryNode | undefined,
): QueryNode | undefined => {
  const groups: (QueryNode | undefined)[] = [...groupsOf(tree)]
  // One past the last is a new group, joined to the others by or.
  if (group > groups.length || group < 0) return tree
  groups[group] = edit(groups[group])
  // A group with nothing left in it is gone, not "match everything".
  return fromGroups(groups)
}

/** Sets one list key's condition in one group. */
export const setList = (
  tree: QueryNode | undefined,
  group: number,
  key: ListKey,
  condition: ListCondition,
): QueryNode | undefined =>
  editGroup(tree, group, (node) => replaceKey(node, key, listTerms(key, condition)))

/** Sets one number or date key's range in one group. No range removes it. */
export const setRange = (
  tree: QueryNode | undefined,
  group: number,
  key: RangeKey,
  range: RangeCondition | undefined,
): QueryNode | undefined =>
  editGroup(tree, group, (node) => replaceKey(node, key, rangeTerm(key, range)))

/** Sets a list key's condition in every group: what the status row does. */
export const setListEverywhere = (
  tree: QueryNode | undefined,
  key: ListKey,
  condition: ListCondition,
): QueryNode | undefined => {
  const groups = groupsOf(tree)
  if (groups.length <= 1) return setList(tree, 0, key, condition)
  return fromGroups(groups.map((group) => replaceKey(group, key, listTerms(key, condition))))
}

/** The values every group includes for a key, when they all agree; otherwise none. */
export const sharedInclude = (tree: QueryNode | undefined, key: ListKey): string[] | undefined => {
  const groups = readPanel(tree)
  const first = groups[0]?.lists[key]
  for (const group of groups) {
    const condition = group.lists[key]
    if (!condition || condition.exclude.length > 0) return undefined
    if (condition.include.join() !== first?.include.join()) return undefined
  }
  return first?.include
}

export const removeGroup = (tree: QueryNode | undefined, group: number): QueryNode | undefined =>
  editGroup(tree, group, () => undefined)

/** One condition as a removable chip: which group, and its place in that group. */
export type Chip = { group: number; index: number; node: QueryNode }

export const chipsOf = (tree: QueryNode | undefined): Chip[][] =>
  groupsOf(tree).map((group, at) =>
    conjuncts(group).map((node, index) => ({ group: at, index, node })),
  )

export const removeChip = (tree: QueryNode | undefined, chip: Chip): QueryNode | undefined =>
  editGroup(tree, chip.group, (group) =>
    join(
      'and',
      conjuncts(group).filter((_, index) => index !== chip.index),
    ),
  )

/**
 * The text for an edited filter. What could not be understood before is
 * kept at the end, so it is still shown, struck through, until it is
 * removed on purpose.
 */
export const textWith = (tree: QueryNode | undefined, problems: readonly Problem[]): string =>
  [writeQuery(tree), ...problems.map((problem) => problem.text)].filter(Boolean).join(' ')

/** The text without one of its problems. */
export const withoutProblem = (text: string, problem: Problem): string =>
  `${text.slice(0, problem.from)} ${text.slice(problem.to)}`.replace(/\s+/g, ' ').trim()

/** The two boxes a range is edited in, and anything they cannot show (`<10`, `>2020`). */
export type RangeInputs = { from: string; to: string; written?: string }

export const rangeInputs = (range: RangeCondition | undefined): RangeInputs => {
  if (!range) return { from: '', to: '' }
  switch (range.op) {
    case 'eq':
      return { from: String(range.value), to: String(range.value) }
    case 'ge':
      return { from: String(range.value), to: '' }
    case 'le':
      return { from: '', to: String(range.value) }
    case 'range':
      return { from: String(range.from), to: String(range.to) }
    case 'lt':
      return { from: '', to: '', written: `<${range.value}` }
    case 'gt':
      return { from: '', to: '', written: `>${range.value}` }
  }
}

/**
 * The range two boxes describe: both ends, one, or none. `null` when either
 * box holds something that is not a number (or, for a date, not a year, a
 * month or a day).
 */
export const rangeFrom = (
  key: RangeKey,
  from: string,
  to: string,
): RangeCondition | undefined | null => {
  const read = isNumberKey(key) ? readNumber : readDate
  const low = from.trim()
  const high = to.trim()
  const a = low === '' ? undefined : read(low)
  const b = high === '' ? undefined : read(high)
  if ((low !== '' && a === undefined) || (high !== '' && b === undefined)) return null
  if (a === undefined && b === undefined) return undefined
  if (a === undefined) return { op: 'le', value: b! } as RangeCondition
  if (b === undefined) return { op: 'ge', value: a } as RangeCondition
  if (a === b) return { op: 'eq', value: a } as RangeCondition
  return { op: 'range', from: a, to: b } as RangeCondition
}
