import { describe, expect, it } from 'vitest'

import {
  completionOf,
  namesArrangement,
  readRemembered,
  rememberChoice,
  rememberedOf,
  writeRemembered,
} from '@/domain/library/remembered'

const defaults = {
  view: 'shelf',
  group: 'platform',
  sort: { key: 'title', descending: false },
} as const

describe('the remembered arrangement (issue 149)', () => {
  it('keeps only what differs from the defaults', () => {
    expect(rememberedOf(defaults)).toEqual({})
    expect(
      rememberedOf({ view: 'wall', group: 'status', sort: { key: 'title', descending: true } }),
    ).toEqual({ view: 'wall', group: 'status', sort: '-title' })
    expect(rememberedOf({ ...defaults, sort: { key: 'random', descending: false } })).toEqual({
      sort: 'random',
    })
  })

  it('writes the cookie and reads it back', () => {
    const remembered = { view: 'list', group: 'year', sort: '-rating' } as const
    const text = writeRemembered(remembered)
    expect(decodeURIComponent(text)).toBe('view=list&group=year&sort=-rating')
    expect(text).not.toMatch(/[;,\s=&]/)
    expect(readRemembered(text)).toEqual(remembered)
    expect(writeRemembered({})).toBe('')
  })

  it('reads nothing it does not know: a removed sort or grouping is the default', () => {
    expect(readRemembered(undefined)).toEqual({})
    expect(readRemembered('')).toEqual({})
    expect(readRemembered('%E0%A4%A')).toEqual({})
    expect(readRemembered(encodeURIComponent('view=cube&group=colour&sort=-mood'))).toEqual({})
    expect(readRemembered(encodeURIComponent('view=wall&group=<script>'))).toEqual({
      view: 'wall',
    })
    expect(readRemembered(encodeURIComponent('view=shelf&sort=title'))).toEqual({})
    // A shuffle has no direction, and its seed is never kept.
    expect(readRemembered(encodeURIComponent('sort=-random&seed=abc'))).toEqual({
      sort: 'random',
    })
  })

  it('knows an address that names an arrangement, even wrongly', () => {
    expect(namesArrangement({})).toBe(false)
    expect(namesArrangement({ q: 'status:playing', seed: 'k3x9', view: null })).toBe(false)
    expect(namesArrangement({ view: 'list' })).toBe(true)
    expect(namesArrangement({ group: 'cube' })).toBe(true)
    expect(namesArrangement({ sort: '' })).toBe(true)
  })

  it('completes an address with what is remembered, and a shuffle with a new seed', () => {
    const seed = () => 'n3w'
    expect(completionOf({}, { smart: false, seed })).toBeUndefined()
    expect(completionOf({ view: 'wall', sort: '-title' }, { smart: false, seed })).toEqual({
      view: 'wall',
      sort: '-title',
    })
    expect(completionOf({ sort: 'random' }, { smart: false, seed })).toEqual({
      sort: 'random',
      seed: 'n3w',
    })
  })

  it('gives a smart shelf only the view: its grouping and sort are its own', () => {
    const remembered = { view: 'list', group: 'status', sort: 'random' } as const
    expect(completionOf(remembered, { smart: true })).toEqual({ view: 'list' })
    expect(completionOf({ group: 'status' }, { smart: true })).toBeUndefined()
  })

  it('remembers the library as a choice leaves it', () => {
    const before = { view: 'wall', group: 'status' } as const
    expect(rememberChoice(before, { ...defaults, view: 'list' }, { smart: false })).toEqual({
      view: 'list',
    })
    expect(rememberChoice(before, defaults, { smart: false })).toEqual({})
  })

  it('remembers only the view from a smart shelf, and keeps the rest', () => {
    const before = { view: 'wall', group: 'status', sort: '-added' } as const
    expect(
      rememberChoice(before, { view: 'list', group: 'year', sort: defaults.sort }, { smart: true }),
    ).toEqual({ view: 'list', group: 'status', sort: '-added' })
    expect(rememberChoice(before, { ...defaults, group: 'year' }, { smart: true })).toEqual({
      group: 'status',
      sort: '-added',
    })
  })
})
