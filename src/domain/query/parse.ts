import {
  closedValues,
  isDateKey,
  isFilterKey,
  isListKey,
  isNumberKey,
  longNames,
  type DateKey,
  type ListKey,
  type NumberKey,
} from './keys'
import {
  join,
  negate,
  type Comparison,
  type ParsedQuery,
  type Problem,
  type ProblemReason,
  type QueryNode,
  type Term,
} from './tree'

/**
 * Reads the filter language (spec 5.3) into a tree. A space means and, `OR`
 * in capitals means or, brackets group, and a leading `-` negates:
 *
 *     query  = or
 *     or     = and { "OR" and }
 *     and    = unary { unary }
 *     unary  = "-" unary | "(" or ")" | phrase | word
 *     word   = key ":" value { "," value } | text
 *
 * It never throws. Whatever it cannot understand is left out of the tree and
 * listed as a problem with its place in the text, so a hand-edited address
 * still loads and the interface can show what was ignored.
 */

type Token =
  | { type: 'word'; text: string; from: number; to: number }
  | { type: 'phrase'; text: string; from: number; to: number }
  | { type: 'not' | 'or' | 'open' | 'close'; from: number; to: number }

const SPACE = /\s/
/** A word ends at a space, a bracket or a quote. */
const BREAK = /[\s()"]/

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = []
  let at = 0
  while (at < input.length) {
    const char = input[at]!
    if (SPACE.test(char)) {
      at += 1
    } else if (char === '(' || char === ')') {
      tokens.push({ type: char === '(' ? 'open' : 'close', from: at, to: at + 1 })
      at += 1
    } else if (char === '"') {
      // A phrase still being typed runs to the end.
      const end = input.indexOf('"', at + 1)
      const to = end < 0 ? input.length : end + 1
      tokens.push({ type: 'phrase', text: input.slice(at + 1, end < 0 ? to : end), from: at, to })
      at = to
    } else if (char === '-') {
      // A dash with a space after it is punctuation, as in a title, not a "not".
      const next = input[at + 1]
      if (next !== undefined && !SPACE.test(next))
        tokens.push({ type: 'not', from: at, to: at + 1 })
      at += 1
    } else {
      let end = at
      while (end < input.length && !BREAK.test(input[end]!)) end += 1
      const text = input.slice(at, end)
      tokens.push(
        text === 'OR'
          ? { type: 'or', from: at, to: end }
          : { type: 'word', text, from: at, to: end },
      )
      at = end
    }
  }
  return tokens
}

const WORD = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NUMBER = /^\d{1,7}(?:\.\d{1,3})?$/
const DATE = /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/

