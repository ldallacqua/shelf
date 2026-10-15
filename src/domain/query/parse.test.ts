import { describe, expect, it } from 'vitest'

import { parseQuery } from './parse'
import type { QueryNode } from './tree'
import { writeQuery } from './write'

const tree = (text: string) => {
  const parsed = parseQuery(text)
  expect(parsed.problems).toEqual([])
  return parsed.tree
}

const list = (key: string, ...values: string[]): QueryNode =>
  ({ type: 'term', key, values }) as QueryNode
const text = (value: string, quoted = false): QueryNode => ({ type: 'text', text: value, quoted })
const and = (...children: QueryNode[]): QueryNode => ({ type: 'and', children })
const or = (...children: QueryNode[]): QueryNode => ({ type: 'or', children })
const not = (child: QueryNode): QueryNode => ({ type: 'not', child })

describe('the filter language, as the spec writes it (5.3)', () => {
  it('reads a key and a value', () => {
    expect(tree('genre:rpg')).toEqual(list('genre', 'rpg'))
  })

  it('reads a comma as or, within one key', () => {
    expect(tree('genre:rpg,adventure')).toEqual(list('genre', 'rpg', 'adventure'))
  })

  it('reads a space as and', () => {
    expect(tree('genre:rpg genre:strategy')).toEqual(
      and(list('genre', 'rpg'), list('genre', 'strategy')),
    )
  })

  it('reads a leading dash as not', () => {
    expect(tree('-theme:horror')).toEqual(not(list('theme', 'horror')))
  })

  it('reads ranges and comparisons', () => {
    expect(tree('year:2015..2020')).toEqual({
      type: 'term',
      key: 'year',
      values: [{ op: 'range', from: 2015, to: 2020 }],
    })
    expect(tree('rating:>=8')).toEqual({
      type: 'term',
      key: 'rating',
      values: [{ op: 'ge', value: 8 }],
    })
    expect(tree('hours:<10')).toEqual({
      type: 'term',
      key: 'hours',
      values: [{ op: 'lt', value: 10 }],
    })
  })

  it('reads dates as a year, a month or a day', () => {
    expect(tree('completed:2025')).toEqual({
      type: 'term',
      key: 'completed',
      values: [{ op: 'eq', value: '2025' }],
    })
    expect(tree('completed:2025-06..2025-08')).toEqual({
      type: 'term',
      key: 'completed',
      values: [{ op: 'range', from: '2025-06', to: '2025-08' }],
    })
    expect(tree('added:>=2024-03-01')).toEqual({
      type: 'term',
      key: 'added',
      values: [{ op: 'ge', value: '2024-03-01' }],
    })
  })

  it('reads has, and its negation', () => {
    expect(tree('has:notes')).toEqual(list('has', 'notes'))
    expect(tree('-has:rating')).toEqual(not(list('has', 'rating')))
  })

  it('reads brackets and OR, with and binding first', () => {
    expect(tree('(owned:ps5 format:physical) OR rating:>=9')).toEqual(
      or(and(list('owned', 'ps5'), list('format', 'physical')), {
        type: 'term',
        key: 'rating',
        values: [{ op: 'ge', value: 9 }],
      }),
    )
    expect(tree('owned:ps5 format:physical OR status:playing')).toEqual(
      or(and(list('owned', 'ps5'), list('format', 'physical')), list('status', 'playing')),
    )
    expect(tree('status:backlog (genre:rpg OR genre:strategy)')).toEqual(
      and(list('status', 'backlog'), or(list('genre', 'rpg'), list('genre', 'strategy'))),
    )
  })

  it('reads other words as words in the title, and quotes as a phrase', () => {
    expect(tree('zelda')).toEqual(text('zelda'))
    expect(tree('"breath of the wild"')).toEqual(text('breath of the wild', true))
    expect(tree('zelda status:completed')).toEqual(and(text('zelda'), list('status', 'completed')))
  })

  it('negates a group, a phrase or a word', () => {
    expect(tree('-(genre:rpg OR genre:strategy)')).toEqual(
      not(or(list('genre', 'rpg'), list('genre', 'strategy'))),
    )
    expect(tree('-"game of the year"')).toEqual(not(text('game of the year', true)))
    expect(tree('-remastered')).toEqual(not(text('remastered')))
  })
})

describe('reading what a person types', () => {
  it('ignores case in keys and in list values, and keeps a title word as typed', () => {
    expect(tree('Genre:RPG Zelda')).toEqual(and(list('genre', 'rpg'), text('Zelda')))
  })

  it('takes IGDB’s long names and keeps the short ones', () => {
    expect(tree('genre:role-playing-rpg')).toEqual(list('genre', 'rpg'))
    expect(tree('mode:co-operative')).toEqual(list('mode', 'co-op'))
  })

  it('reads a title with a colon as a title', () => {
    expect(tree('halo: reach')).toEqual(and(text('halo:'), text('reach')))
  })

  it('reads a dash with a space after it as punctuation', () => {
    expect(tree('spider-man - miles')).toEqual(and(text('spider-man'), text('miles')))
  })

  it('reads lower-case or as a word, and only OR as or', () => {
    expect(tree('war or peace')).toEqual(and(text('war'), text('or'), text('peace')))
  })

  it('keeps each value once, in the order written', () => {
    expect(tree('genre:rpg,adventure,rpg')).toEqual(list('genre', 'rpg', 'adventure'))
  })

  it('passes over a comma still being typed', () => {
    expect(tree('genre:rpg,')).toEqual(list('genre', 'rpg'))
  })

  it('drops a double negation and needless brackets', () => {
    expect(tree('--zelda')).toEqual(text('zelda'))
    expect(tree('((zelda))')).toEqual(text('zelda'))
    expect(tree('(a b) c')).toEqual(and(text('a'), text('b'), text('c')))
  })

  it('reads open-ended ranges as comparisons', () => {
    expect(tree('year:2015..')).toEqual({
      type: 'term',
      key: 'year',
      values: [{ op: 'ge', value: 2015 }],
    })
    expect(tree('year:..2000')).toEqual({
      type: 'term',
      key: 'year',
      values: [{ op: 'le', value: 2000 }],
    })
  })

  it('reads an empty filter as no filter', () => {
    expect(parseQuery('')).toEqual({ problems: [] })
    expect(parseQuery('   ')).toEqual({ problems: [] })
  })
})

