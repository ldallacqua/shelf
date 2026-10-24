import { describe, expect, it } from 'vitest'

import type { SearchResult } from '@/domain/igdb/search'
import { bareTitle, gameOfMode, matchByTitle, strippedTitle } from '@/domain/sync/titles'

const PC = 6
const SWITCH = 130

const result = (igdbId: number, title: string, more: Partial<SearchResult> = {}): SearchResult => ({
  igdbId,
  slug: title.toLowerCase().replace(/\W+/g, '-'),
  title,
  kind: 'main',
  platforms: [PC],
  alsoOn: [],
  ports: [],
  ...more,
})

describe('a bare title', () => {
  it('drops the marks stores add', () => {
    expect(bareTitle('DOOM Eternal™')).toBe('doom eternal')
    expect(bareTitle('Tom Clancy’s Rainbow Six® Siege')).toBe('tom clancys rainbow six siege')
  })

  it('drops the edition at the end', () => {
    expect(bareTitle('Shadow of the Tomb Raider: Definitive Edition')).toBe(
      'shadow of the tomb raider',
    )
    expect(bareTitle('The Witcher 3: Wild Hunt - Game of the Year Edition')).toBe(
      'the witcher 3 wild hunt',
    )
    expect(bareTitle('Batman: Arkham Asylum GOTY Edition')).toBe('batman arkham asylum')
    expect(bareTitle('Fallout 4 (GOTY)')).toBe('fallout 4')
    expect(bareTitle('Death Stranding Director’s Cut')).toBe('death stranding')
    expect(bareTitle("Death Stranding Director's Cut")).toBe('death stranding')
  })

  it('keeps a word that is part of the game’s name', () => {
    expect(bareTitle('Mario Kart 8 Deluxe')).toBe('mario kart 8 deluxe')
    expect(bareTitle('Minecraft: Java Edition')).toBe('minecraft java edition')
    expect(bareTitle('Final Fantasy VII Remake')).toBe('final fantasy vii remake')
    expect(bareTitle('Dark Souls Remastered')).toBe('dark souls remastered')
  })

  it('drops a platform named at the end', () => {
    expect(bareTitle('Forza Horizon 4 for Windows 10')).toBe('forza horizon 4')
    expect(bareTitle('Halo: The Master Chief Collection (PC)')).toBe(
      'halo the master chief collection',
    )
    expect(bareTitle('Shadows')).toBe('shadows')
  })

  it('is never emptied by its own words', () => {
    expect(bareTitle('Deluxe Edition')).toBe('deluxe edition')
  })
})

describe('a stripped title', () => {
  it('is what to ask IGDB for: the name without marks and edition words, as written', () => {
    expect(strippedTitle('Shadow of the Tomb Raider: Definitive Edition™')).toBe(
      'Shadow of the Tomb Raider',
    )
    expect(strippedTitle('Tom Clancy’s Rainbow Six® Siege')).toBe('Tom Clancy’s Rainbow Six Siege')
    expect(strippedTitle('Hades')).toBe('Hades')
  })
})

describe('the title rung', () => {
  it('answers with the one candidate of that title on the platform', () => {
    const hollow = result(1, 'Hollow Knight', { platforms: [PC, SWITCH] })
    expect(matchByTitle({ title: 'Hollow Knight', platforms: [PC] }, [hollow])).toBe(hollow)
  })

  it('matches through the edition words and the marks', () => {
    const sotr = result(37777, 'Shadow of the Tomb Raider')
    expect(
      matchByTitle({ title: 'Shadow of the Tomb Raider™ Definitive Edition', platforms: [PC] }, [
        sotr,
      ]),
    ).toBe(sotr)
  })

  it('does not answer when two games share the title', () => {
    const doom1993 = result(673, 'Doom', { year: 1993 })
    const doom2016 = result(7351, 'Doom', { year: 2016 })
    expect(matchByTitle({ title: 'DOOM', platforms: [PC] }, [doom1993, doom2016])).toBeUndefined()
  })

  it('takes the year to tell them apart, when the source gives one', () => {
    const doom1993 = result(673, 'Doom', { year: 1993 })
    const doom2016 = result(7351, 'Doom', { year: 2016 })
    expect(matchByTitle({ title: 'DOOM', platforms: [PC], year: 2016 }, [doom1993, doom2016])).toBe(
      doom2016,
    )
  })

  it('does not answer with a game on another platform', () => {
    const zelda = result(1, "The Legend of Zelda: Link's Awakening", { platforms: [33] })
    expect(
      matchByTitle({ title: "The Legend of Zelda: Link's Awakening", platforms: [SWITCH] }, [
        zelda,
      ]),
    ).toBeUndefined()
  })

  it('counts a port folded into the game', () => {
    const skyrim = result(472, 'The Elder Scrolls V: Skyrim', { alsoOn: [SWITCH] })
    expect(
      matchByTitle({ title: 'The Elder Scrolls V: Skyrim', platforms: [SWITCH] }, [skyrim]),
    ).toBe(skyrim)
  })

  it('does not answer with a title that is only close', () => {
    const portal2 = result(72, 'Portal 2')
    expect(matchByTitle({ title: 'Portal', platforms: [PC] }, [portal2])).toBeUndefined()
  })
})

describe('the game a mode sold apart belongs to', () => {
  const owned = [
    { storeId: '202970', title: 'Call of Duty®: Black Ops II' },
    { storeId: '42700', title: 'Call of Duty: Black Ops' },
    { storeId: '311210', title: 'Call of Duty: Black Ops III' },
  ]

  it('is the game whose whole title starts the mode’s, before a dash or a colon', () => {
    expect(gameOfMode('Call of Duty: Black Ops II - Zombies', owned)).toBe('202970')
    expect(gameOfMode('Call of Duty: Black Ops: Multiplayer', owned)).toBe('42700')
  })

  it('is no game when the title only goes on, or names no game I have', () => {
    expect(gameOfMode('Call of Duty: Black Ops III', owned.slice(0, 1))).toBeUndefined()
    expect(gameOfMode('Call of Duty: Black Ops II', owned.slice(0, 1))).toBeUndefined()
    expect(gameOfMode('Half-Life 2: Deathmatch', owned)).toBeUndefined()
  })
})
