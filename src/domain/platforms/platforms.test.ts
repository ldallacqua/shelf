import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { igdbPlatformSchema, type IgdbPlatform } from '@/domain/igdb/schema'
import {
  comparePlatforms,
  curatedPlatform,
  curatedPlatformIds,
  toPlatform,
  type Platform,
} from '@/domain/platforms/platforms'

/** IGDB's own platform list, as fetched into the fixtures. */
const igdb = new Map<number, IgdbPlatform>(
  (
    JSON.parse(
      readFileSync(join(process.cwd(), 'fixtures/igdb/platforms.json'), 'utf8'),
    ) as unknown[]
  )
    .map((item) => igdbPlatformSchema.parse(item))
    .map((platform) => [platform.id, platform]),
)

const get = (id: number): Platform => {
  const platform = curatedPlatform(id)
  if (!platform) throw new Error(`Platform ${id} is not curated`)
  return platform
}

describe('curated platforms', () => {
  it('every curated id exists in IGDB', () => {
    const missing = curatedPlatformIds().filter((id) => !igdb.has(id))
    expect(missing).toEqual([])
  })

  it('every curated id is the platform we think it is', () => {
    // Our name shares its first word with IGDB's name, or with its abbreviation.
    // This catches an id typed from memory that points at the wrong machine.
    const wrong = curatedPlatformIds().filter((id) => {
      const ours = get(id)
      const theirs = igdb.get(id)
      if (!theirs) return true
      const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/)
      const known = new Set([...words(theirs.name), ...words(theirs.abbreviation ?? '')])
      return !words(ours.name).some((word) => word.length > 1 && known.has(word))
    })
    expect(wrong.map((id) => `${id}: ${get(id).name} vs ${igdb.get(id)?.name}`)).toEqual([])
  })

  it('agrees with IGDB on the family of every console', () => {
    const families: Record<string, string> = {
      PlayStation: 'playstation',
      Xbox: 'xbox',
      Nintendo: 'nintendo',
      Sega: 'sega',
    }
    for (const id of curatedPlatformIds()) {
      const expected = families[igdb.get(id)?.platform_family?.name ?? '']
      if (expected) expect(`${id} ${get(id).family}`).toBe(`${id} ${expected}`)
    }
  })

  it('gives every platform a key no other has, safe in an address', () => {
    const keys = curatedPlatformIds().map((id) => get(id).key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })

  it('knows the case each console’s games come in', () => {
    expect(get(167)).toMatchObject({ key: 'ps5', shape: 'bluRay', plastic: 'blue' })
    expect(get(130)).toMatchObject({ key: 'switch', shape: 'switch', plastic: 'red' })
    expect(get(169)).toMatchObject({ key: 'xbox-series', shape: 'bluRay', plastic: 'green' })
    expect(get(8)).toMatchObject({ key: 'ps2', shape: 'keepCase', plastic: 'black' })
    expect(get(7)).toMatchObject({ key: 'ps1', shape: 'jewel' })
    expect(get(6)).toMatchObject({ key: 'pc', family: 'pc' })
  })
})

describe('toPlatform', () => {
  it('uses the curated platform when there is one', () => {
    const switchRecord = igdb.get(130)
    expect(switchRecord && toPlatform(switchRecord)).toEqual(get(130))
  })

  it('makes a sensible platform from what IGDB says otherwise', () => {
    expect(
      toPlatform({
        id: 9999,
        name: 'Some Future Console',
        slug: 'some-future-console--1',
        abbreviation: 'SFC2',
        generation: 10,
        platform_family: { id: 1, name: 'PlayStation' },
      }),
    ).toEqual({
      igdbId: 9999,
      key: 'some-future-console-1',
      name: 'Some Future Console',
      short: 'SFC2',
      family: 'playstation',
      generation: 10,
      shape: 'keepCase',
      plastic: 'black',
    })
  })

  it('gives every platform in IGDB a usable key', () => {
    const keys = [...igdb.values()].map((record) => toPlatform(record).key)
    for (const key of keys) expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('comparePlatforms', () => {
  const order = (...ids: number[]) =>
    ids
      .map(get)
      .sort(comparePlatforms)
      .map((platform) => platform.key)

  it('groups by family: PlayStation, Xbox, Nintendo, PC, Sega, others', () => {
    expect(order(23, 6, 130, 169, 167, 39)).toEqual([
      'ps5',
      'xbox-series',
      'switch',
      'pc',
      'dreamcast',
      'ios',
    ])
  })

  it('puts the newest generation first within a family', () => {
    expect(order(7, 167, 8, 48, 9)).toEqual(['ps5', 'ps4', 'ps3', 'ps2', 'ps1'])
  })

  it('puts the home console before the handheld of the same generation', () => {
    expect(order(46, 48)).toEqual(['ps4', 'vita'])
    expect(order(37, 130, 41)).toEqual(['switch', 'wii-u', '3ds'])
  })

  it('puts PC before Mac and Linux', () => {
    expect(order(3, 14, 6)).toEqual(['pc', 'mac', 'linux'])
  })
})
