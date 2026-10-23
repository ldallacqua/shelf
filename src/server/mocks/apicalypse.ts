/**
 * Just enough of IGDB's query language (Apicalypse) for the test double to
 * answer the queries Shelf really sends. Anything it does not understand is
 * an error, the way IGDB answers a bad query with 400, so a query that only
 * works against the double cannot slip through.
 */

type Value = number | string | null | number[] | string[]

export type Condition = {
  field: string
  op: '=' | '!=' | '~' | '>' | '>=' | '<' | '<='
  value: Value
}

export type Query = {
  fields: string[]
  where: Condition[]
  search?: string
  sort?: { field: string; descending: boolean }
  limit: number
  offset: number
}

export class QueryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QueryError'
  }
}

const unquote = (text: string): string | undefined => {
  const match = /^"((?:[^"\\]|\\.)*)"$/.exec(text.trim())
  return match?.[1]?.replace(/\\(.)/g, '$1')
}

const parseValue = (raw: string): Value => {
  const text = raw.trim()
  if (text === 'null') return null
  const quoted = unquote(text)
  if (quoted !== undefined) return quoted
  // A list of store ids: `("750920","1091500")`.
  if (/^\(\s*".*"\s*\)$/s.test(text)) {
    return split(text.slice(1, -1), ',').map((part) => {
      const item = unquote(part)
      if (item === undefined) throw new QueryError(`Cannot read the value ${text}`)
      return item
    })
  }
  const list = /^\(([\d\s,]*)\)$/.exec(text)
  if (list) {
    return (list[1] ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(Number)
  }
  const number = Number(text)
  if (text !== '' && Number.isFinite(number)) return number
  throw new QueryError(`Cannot read the value ${text}`)
}

/** Splits on a separator, but not inside double quotes. */
const split = (text: string, separator: string): string[] => {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '\\' && quoted) {
      current += char + (text[i + 1] ?? '')
      i += 1
      continue
    }
    if (char === '"') quoted = !quoted
    if (char === separator && !quoted) {
      parts.push(current)
      current = ''
    } else {
      current += char
    }
  }
  parts.push(current)
  return parts
}

const parseCondition = (text: string): Condition => {
  const match = /^([a-z_.]+)\s*(!=|>=|<=|=|~|>|<)\s*(.+)$/is.exec(text.trim())
  if (!match) throw new QueryError(`Cannot read the condition ${text.trim()}`)
  const [, field = '', op = '=', value = ''] = match
  return { field, op: op as Condition['op'], value: parseValue(value) }
}

export const parseQuery = (body: string): Query => {
  const query: Query = { fields: [], where: [], limit: 10, offset: 0 }
  for (const statement of split(body, ';')) {
    const text = statement.trim()
    if (!text) continue
    const [keyword = '', ...rest] = text.split(/\s+/)
    const argument = text.slice(keyword.length).trim()
    switch (keyword) {
      case 'fields':
        query.fields = argument.split(',').map((field) => field.trim())
        break
      case 'where':
        query.where = split(argument, '&').map(parseCondition)
        break
      case 'search': {
        const search = unquote(argument)
        if (search === undefined) throw new QueryError('search needs a quoted text')
        query.search = search
        break
      }
      case 'sort':
        query.sort = { field: rest[0] ?? 'id', descending: rest[1] === 'desc' }
        break
      case 'limit':
        query.limit = Math.min(500, Number(argument))
        break
      case 'offset':
        query.offset = Number(argument)
        break
      default:
        throw new QueryError(`Unknown statement: ${keyword}`)
    }
  }
  if (!Number.isInteger(query.limit) || !Number.isInteger(query.offset)) {
    throw new QueryError('limit and offset are whole numbers')
  }
  return query
}

type Row = Record<string, unknown>

/** A field's value. `game_type` may be stored expanded, as `{ id }`. */
const read = (row: Row, field: string): unknown => {
  const value = row[field]
  if (typeof value === 'object' && value !== null && !Array.isArray(value) && 'id' in value) {
    return (value as { id: unknown }).id
  }
  return value
}

const matches = (row: Row, condition: Condition): boolean => {
  const actual = read(row, condition.field)
  const { op, value } = condition
  const missing = actual === undefined || actual === null
  if (value === null) return op === '=' ? missing : !missing
  if (missing) return false
  if (Array.isArray(value)) {
    const wanted = new Set<unknown>(value)
    const found = Array.isArray(actual)
      ? actual.some((item) => wanted.has(item))
      : wanted.has(typeof value[0] === 'string' ? String(actual) : actual)
    return op === '!=' ? !found : found
  }
  if (typeof value === 'string') {
    const same = String(actual).toLowerCase() === value.toLowerCase()
    return op === '!=' ? !same : same
  }
  const number = Number(actual)
  switch (op) {
    case '=':
      return Array.isArray(actual) ? actual.includes(value) : number === value
    case '!=':
      return number !== value
    case '>':
      return number > value
    case '>=':
      return number >= value
    case '<':
      return number < value
    case '<=':
      return number <= value
    default:
      return false
  }
}

const normalize = (text: string): string => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Keeps `id` and the top-level fields asked for, as IGDB does. */
const project = (row: Row, fields: readonly string[]): Row => {
  if (fields.includes('*')) return row
  const wanted = new Set(['id', ...fields.map((field) => field.split('.')[0] ?? field)])
  return Object.fromEntries(Object.entries(row).filter(([key]) => wanted.has(key)))
}

export const runQuery = (rows: readonly Row[], query: Query): Row[] => {
  let result = rows.filter((row) => query.where.every((condition) => matches(row, condition)))

  if (query.search !== undefined) {
    const words = normalize(query.search).split(/\s+/).filter(Boolean)
    result = result
      .filter((row) => {
        const name = normalize(String(row.name ?? ''))
        return words.every((word) => name.includes(word))
      })
      // IGDB orders a search by relevance; the double uses how well known a game is.
      .sort((a, b) => Number(b.total_rating_count ?? 0) - Number(a.total_rating_count ?? 0))
  }

  if (query.sort) {
    const { field, descending } = query.sort
    result = [...result].sort((a, b) => {
      const left = Number(read(a, field) ?? 0)
      const right = Number(read(b, field) ?? 0)
      return descending ? right - left : left - right
    })
  }

  return result
    .slice(query.offset, query.offset + query.limit)
    .map((row) => project(row, query.fields))
}

/** The blocks of a multi-query: `query games "name" { ...; };` */
export const parseMultiQuery = (
  body: string,
): { endpoint: string; name: string; body: string }[] => {
  const blocks: { endpoint: string; name: string; body: string }[] = []
  const pattern = /query\s+([a-z_]+)\s+"([^"]*)"\s*\{([\s\S]*?)\}\s*;/g
  for (const match of body.matchAll(pattern)) {
    blocks.push({ endpoint: match[1] ?? '', name: match[2] ?? '', body: match[3] ?? '' })
  }
  if (blocks.length === 0) throw new QueryError('A multi-query needs at least one query block')
  if (blocks.length > 10) throw new QueryError('A multi-query takes at most 10 queries')
  return blocks
}
