import type { Comparison, QueryNode, Term } from './tree'

/**
 * Writes a tree back as the filter language, in one canonical spelling:
 * reading the text it writes gives the same tree again. This is the text the
 * address and a smart shelf keep.
 *
 * Groups joined by `OR` inside an `and` need brackets; an `and` inside an
 * `OR` gets them too, though they change nothing, because
 * `(owned:ps5 format:physical) OR rating:>=9` is easier to read without
 * knowing which binds first.
 */

const OPERATORS = { lt: '<', le: '<=', gt: '>', ge: '>=' } as const

export const writeComparison = (comparison: Comparison<number> | Comparison<string>): string => {
  switch (comparison.op) {
    case 'eq':
      return String(comparison.value)
    case 'range':
      return `${comparison.from}..${comparison.to}`
    default:
      return `${OPERATORS[comparison.op]}${comparison.value}`
  }
}

export const writeTerm = (term: Term): string => {
  const values = term.values.map((value) =>
    typeof value === 'string' ? value : writeComparison(value as Comparison<number>),
  )
  return `${term.key}:${values.join(',')}`
}

type Context = 'top' | 'and' | 'or' | 'not'

const write = (node: QueryNode, context: Context): string => {
  switch (node.type) {
    case 'term':
      return writeTerm(node)
    case 'text':
      return node.quoted ? `"${node.text}"` : node.text
    case 'not':
      return `-${write(node.child, 'not')}`
    case 'and': {
      const text = node.children.map((child) => write(child, 'and')).join(' ')
      return context === 'or' || context === 'not' ? `(${text})` : text
    }
    case 'or': {
      const text = node.children.map((child) => write(child, 'or')).join(' OR ')
      return context === 'and' || context === 'not' ? `(${text})` : text
    }
  }
}

/** The text for a filter. No tree is no filter: the empty text. */
export const writeQuery = (tree: QueryNode | undefined): string =>
  tree === undefined ? '' : write(tree, 'top')
