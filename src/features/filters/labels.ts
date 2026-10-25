import type { useFormatter, useTranslations } from 'next-intl'

import type { LibraryIndex } from '@/domain/query/evaluate'
import {
  closedValues,
  isDateKey,
  isNumberKey,
  platformFamilies,
  platformKeys,
  type FilterKey,
  type ListKey,
} from '@/domain/query/keys'
import type { Comparison, QueryNode, Term } from '@/domain/query/tree'
import { writeQuery } from '@/domain/query/write'

/**
 * Filters in words: the name of a key, a value, a range, and a condition as
 * a chip says it ("Genre: RPG or Adventure", "Not theme: Horror", "Release
 * year: 2015 to 2020"). Keys stay English in the address; every word here
 * is translated.
 */

type Filters = ReturnType<typeof useTranslations<'Filters'>>
type Library = ReturnType<typeof useTranslations<'Library'>>
type Format = ReturnType<typeof useFormatter>

export type Words = { t: Filters; library: Library; format: Format }

export const keyLabel = (key: FilterKey, { t }: Words): string => t(`keys.${key}`)

/** Whether a value's name comes from IGDB, in English, rather than from our own words. */
export const isIgdbName = (key: ListKey, word: string): boolean =>
  !closedValues[key] && !(platformKeys.includes(key) && platformFamilies.includes(word))

/** A value as the panel and the chips show it. */
export const valueLabel = (
  key: ListKey,
  word: string,
  index: LibraryIndex | undefined,
  { t, library }: Words,
): string => {
  switch (key) {
    case 'status':
      return library(`status.${word as 'playing'}`)
    case 'format':
      return library(`format.${word as 'physical'}`)
    case 'kind':
      return t(`values.kind.${word as 'main'}`)
    case 'has':
      return t(`values.has.${word as 'notes'}`)
    case 'is':
      return t(`values.is.${word as 'featured'}`)
    case 'owned':
    case 'wanted':
    case 'platform':
      if (platformFamilies.includes(word)) return t(`values.family.${word as 'playstation'}`)
  }
  // A name from the library, or the word itself until the library has arrived.
  return index?.lists[key].get(word)?.name ?? word
}

const numberText = (key: FilterKey, value: number, { t, format }: Words): string => {
  const figure = format.number(value, { maximumFractionDigits: 1 })
  switch (key) {
    case 'hours':
    case 'length':
      return t('units.hours', { value: figure })
    case 'rating':
      return t('units.outOfTen', { value: figure })
    default:
      return figure
  }
}

const dateText = (text: string, { format }: Words): string => {
  const [year, month, day] = text.split('-').map(Number) as [number, number?, number?]
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  if (month === undefined) return String(year)
  if (day === undefined) {
    return format.dateTime(date, { year: 'numeric', month: 'long', timeZone: 'UTC' })
  }
  return format.dateTime(date, { dateStyle: 'medium', timeZone: 'UTC' })
}

/** A comparison in words: "8 out of 10 or more", "under 10 h", "2015 to 2020", "June 2025". */
export const comparisonLabel = (
  key: FilterKey,
  comparison: Comparison<number> | Comparison<string>,
  words: Words,
): string => {
  const text = (value: number | string) =>
    typeof value === 'number' ? numberText(key, value, words) : dateText(value, words)
  const { t } = words
  switch (comparison.op) {
    case 'eq':
      return text(comparison.value)
    case 'range':
      return t('compare.range', { from: text(comparison.from), to: text(comparison.to) })
    default: {
      const value = text(comparison.value)
      // Dates read "before" and "after"; numbers "under" and "over".
      const kind = isDateKey(key) ? 'date' : 'number'
      return t(`compare.${kind}.${comparison.op}`, { value })
    }
  }
}

/** A label as it reads inside a sentence: "Not theme", but "Not IGDB rating". */
const inSentence = (label: string): string =>
  /^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label

const termValues = (term: Term, index: LibraryIndex | undefined, words: Words): string[] =>
  isNumberKey(term.key) || isDateKey(term.key)
    ? (term.values as Comparison<number>[]).map((value) => comparisonLabel(term.key, value, words))
    : (term.values as string[]).map((word) => valueLabel(term.key as ListKey, word, index, words))

/** A condition as its chip says it. Anything the chips have no words for is shown as written. */
export const conditionLabel = (
  node: QueryNode,
  index: LibraryIndex | undefined,
  words: Words,
): string => {
  const { t, format } = words
  const values = (term: Term) =>
    format.list(termValues(term, index, words), { type: 'disjunction' })
  if (node.type === 'term') {
    return t('chips.term', { key: keyLabel(node.key, words), values: values(node) })
  }
  if (node.type === 'not' && node.child.type === 'term') {
    return t('chips.not', {
      key: inSentence(keyLabel(node.child.key, words)),
      values: values(node.child),
    })
  }
  if (node.type === 'text') return t('chips.text', { text: node.text })
  if (node.type === 'not' && node.child.type === 'text') {
    return t('chips.notText', { text: node.child.text })
  }
  return writeQuery(node)
}
