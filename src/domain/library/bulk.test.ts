import { describe, expect, it } from 'vitest'

import type { Candidate, PlatformLabel } from '@/domain/library/adding'
import {
  confidenceOf,
  parseLine,
  parseList,
  rankForLine,
  resolvePlatform,
  startingPlatform,
  titleKeyOf,
} from '@/domain/library/bulk'

const candidate = (title: string, more: Partial<Candidate> = {}): Candidate => ({
  igdbId: title.length,
  slug: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  kind: 'main',
  platforms: [6],
  alsoOn: [],
  ports: [],
  ...more,
})

const PLATFORMS: PlatformLabel[] = [
  { id: 130, key: 'switch', name: 'Nintendo Switch', short: 'Switch' },
  { id: 508, key: 'switch-2', name: 'Nintendo Switch 2', short: 'Switch 2' },
  { id: 167, key: 'ps5', name: 'PlayStation 5', short: 'PS5' },
  { id: 7, key: 'ps1', name: 'PlayStation', short: 'PS1' },
  { id: 169, key: 'xbox-series', name: 'Xbox Series X|S', short: 'Series X|S' },
  { id: 6, key: 'pc', name: 'PC', short: 'PC' },
]

describe('a pasted line', () => {
  it('is a title, with a year in brackets and a platform in square brackets understood', () => {
    expect(parseLine('Hollow Knight (2017) [Switch]')).toEqual({
      text: 'Hollow Knight (2017) [Switch]',
      title: 'Hollow Knight',
      year: 2017,
      platform: 'Switch',
    })
    expect(parseLine('[PS5] Returnal (2021)')).toMatchObject({
      title: 'Returnal',
      year: 2021,
      platform: 'PS5',
    })
    expect(parseLine('Celeste')).toEqual({ text: 'Celeste', title: 'Celeste' })
  })

  it('leaves out a list’s bullets and numbers, and tidies spaces', () => {
    expect(parseLine('  - Hades  ')?.title).toBe('Hades')
    expect(parseLine('• Hades')?.title).toBe('Hades')
    expect(parseLine('12. Outer   Wilds')?.title).toBe('Outer Wilds')
    expect(parseLine('3) Inside')?.title).toBe('Inside')
  })

  it('keeps numbers that are part of the title', () => {
    expect(parseLine('1942')?.title).toBe('1942')
    expect(parseLine('2064: Read Only Memories')?.title).toBe('2064: Read Only Memories')
  })

  it('keeps brackets that are not a year', () => {
    expect(parseLine('Doom (classic)')).toEqual({ text: 'Doom (classic)', title: 'Doom (classic)' })
    expect(parseLine('Pong (1712)')?.year).toBeUndefined()
  })

  it('is nothing when it names no game', () => {
    expect(parseLine('')).toBeUndefined()
    expect(parseLine('   ')).toBeUndefined()
    expect(parseLine('(2017) [Switch]')).toBeUndefined()
  })

  it('is cut at 200 characters', () => {
    expect(parseLine('x'.repeat(500))?.title).toHaveLength(200)
  })
})

describe('a pasted list', () => {
  it('is its lines that name a game, in order, blank lines left out', () => {
    expect(parseList('Hades\r\n\nCeleste (2018)\n  \nInside').map((line) => line.title)).toEqual([
      'Hades',
      'Celeste',
      'Inside',
    ])
  })
})

describe('comparing titles', () => {
  it('ignores case, accents, apostrophes, full stops and other punctuation', () => {
    expect(titleKeyOf("Assassin's Creed II")).toBe(titleKeyOf('assassins creed ii'))
    expect(titleKeyOf('L.A. Noire')).toBe(titleKeyOf('LA Noire'))
    expect(titleKeyOf('Pokémon Red')).toBe(titleKeyOf('Pokemon Red'))
    expect(titleKeyOf('Metal Gear Solid 2: Sons of Liberty')).toBe(
      titleKeyOf('Metal Gear Solid 2 - Sons of Liberty'),
    )
    expect(titleKeyOf('Ratchet & Clank')).toBe(titleKeyOf('Ratchet and Clank'))
    expect(titleKeyOf('Half-Life 2')).not.toBe(titleKeyOf('Half-Life'))
  })
})

describe('a platform in square brackets', () => {
  it('is found by its name, its short name, its key, or a common alias', () => {
    expect(resolvePlatform('Switch', PLATFORMS)?.id).toBe(130)
    expect(resolvePlatform('nintendo switch', PLATFORMS)?.id).toBe(130)
    expect(resolvePlatform('Switch 2', PLATFORMS)?.id).toBe(508)
    expect(resolvePlatform('ps5', PLATFORMS)?.id).toBe(167)
    expect(resolvePlatform('PlayStation', PLATFORMS)?.id).toBe(7)
    expect(resolvePlatform('Xbox Series X', PLATFORMS)?.id).toBe(169)
    expect(resolvePlatform('XSX', PLATFORMS)?.id).toBe(169)
    expect(resolvePlatform('Steam', PLATFORMS)?.id).toBe(6)
  })

  it('is nothing when it names no platform', () => {
    expect(resolvePlatform('my shelf', PLATFORMS)).toBeUndefined()
    expect(resolvePlatform('—', PLATFORMS)).toBeUndefined()
  })
})

describe('matching a line', () => {
  const line = parseLine('Prince of Persia (2008) [PS5]')!

  it('puts the title as written first, then the year, then the platform, then IGDB’s order', () => {
    const ranked = rankForLine(
      line,
      [
        candidate('Prince of Persia: The Sands of Time', { igdbId: 1, year: 2003 }),
        candidate('Prince of Persia', { igdbId: 2, year: 1989 }),
        candidate('Prince of Persia', { igdbId: 3, year: 2008 }),
        candidate('Prince of Persia', { igdbId: 4, year: 2008, platforms: [167] }),
      ],
      resolvePlatform(line.platform!, PLATFORMS)?.id,
    )
    expect(ranked.map((each) => each.igdbId)).toEqual([4, 3, 2, 1])
  })

  it('is exact for the title as written, in the year given; close for anything else; none for nothing', () => {
    expect(confidenceOf(line, candidate('Prince of Persia', { year: 2008 }))).toBe('exact')
    expect(confidenceOf(line, candidate('prince of persia', { year: 2008 }))).toBe('exact')
    expect(confidenceOf(line, candidate('Prince of Persia', { year: 1989 }))).toBe('close')
    expect(confidenceOf(line, candidate('Prince of Persia: Warrior Within'))).toBe('close')
    expect(confidenceOf(parseLine('Prince of Persia')!, candidate('Prince of Persia'))).toBe(
      'exact',
    )
    expect(confidenceOf(line, undefined)).toBe('none')
  })
})

describe('the platform a row starts on', () => {
  const game = candidate('Hades', { platforms: [6, 130], alsoOn: [167] })
  const habits = { order: [167, 6], formats: {} }

  it('is the one the line names, when the game is on it', () => {
    expect(startingPlatform(game, habits, 130)).toBe(130)
  })

  it('is otherwise the one I own most on, of the game’s, then the game’s first', () => {
    expect(startingPlatform(game, habits, 508)).toBe(167)
    expect(startingPlatform(game, { order: [], formats: {} })).toBe(6)
    expect(startingPlatform(candidate('Nowhere', { platforms: [] }), habits)).toBeUndefined()
  })
})
