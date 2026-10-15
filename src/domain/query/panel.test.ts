import { describe, expect, it } from 'vitest'

import {
  chipsOf,
  NO_CONDITION,
  rangeFrom,
  rangeInputs,
  readPanel,
  removeChip,
  removeGroup,
  setList,
  setListEverywhere,
  setRange,
  sharedInclude,
  textWith,
  withoutProblem,
} from './panel'
import { parseQuery } from './parse'
import { writeQuery } from './write'

const tree = (text: string) => parseQuery(text).tree
const text = (node: ReturnType<typeof tree>) => writeQuery(node)

describe('the panel reads a filter (spec 5.2)', () => {
  it('as included and excluded values, any or all, and ranges', () => {
    const [group] = readPanel(tree('genre:rpg,adventure -theme:horror year:2015..2020 zelda'))
    expect(group!.lists.genre).toEqual({ include: ['rpg', 'adventure'], all: false, exclude: [] })
    expect(group!.lists.theme).toEqual({ include: [], all: false, exclude: ['horror'] })
    expect(group!.ranges.year).toEqual({ op: 'range', from: 2015, to: 2020 })
    expect(group!.other).toEqual([{ type: 'text', text: 'zelda', quoted: false }])
  })

  it('reads one term per value as all of them', () => {
    const [group] = readPanel(tree('genre:rpg genre:strategy'))
    expect(group!.lists.genre).toEqual({ include: ['rpg', 'strategy'], all: true, exclude: [] })
  })

  it('keeps what it has no control for, to show as a chip', () => {
    const [group] = readPanel(tree('genre:rpg,adventure genre:strategy (a OR b) year:2001,2004'))
    expect(group!.other.map((node) => writeQuery(node))).toEqual([
      'genre:strategy',
      'a OR b',
      'year:2001,2004',
    ])
  })

  it('reads each part of a top-level OR as a group', () => {
    const groups = readPanel(tree('(owned:ps5 format:physical) OR rating:>=9'))
    expect(groups).toHaveLength(2)
    expect(groups[0]!.lists.owned?.include).toEqual(['ps5'])
    expect(groups[1]!.ranges.rating).toEqual({ op: 'ge', value: 9 })
  })

  it('always has one group to start from', () => {
    expect(readPanel(undefined)).toEqual([{ lists: {}, ranges: {}, other: [] }])
  })
})

describe('the panel edits a filter in place', () => {
  it('replaces a key’s conditions where they stood, and leaves the rest as written', () => {
    const before = tree('zelda genre:rpg status:backlog')
    const after = setList(before, 0, 'genre', {
      include: ['rpg', 'adventure'],
      all: false,
      exclude: ['strategy'],
    })
    expect(text(after)).toBe('zelda genre:rpg,adventure -genre:strategy status:backlog')
  })

  it('adds a new key at the end, and removes one that is emptied', () => {
    expect(
      text(setList(tree('zelda'), 0, 'status', { ...NO_CONDITION, include: ['playing'] })),
    ).toBe('zelda status:playing')
    expect(text(setList(tree('zelda status:playing'), 0, 'status', NO_CONDITION))).toBe('zelda')
    expect(text(setList(undefined, 0, 'genre', { ...NO_CONDITION, include: ['rpg'] }))).toBe(
      'genre:rpg',
    )
  })

  it('writes all-of as one term per value', () => {
    expect(
      text(
        setList(undefined, 0, 'genre', { include: ['rpg', 'strategy'], all: true, exclude: [] }),
      ),
    ).toBe('genre:rpg genre:strategy')
  })

  it('sets and clears a range', () => {
    expect(text(setRange(tree('status:backlog'), 0, 'length', { op: 'lt', value: 10 }))).toBe(
      'status:backlog length:<10',
    )
    expect(text(setRange(tree('length:<10 status:backlog'), 0, 'length', undefined))).toBe(
      'status:backlog',
    )
  })

  it('adds a group joined by or, and removes one', () => {
    const one = tree('owned:ps5 format:physical')
    const two = setRange(one, 1, 'rating', { op: 'ge', value: 9 })
    expect(text(two)).toBe('(owned:ps5 format:physical) OR rating:>=9')
    expect(text(removeGroup(two, 0))).toBe('rating:>=9')
    // Emptying a group removes it, rather than leaving a group that matches everything.
    expect(text(setRange(two, 1, 'rating', undefined))).toBe('owned:ps5 format:physical')
  })

  it('sets the status row in every group, and reads it back only when they agree', () => {
    const groups = tree('genre:rpg OR theme:horror')
    const playing = setListEverywhere(groups, 'status', { ...NO_CONDITION, include: ['playing'] })
    expect(text(playing)).toBe('(genre:rpg status:playing) OR (theme:horror status:playing)')
    expect(sharedInclude(playing, 'status')).toEqual(['playing'])
    expect(sharedInclude(tree('status:playing OR status:backlog'), 'status')).toBeUndefined()
    expect(sharedInclude(tree('genre:rpg'), 'status')).toBeUndefined()
    expect(text(setListEverywhere(playing, 'status', NO_CONDITION))).toBe(
      'genre:rpg OR theme:horror',
    )
  })

  it('round-trips: panel to address to panel gives the same filter (spec 5, done when)', () => {
    let filter = setList(undefined, 0, 'genre', {
      include: ['rpg', 'adventure'],
      all: false,
      exclude: [],
    })
    filter = setList(filter, 0, 'theme', { include: [], all: false, exclude: ['horror'] })
    filter = setList(filter, 0, 'mode', {
      include: ['single-player', 'co-op'],
      all: true,
      exclude: [],
    })
    filter = setRange(filter, 0, 'year', { op: 'range', from: 2015, to: 2020 })
    filter = setRange(filter, 0, 'completed', { op: 'eq', value: '2025-06' })
    filter = setList(filter, 1, 'owned', { include: ['ps5'], all: false, exclude: [] })
    filter = setList(filter, 1, 'format', { include: ['physical'], all: false, exclude: [] })
    const panel = readPanel(filter)
    const address = text(filter)
    expect(readPanel(tree(address))).toEqual(panel)
    expect(text(tree(address))).toBe(address)
  })
})

