import { describe, expect, it } from 'vitest'

import type { IgdbLineage } from '@/domain/igdb/schema'
import {
  buildLineage,
  linkBetween,
  proposeGrouping,
  type FamilyMember,
  type LinkedMember,
} from '@/domain/library/family'

// IGDB game types: 0 main, 3 bundle, 8 remake, 9 remaster, 10 expanded, 11 port.
const record = (
  id: number,
  type: number,
  links: { parent?: number; versionParent?: number } = {},
): IgdbLineage => ({
  id,
  game_type: { id: type },
  ...(links.parent === undefined ? {} : { parent_game: links.parent }),
  ...(links.versionParent === undefined ? {} : { version_parent: links.versionParent }),
})

/** The families ADR 001 found in IGDB, with their real ids. */
const igdb = new Map<number, IgdbLineage>(
  [
    record(472, 0), // Skyrim
    record(37034, 11, { parent: 472 }), // Skyrim, the Switch port
    record(19457, 9, { parent: 472 }), // Skyrim Special Edition
    record(37777, 0), // Shadow of the Tomb Raider
    record(123051, 3, { versionParent: 37777 }), // Definitive Edition, typed "Bundle"
    record(974, 0), // Resident Evil 4, GameCube
    record(1001, 11, { parent: 974 }), // Wii Edition, a port
    record(1002, 9, { parent: 1001 }), // HD, a remaster of the Wii port
    record(132181, 8, { parent: 974 }), // the 2023 remake
    record(1003, 3, { versionParent: 132181 }), // the remake's Deluxe Edition
    record(9927, 0), // Persona 5
    record(114283, 10, { parent: 9927 }), // Persona 5 Royal
    record(2000, 0), // a game with DLC
    record(2001, 1, { parent: 2000 }), // its DLC: not the same game
  ].map((item) => [item.id, item]),
)

const member = (id: number): FamilyMember => {
  const item = igdb.get(id)
  if (!item) throw new Error(`No record ${id}`)
  return { igdbId: id, lineage: buildLineage(item, (above) => igdb.get(above)) }
}

const onShelf = (...ids: number[]): LinkedMember[] =>
  ids.map((id) => ({ ...member(id), entryId: `entry-${id}` }))

describe('buildLineage', () => {
  it('is empty for a game that stands alone', () => {
    expect(member(472).lineage).toEqual([])
  })

  it('follows an edition through version_parent, whatever its type says', () => {
    expect(member(123051).lineage).toEqual([{ igdbId: 37777, via: 'edition' }])
  })

  it('walks every level, nearest first', () => {
    expect(member(1002).lineage).toEqual([
      { igdbId: 1001, via: 'remaster' },
      { igdbId: 974, via: 'port' },
    ])
  })

  it('does not treat DLC as a version of its game', () => {
    expect(member(2001).lineage).toEqual([])
  })

  it('stops at a loop in IGDB’s relations', () => {
    const a = record(1, 11, { parent: 2 })
    const b = record(2, 11, { parent: 1 })
    const lookup = (id: number) => (id === 1 ? a : id === 2 ? b : undefined)
    expect(buildLineage(a, lookup)).toEqual([{ igdbId: 2, via: 'port' }])
  })

  it('ends the chain where a record above is unknown', () => {
    expect(buildLineage(record(5, 9, { parent: 6 }), () => undefined)).toEqual([
      { igdbId: 6, via: 'remaster' },
    ])
  })
})

describe('linkBetween', () => {
  it('finds a direct link in either direction', () => {
    expect(linkBetween(member(37034), member(472))).toBe('port')
    expect(linkBetween(member(472), member(37034))).toBe('port')
  })

  it('reports the farthest link between siblings', () => {
    // A port and a remaster of the same original are a remaster apart.
    expect(linkBetween(member(37034), member(19457))).toBe('remaster')
    // A port of the original and a remake of it are a remake apart.
    expect(linkBetween(member(1001), member(132181))).toBe('remake')
  })

  it('keeps an edition of a remake with the remake', () => {
    expect(linkBetween(member(1003), member(132181))).toBe('edition')
    expect(linkBetween(member(1003), member(974))).toBe('remake')
  })

  it('is undefined for unrelated games', () => {
    expect(linkBetween(member(472), member(37777))).toBeUndefined()
    expect(linkBetween(member(2001), member(2000))).toBeUndefined()
  })
})

describe('proposeGrouping (ADR 001, decision 4)', () => {
  it('says so when the exact record is already linked', () => {
    expect(proposeGrouping(member(472), onShelf(472))).toEqual({
      action: 'already',
      entryId: 'entry-472',
    })
  })

  it('starts a new entry when nothing related is on the shelf', () => {
    expect(proposeGrouping(member(472), onShelf(37777, 974))).toEqual({ action: 'new' })
  })

  it('folds an edition in silently', () => {
    expect(proposeGrouping(member(123051), onShelf(37777))).toEqual({
      action: 'join',
      entryId: 'entry-37777',
      relation: 'edition',
      because: 'edition',
      ask: false,
    })
  })

  it('folds a port in silently: the brief’s own example', () => {
    expect(proposeGrouping(member(37034), onShelf(472))).toMatchObject({
      action: 'join',
      entryId: 'entry-472',
      relation: 'port',
      ask: false,
    })
  })

  it('folds the original in when I own the port', () => {
    expect(proposeGrouping(member(472), onShelf(37034))).toMatchObject({
      action: 'join',
      entryId: 'entry-37034',
      relation: 'other',
      ask: false,
    })
  })

  it('asks before folding in a remaster or an expanded edition', () => {
    expect(proposeGrouping(member(19457), onShelf(472))).toMatchObject({
      action: 'join',
      relation: 'remaster',
      ask: true,
    })
    expect(proposeGrouping(member(114283), onShelf(9927))).toMatchObject({
      action: 'join',
      relation: 'expanded',
      ask: true,
    })
  })

  it('keeps a remake separate, and asks', () => {
    expect(proposeGrouping(member(132181), onShelf(974))).toEqual({
      action: 'separate',
      entryId: 'entry-974',
      relation: 'remake',
      because: 'remake',
      ask: true,
    })
  })

  it('prefers the nearest relative when two entries are related', () => {
    // The original and its remake are both on the shelf; the remake's deluxe edition arrives.
    expect(proposeGrouping(member(1003), onShelf(974, 132181))).toMatchObject({
      action: 'join',
      entryId: 'entry-132181',
      ask: false,
    })
  })

  it('never proposes joining DLC to its game', () => {
    expect(proposeGrouping(member(2001), onShelf(2000))).toEqual({ action: 'new' })
  })
})
