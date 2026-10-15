import type { DateKey, ListKey, NumberKey } from './keys'

/**
 * A filter, as a tree. The text in the address, the panel and the API are
 * three faces of it: `parseQuery` makes one from text, `writeQuery` turns it
 * back into text, and the panel edits it.
 *
 * Trees are kept in one canonical shape, so two filters that mean the same
 * thing in the same words are equal: an `and` or `or` has at least two
 * children and none of its own kind, a `not` never holds a `not`, and a
 * term's values are in the order written, each once.
 */

/** How a number or a date is compared. `range` includes both ends. */
export type Comparison<T> =
  | { op: 'eq'; value: T }
  | { op: 'lt' | 'le' | 'gt' | 'ge'; value: T }
  | { op: 'range'; from: T; to: T }

export type ListTerm = { type: 'term'; key: ListKey; values: string[] }
export type NumberTerm = { type: 'term'; key: NumberKey; values: Comparison<number>[] }
/** Dates are kept as written: `2025`, `2025-06` or `2025-06-14`. */
export type DateTerm = { type: 'term'; key: DateKey; values: Comparison<string>[] }
export type Term = ListTerm | NumberTerm | DateTerm

/** Words in the title. `quoted` is a phrase that was written in quotes. */
export type TextNode = { type: 'text'; text: string; quoted: boolean }

export type QueryNode =
  | Term
  | TextNode
  | { type: 'and'; children: QueryNode[] }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'not'; child: QueryNode }

/** Why part of a filter was not understood. The interface words each one. */
export type ProblemReason =
  | 'unknown-key'
  | 'bad-value'
  | 'missing-value'
  | 'unclosed-bracket'
  | 'stray-bracket'
  | 'empty-brackets'
  | 'dangling-or'
  | 'nothing-to-negate'

/**
 * A part of the text that was ignored, and where it is: `from` and `to` are
 * positions in the text, so a field can mark it.
 */
export type Problem = { from: number; to: number; text: string; reason: ProblemReason }

/** What a filter's text says. No tree means no condition: every game. */
export type ParsedQuery = { tree?: QueryNode; problems: Problem[] }

export const isTerm = (node: QueryNode): node is Term => node.type === 'term'

/** Joins nodes with `and` or `or` in the canonical shape: flattened, and never a group of one. */
export const join = (type: 'and' | 'or', nodes: readonly QueryNode[]): QueryNode | undefined => {
  const children = nodes.flatMap((node) => (node.type === type ? node.children : [node]))
  if (children.length === 0) return undefined
  if (children.length === 1) return children[0]
  return { type, children }
}

/** The opposite of a node. Two negations cancel. */
export const negate = (node: QueryNode): QueryNode =>
  node.type === 'not' ? node.child : { type: 'not', child: node }

/** The conditions a filter joins with `and` at its top: the parts a chip can remove one by one. */
export const conjuncts = (tree: QueryNode | undefined): QueryNode[] =>
  tree === undefined ? [] : tree.type === 'and' ? tree.children : [tree]

/** Whether two trees say the same thing in the same words. */
export const sameQuery = (a: QueryNode | undefined, b: QueryNode | undefined): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

/** Whether a top-level condition is about one key: `genre:rpg`, or `-genre:rpg`. */
export const isAboutKey = (node: QueryNode, key: string): boolean =>
  (node.type === 'term' && node.key === key) ||
  (node.type === 'not' && node.child.type === 'term' && node.child.key === key)

/** Whether a filter says anything about a key, anywhere in it. */
export const mentions = (tree: QueryNode | undefined, key: string): boolean => {
  if (!tree) return false
  switch (tree.type) {
    case 'term':
      return tree.key === key
    case 'text':
      return false
    case 'not':
      return mentions(tree.child, key)
    default:
      return tree.children.some((child) => mentions(child, key))
  }
}