describe('what cannot be understood (spec 5.3)', () => {
  const problems = (input: string) =>
    parseQuery(input).problems.map(({ reason, text: part }) => [reason, part])

  it('ignores an unknown key, and says where it was', () => {
    const parsed = parseQuery('genre:rpg colour:red')
    expect(parsed.tree).toEqual(list('genre', 'rpg'))
    expect(parsed.problems).toEqual([
      { from: 10, to: 20, text: 'colour:red', reason: 'unknown-key' },
    ])
  })

  it('ignores a value its key cannot take, and keeps the rest', () => {
    const parsed = parseQuery('status:playing,finished')
    expect(parsed.tree).toEqual(list('status', 'playing'))
    expect(parsed.problems).toEqual([
      { from: 15, to: 23, text: 'status:finished', reason: 'bad-value' },
    ])
    expect(problems('rating:lots')).toEqual([['bad-value', 'rating:lots']])
    expect(problems('year:20x5')).toEqual([['bad-value', 'year:20x5']])
    expect(problems('completed:2025-13')).toEqual([['bad-value', 'completed:2025-13']])
    expect(problems('completed:2025-02-30')).toEqual([['bad-value', 'completed:2025-02-30']])
    expect(problems('genre:RPG!')).toEqual([['bad-value', 'genre:RPG!']])
    expect(problems('hours:..')).toEqual([['bad-value', 'hours:..']])
  })

  it('ignores a key with no value', () => {
    expect(parseQuery('genre:')).toEqual({
      problems: [{ from: 0, to: 6, text: 'genre:', reason: 'missing-value' }],
    })
  })

  it('reads an unclosed bracket as if it were closed, and says so', () => {
    const parsed = parseQuery('(zelda status:backlog')
    expect(parsed.tree).toEqual(and(text('zelda'), list('status', 'backlog')))
    expect(problems('(zelda status:backlog')).toEqual([['unclosed-bracket', '(']])
  })

  it('ignores a stray bracket, empty brackets, a dangling OR and a dash with nothing after it', () => {
    expect(parseQuery('zelda)').tree).toEqual(text('zelda'))
    expect(problems('zelda)')).toEqual([['stray-bracket', ')']])
    expect(problems('zelda ( )')).toEqual([['empty-brackets', '( )']])
    expect(parseQuery('zelda OR').tree).toEqual(text('zelda'))
    expect(problems('zelda OR')).toEqual([['dangling-or', 'OR']])
    expect(problems('OR zelda')).toEqual([['dangling-or', 'OR']])
    expect(problems('a OR OR b')).toEqual([['dangling-or', 'OR']])
    expect(problems('(a -)')).toEqual([['nothing-to-negate', '-']])
  })

  it('runs a phrase still being typed to the end', () => {
    expect(tree('"breath of')).toEqual(text('breath of', true))
  })

  it('never throws, whatever it is given', () => {
    for (const input of [
      '(((',
      ')))',
      '-',
      '--',
      '""',
      '"',
      ':',
      '::',
      'a:b:c',
      'OR OR',
      '-(',
      '..',
      ',',
    ]) {
      expect(() => parseQuery(input)).not.toThrow()
    }
  })
})

describe('writing a filter back as text', () => {
  const canonical = (input: string) => writeQuery(parseQuery(input).tree)

  it('writes what the spec writes', () => {
    for (const input of [
      'genre:rpg',
      'genre:rpg,adventure',
      'genre:rpg genre:strategy',
      '-theme:horror',
      'year:2015..2020',
      'rating:>=8',
      'hours:<10',
      'completed:2025',
      'completed:2025-06..2025-08',
      'has:notes',
      '-has:rating',
      '(owned:ps5 format:physical) OR rating:>=9',
      'zelda',
      '"breath of the wild"',
    ]) {
      expect(canonical(input)).toBe(input)
    }
  })

  it('writes one spelling for each meaning', () => {
    expect(canonical('  Genre:RPG   Zelda ')).toBe('genre:rpg Zelda')
    expect(canonical('genre:role-playing-rpg')).toBe('genre:rpg')
    expect(canonical('owned:ps5 format:physical OR rating:>=9')).toBe(
      '(owned:ps5 format:physical) OR rating:>=9',
    )
    expect(canonical('year:2015..')).toBe('year:>=2015')
    expect(canonical('rating:=8.50')).toBe('rating:8.5')
    expect(canonical('-(a OR b) c')).toBe('-(a OR b) c')
    expect(canonical('(a OR b) (c OR d)')).toBe('(a OR b) (c OR d)')
    expect(canonical('--zelda')).toBe('zelda')
  })

  it('leaves out what it could not understand', () => {
    expect(canonical('genre:rpg colour:red (')).toBe('genre:rpg')
  })
})