describe('chips: one per condition (spec 3.1)', () => {
  it('lists each group’s conditions, and removes one', () => {
    const filter = tree('genre:rpg -theme:horror OR status:playing')
    const chips = chipsOf(filter)
    expect(chips.map((group) => group.map((chip) => writeQuery(chip.node)))).toEqual([
      ['genre:rpg', '-theme:horror'],
      ['status:playing'],
    ])
    expect(text(removeChip(filter, chips[0]![1]!))).toBe('genre:rpg OR status:playing')
    expect(text(removeChip(filter, chips[1]![0]!))).toBe('genre:rpg -theme:horror')
  })

  it('keeps what could not be understood, until it is removed on purpose', () => {
    const typed = 'genre:rpg colour:red'
    const parsed = parseQuery(typed)
    const edited = setList(parsed.tree, 0, 'status', { ...NO_CONDITION, include: ['backlog'] })
    expect(textWith(edited, parsed.problems)).toBe('genre:rpg status:backlog colour:red')
    expect(withoutProblem(typed, parsed.problems[0]!)).toBe('genre:rpg')
  })
})

describe('a range in two boxes', () => {
  it('reads both ends, one, or none', () => {
    expect(rangeFrom('year', '2015', '2020')).toEqual({ op: 'range', from: 2015, to: 2020 })
    expect(rangeFrom('year', '2015', '')).toEqual({ op: 'ge', value: 2015 })
    expect(rangeFrom('year', '', '2020')).toEqual({ op: 'le', value: 2020 })
    expect(rangeFrom('rating', '8', '8')).toEqual({ op: 'eq', value: 8 })
    expect(rangeFrom('year', ' ', '')).toBeUndefined()
    expect(rangeFrom('completed', '2025-06', '2025-08')).toEqual({
      op: 'range',
      from: '2025-06',
      to: '2025-08',
    })
  })

  it('refuses what is not a number or a date', () => {
    expect(rangeFrom('year', 'soon', '')).toBeNull()
    expect(rangeFrom('completed', '2025-13', '')).toBeNull()
  })

  it('fills the boxes from a range, and shows what they cannot hold as written', () => {
    expect(rangeInputs({ op: 'range', from: 2015, to: 2020 })).toEqual({ from: '2015', to: '2020' })
    expect(rangeInputs({ op: 'eq', value: '2025' })).toEqual({ from: '2025', to: '2025' })
    expect(rangeInputs({ op: 'lt', value: 10 })).toEqual({ from: '', to: '', written: '<10' })
    expect(rangeInputs(undefined)).toEqual({ from: '', to: '' })
  })
})