const isDate = (text: string): boolean => {
  if (!DATE.test(text)) return false
  const [year, month = 1, day = 1] = text.split('-').map(Number) as [number, number?, number?]
  if (month < 1 || month > 12) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/** `8`, `>=8`, `<10`, `2015..2020`, `2015..` or `..2020`, for numbers or dates. */
const readComparison = <T>(
  text: string,
  read: (text: string) => T | undefined,
): Comparison<T> | undefined => {
  const compare = /^(>=|<=|>|<|=)(.*)$/.exec(text)
  if (compare) {
    const value = read(compare[2]!)
    if (value === undefined) return undefined
    const op = ({ '>=': 'ge', '<=': 'le', '>': 'gt', '<': 'lt', '=': 'eq' } as const)[
      compare[1] as '>=' | '<=' | '>' | '<' | '='
    ]
    return { op, value }
  }
  const dots = text.indexOf('..')
  if (dots >= 0) {
    const left = text.slice(0, dots)
    const right = text.slice(dots + 2)
    if (left === '' && right === '') return undefined
    const from = left === '' ? undefined : read(left)
    const to = right === '' ? undefined : read(right)
    if ((left !== '' && from === undefined) || (right !== '' && to === undefined)) return undefined
    if (from === undefined) return { op: 'le', value: to! }
    if (to === undefined) return { op: 'ge', value: from }
    return { op: 'range', from, to }
  }
  const value = read(text)
  return value === undefined ? undefined : { op: 'eq', value }
}

export const readNumber = (text: string): number | undefined =>
  NUMBER.test(text) ? Number(text) : undefined

export const readDate = (text: string): string | undefined => (isDate(text) ? text : undefined)

/** The word a list value is kept as: lower case, and IGDB's long names in their short form. */
export const listValue = (key: ListKey, text: string): string | undefined => {
  const word = text.toLowerCase()
  if (!WORD.test(word)) return undefined
  const closed = closedValues[key]
  if (closed && !closed.includes(word)) return undefined
  return longNames[key]?.[word] ?? word
}

class Parser {
  private at = 0
  readonly problems: Problem[] = []
  private readonly input: string
  private readonly tokens: Token[]

  constructor(input: string, tokens: Token[]) {
    this.input = input
    this.tokens = tokens
  }

  parse(): QueryNode | undefined {
    const parts: QueryNode[] = []
    while (this.peek()) {
      const node = this.parseOr()
      if (node) parts.push(node)
      const stray = this.peek()
      if (stray?.type === 'close') {
        this.problem(stray.from, stray.to, 'stray-bracket')
        this.at += 1
      }
    }
    return join('and', parts)
  }

  private peek(): Token | undefined {
    return this.tokens[this.at]
  }

  private problem(from: number, to: number, reason: ProblemReason, text?: string) {
    this.problems.push({ from, to, text: text ?? this.input.slice(from, to), reason })
  }

  private parseOr(): QueryNode | undefined {
    const segments: (QueryNode | undefined)[] = [this.parseAnd()]
    const ors: Token[] = []
    while (this.peek()?.type === 'or') {
      ors.push(this.peek()!)
      this.at += 1
      segments.push(this.parseAnd())
    }
    // An OR needs something on both sides. Each gap is reported once, at the OR after it, or
    // at the last OR when the gap is at the end.
    ors.forEach((or, index) => {
      const last = index === ors.length - 1
      if (!segments[index] || (last && !segments[index + 1])) {
        this.problem(or.from, or.to, 'dangling-or')
      }
    })
    return join(
      'or',
      segments.filter((segment) => segment !== undefined),
    )
  }

  private parseAnd(): QueryNode | undefined {
    const nodes: QueryNode[] = []
    for (let token = this.peek(); token; token = this.peek()) {
      if (token.type === 'or' || token.type === 'close') break
      const node = this.parseUnary()
      if (node) nodes.push(node)
    }
    return join('and', nodes)
  }

  private parseUnary(): QueryNode | undefined {
    const token = this.peek()!
    this.at += 1
    switch (token.type) {
      case 'not': {
        const next = this.peek()
        if (!next || next.type === 'or' || next.type === 'close') {
          this.problem(token.from, token.to, 'nothing-to-negate')
          return undefined
        }
        // What it negates says for itself if it cannot be understood.
        const operand = this.parseUnary()
        return operand ? negate(operand) : undefined
      }
      case 'open': {
        const inner = this.parseOr()
        const close = this.peek()
        if (close?.type === 'close') {
          this.at += 1
          if (!inner && this.input.slice(token.to, close.from).trim() === '') {
            this.problem(token.from, close.to, 'empty-brackets')
          }
        } else {
          this.problem(token.from, token.to, 'unclosed-bracket')
        }
        return inner
      }
      case 'phrase': {
        const text = token.text.trim()
        return text ? { type: 'text', text, quoted: true } : undefined
      }
      case 'word':
        return this.parseWord(token)
      default:
        return undefined
    }
  }

  private parseWord(token: Extract<Token, { type: 'word' }>): QueryNode | undefined {
    const colon = token.text.indexOf(':')
    if (colon <= 0) return { type: 'text', text: token.text, quoted: false }

    const key = token.text.slice(0, colon).toLowerCase()
    const raw = token.text.slice(colon + 1)
    if (!isFilterKey(key)) {
      // "Halo: Reach" is a title, not a filter.
      if (raw === '') return { type: 'text', text: token.text, quoted: false }
      this.problem(token.from, token.to, 'unknown-key')
      return undefined
    }
    if (raw === '') {
      this.problem(token.from, token.to, 'missing-value')
      return undefined
    }

    const start = token.from + colon + 1
    const pieces: { text: string; from: number }[] = []
    let offset = 0
    for (const text of raw.split(',')) {
      // An empty piece is a comma still being typed past, not a mistake.
      if (text !== '') pieces.push({ text, from: start + offset })
      offset += text.length + 1
    }

    const values: unknown[] = []
    const seen = new Set<string>()
    for (const piece of pieces) {
      const value = isListKey(key)
        ? listValue(key, piece.text)
        : isNumberKey(key)
          ? readComparison(piece.text, readNumber)
          : readComparison(piece.text, readDate)
      if (value === undefined) {
        this.problem(
          piece.from,
          piece.from + piece.text.length,
          'bad-value',
          `${key}:${piece.text}`,
        )
        continue
      }
      const id = JSON.stringify(value)
      if (seen.has(id)) continue
      seen.add(id)
      values.push(value)
    }
    if (values.length === 0) return undefined

    if (isListKey(key)) return { type: 'term', key, values: values as string[] }
    if (isNumberKey(key)) {
      return { type: 'term', key: key as NumberKey, values: values as Comparison<number>[] }
    }
    if (isDateKey(key)) {
      return { type: 'term', key: key as DateKey, values: values as Comparison<string>[] }
    }
    return undefined
  }
}

/** Reads a filter's text. Never throws; see `Problem` for what it leaves out. */
export const parseQuery = (input: string): ParsedQuery => {
  const parser = new Parser(input, tokenize(input))
  const tree = parser.parse()
  const problems = [...parser.problems].sort((a, b) => a.from - b.from)
  return tree ? { tree, problems } : { problems }
}

/** Builds a term from its parts, in the canonical shape the parser makes. */
export const termOf = (key: Term['key'], values: readonly unknown[]): Term =>
  ({ type: 'term', key, values: [...values] }) as Term
