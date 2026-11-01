import { describe, expect, it } from 'vitest'

import { EROTIC } from '@/domain/igdb/game'
import { imageUrl } from '@/domain/igdb/images'

import {
  isAdultOnSteam,
  isStoreGame,
  steamAppIdIn,
  toSteamGame,
  wordsOf,
  type StoreGame,
} from './store-game'

const item = (over: Partial<StoreGame> = {}): StoreGame => ({
  id: 2000001,
  success: 1,
  name: 'A Made-up Game',
  type: 0,
  content_descriptorids: [],
  tagids: [],
  categories: { supported_player_categoryids: [] },
  basic_info: { short_description: 'Made up.', developers: [], publishers: [] },
  assets: {
    asset_url_format: 'steam/apps/2000001/${FILENAME}?t=1',
    library_capsule: 'abc123/library_capsule.jpg',
    library_capsule_2x: 'abc123/library_capsule_2x.jpg',
    library_hero: 'def456/library_hero.jpg',
  },
  platforms: { windows: true },
  screenshots: {
    all_ages_screenshots: [{ filename: 'steam/apps/2000001/ss_ab12.jpg?t=1' }],
    mature_content_screenshots: [],
  },
  ...over,
})

describe('a pasted Steam link', () => {
  it.each([
    ['https://store.steampowered.com/app/2000001/A_Game/?curator_clanid=1', '2000001'],
    ['store.steampowered.com/app/2000001', '2000001'],
    ['https://store.steampowered.com/agecheck/app/2000001/', '2000001'],
    ['https://steamcommunity.com/app/2000001/discussions/', '2000001'],
    ['https://s.team/a/2000001', '2000001'],
    ['  https://store.steampowered.com/app/2000001/  ', '2000001'],
  ])('reads the app in %s', (text, id) => {
    expect(steamAppIdIn(text)).toBe(id)
  })

  it.each([
    'Portal 2',
    '2000001',
    'https://store.steampowered.com/app/',
    'https://store.steampowered.com/app/0/',
    'https://store.steampowered.com.evil.example/app/2000001',
    'https://evil.example/?u=store.steampowered.com/app/2000001',
    'https://store.steampowered.com/sub/2000001',
    'https://store.steampowered.com/app/20x/',
  ])('finds none in %s', (text) => {
    expect(steamAppIdIn(text)).toBeUndefined()
  })
})

describe('a store page as a game', () => {
  it('keeps the moderator’s title over Steam’s, and marks the app it came from', () => {
    const data = toSteamGame(item(), '  A Made-up Game II ')
    expect(data.title).toBe('A Made-up Game II')
    expect(data.steamAppId).toBe('2000001')
    expect(data.storeIds).toEqual([{ source: 'steam', uid: '2000001' }])
    expect(toSteamGame(item()).title).toBe('A Made-up Game')
  })

  it('finds the cover’s two sizes, and leaves a missing second one out', () => {
    const { cover } = toSteamGame(item())
    expect(imageUrl(cover!.id, 'cover_small')).toBe(
      'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2000001/abc123/library_capsule.jpg',
    )
    expect(imageUrl(cover!.id, 'cover_big_2x')).toBe(
      'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2000001/abc123/library_capsule_2x.jpg',
    )
    const single = toSteamGame(
      item({
        assets: {
          asset_url_format: 'steam/apps/2000001/${FILENAME}?t=1',
          library_capsule: 'portrait.png',
        },
      }),
    ).cover
    expect(imageUrl(single!.id, 'cover_big_2x')).toMatch(/\/portrait\.png$/)
  })

  it('has no cover when Steam gives none it can read', () => {
    expect(toSteamGame(item({ assets: undefined })).cover).toBeUndefined()
    expect(
      toSteamGame(
        item({
          assets: { asset_url_format: '../${FILENAME}', library_capsule: 'x.jpg' },
        }),
      ).cover,
    ).toBeUndefined()
  })

  it('turns its date into a day and a release on each of its platforms', () => {
    const data = toSteamGame(
      item({
        release: { steam_release_date: 1_303_186_800 },
        platforms: { windows: true, mac: true, steamos_linux: true },
      }),
    )
    expect(data.releasedOn).toBe('2011-04-18')
    expect(data.year).toBe(2011)
    expect(data.platforms).toEqual([6, 14, 3])
    expect(data.releases).toContainEqual({ platform: 14, day: '2011-04-18', year: 2011 })
  })

  it('is on PC when Steam names no platform, and has no date when Steam gives none', () => {
    const data = toSteamGame(item({ platforms: undefined }))
    expect(data.platforms).toEqual([6])
    expect(data.releases).toEqual([{ platform: 6 }])
    expect(data).not.toHaveProperty('releasedOn')
  })

  it('reads its tags and categories as Shelf’s words, with their names', () => {
    const data = toSteamGame(
      item({
        tagids: [492, 1667, 3839, 999_999],
        categories: { supported_player_categoryids: [2, 9] },
      }),
    )
    expect(data.genres).toEqual([32])
    expect(data.themes).toEqual([19])
    expect(data.perspectives).toEqual([1])
    expect(data.modes).toEqual([1, 3])
    expect(wordsOf(data)).toContainEqual({
      kind: 'theme',
      items: [{ id: 19, name: 'Horror', slug: 'horror' }],
    })
  })

  it('knows a soundtrack, a DLC or a demo is not a game', () => {
    expect(isStoreGame(item())).toBe(true)
    expect(isStoreGame(item({ type: undefined }))).toBe(true)
    for (const type of [1, 4, 11, 13]) expect(isStoreGame(item({ type }))).toBe(false)
  })
})

describe('a game for adults (spec 3.13)', () => {
  it.each([
    [[3], true],
    [[4], true],
    [[1, 3, 4, 5], true],
    [[1, 2, 5], false],
    [[], false],
  ])('with descriptors %j is adult: %s', (ids, adult) => {
    const data = toSteamGame(item({ content_descriptorids: ids }))
    expect(isAdultOnSteam(data)).toBe(adult)
    expect(data.themes.includes(EROTIC)).toBe(adult)
  })

  it('counts as Adults Only only when Steam says so', () => {
    expect(toSteamGame(item({ content_descriptorids: [3] })).adultsOnly).toBe(true)
    expect(toSteamGame(item({ content_descriptorids: [4] })).adultsOnly).toBe(false)
  })

  it('keeps its library art, marked, for its page and nowhere else', () => {
    const data = toSteamGame(item({ content_descriptorids: [4] }))
    expect(data.cover).toBeDefined()
    expect(data.artworks).toEqual([
      expect.objectContaining({ type: 'key', width: 1920, mature: true }),
    ])
    expect(toSteamGame(item()).artworks).toEqual([
      expect.objectContaining({ type: 'key', width: 1920 }),
    ])
    expect(toSteamGame(item()).artworks[0]).not.toHaveProperty('mature')
  })

  it('marks the screenshots Steam keeps for adults, after those for anyone', () => {
    const data = toSteamGame(
      item({
        screenshots: {
          all_ages_screenshots: [{ filename: 'steam/apps/2000001/ss_ab12.jpg?t=1' }],
          mature_content_screenshots: [
            { filename: 'steam/apps/2000001/ss_cd34.jpg?t=1' },
            { filename: '../not-a-store-file.jpg' },
          ],
        },
      }),
    )
    expect(data.screenshots).toEqual([
      { id: 'steam/apps/2000001/ss_ab12.jpg', width: 1920, height: 1080 },
      { id: 'steam/apps/2000001/ss_cd34.jpg', width: 1920, height: 1080, mature: true },
    ])
  })
})
