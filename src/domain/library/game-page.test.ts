import { describe, expect, it } from 'vitest'

import {
  backdropOf,
  buildGamePage,
  filterFor,
  firstReleases,
  namesOf,
  videoGameData,
  type GameExtras,
} from './game-page'
import { testGame, testLibrary, testPlatform } from './testing'

const ps4 = testPlatform(48, 'ps4', 'playstation', 'PlayStation 4')
const ps5 = testPlatform(167, 'ps5', 'playstation', 'PlayStation 5')
const switch1 = testPlatform(130, 'switch', 'nintendo', 'Nintendo Switch')
const pc = testPlatform(6, 'pc', 'pc', 'PC')

const extras = (more: Partial<GameExtras> = {}): GameExtras => ({
  artworks: [],
  screenshots: [],
  videos: [],
  releases: [],
  notesPublic: false,
  ...more,
})

const game = testGame('Bloodborne', {
  platforms: [48],
  copies: [{ platform: 167, format: 'digital' }],
  genres: [12, 31],
  developers: [1],
  publishers: [2],
  modes: [1, 3],
  series: [5],
  tags: [1],
  releasedOn: '2015-03-24',
  cover: 'cob99l',
})

const library = testLibrary([game], {
  genre: [
    { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
    { id: 31, name: 'Adventure', slug: 'adventure' },
    { id: 99, name: 'Racing', slug: 'racing' },
  ],
  company: [
    { id: 1, name: 'FromSoftware', slug: 'fromsoftware' },
    { id: 2, name: 'Sony Computer Entertainment', slug: 'sony-computer-entertainment' },
    { id: 3, name: 'Nintendo', slug: 'nintendo' },
  ],
  mode: [
    { id: 1, name: 'Single player', slug: 'single-player' },
    { id: 3, name: 'Co-operative', slug: 'co-operative' },
  ],
  series: [{ id: 5, name: 'Soulsborne', slug: 'soulsborne' }],
  platform: [ps5, ps4, switch1, pc],
  tag: [
    { name: 'couch co-op', slug: 'couch-co-op' },
    { name: 'replay someday', slug: 'replay-someday' },
  ],
})

describe('firstReleases', () => {
  it('keeps the first release on each platform, across versions, oldest first', () => {
    expect(
      firstReleases([
        [
          { platform: 48, day: '2015-03-24', year: 2015 },
          { platform: 48, day: '2015-03-26', year: 2015 },
        ],
        // A port, years later, gives its own platform its own date.
        [{ platform: 130, day: '2021-11-12', year: 2021 }],
        [{ platform: 6, year: 2024 }],
      ]),
    ).toEqual([
      { platform: 48, day: '2015-03-24', year: 2015 },
      { platform: 130, day: '2021-11-12', year: 2021 },
      { platform: 6, year: 2024 },
    ])
  })

  it('prefers a full date to a year alone, and puts an unknown date last', () => {
    expect(
      firstReleases([
        [{ platform: 48, year: 2015 }, { platform: 6 }],
        [{ platform: 48, day: '2015-06-01', year: 2015 }],
      ]),
    ).toEqual([{ platform: 48, day: '2015-06-01', year: 2015 }, { platform: 6 }])
  })
})

describe('backdropOf', () => {
  const shot = { id: 'sc1', width: 1920, height: 1080 }
  it('takes key art first, then other art, then a screenshot, then nothing', () => {
    const art = { id: 'ar1', width: 1920, height: 1080, type: 'art' as const }
    const key = { id: 'ar2', width: 1920, height: 1080, type: 'key' as const }
    expect(backdropOf([art, key], [shot])).toEqual({ id: 'ar2', width: 1920, height: 1080 })
    expect(backdropOf([art], [shot])).toEqual({ id: 'ar1', width: 1920, height: 1080 })
    expect(backdropOf([], [shot])).toEqual(shot)
    expect(backdropOf([], [])).toBeUndefined()
  })
})

describe('buildGamePage', () => {
  it('names only what the game holds, and its tags by name', () => {
    const page = buildGamePage(library, game, extras({ summary: 'A hunt.' }))
    expect(page.facts.names.genre.map((named) => named.name)).toEqual([
      'Role-playing (RPG)',
      'Adventure',
    ])
    expect(page.facts.names.company.map((named) => named.id)).toEqual([1, 2])
    // The platforms it came out on and the ones it is owned on.
    expect(page.facts.names.platform.map((platform) => platform.key)).toEqual(['ps5', 'ps4'])
    expect(page.tags).toEqual([{ name: 'replay someday', slug: 'replay-someday' }])
    expect(page.facts.summary).toBe('A hunt.')
  })

  it('names the platforms of releases from versions folded in', () => {
    const page = buildGamePage(
      library,
      game,
      extras({ releases: [[{ platform: 48, year: 2015 }], [{ platform: 130, year: 2021 }]] }),
    )
    expect(page.facts.names.platform.map((platform) => platform.key)).toContain('switch')
  })

  it('never carries a private note', () => {
    expect(buildGamePage(library, game, extras({ notes: 'Mine alone.' })).facts.notes).toBe(
      undefined,
    )
    expect(
      buildGamePage(library, game, extras({ notes: 'For anyone.', notesPublic: true })).facts.notes,
    ).toBe('For anyone.')
  })
})

describe('filterFor and namesOf', () => {
  it('writes the filter a value links to, with the short words filters use', () => {
    expect(
      filterFor('genre', { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' }),
    ).toBe('genre:rpg')
    expect(filterFor('developer', { id: 1, name: 'FromSoftware', slug: 'fromsoftware' })).toBe(
      'developer:fromsoftware',
    )
  })

  it('keeps the order the game gives its ids in', () => {
    expect(namesOf(library.names.genre, [31, 12]).map((named) => named.id)).toEqual([31, 12])
  })
})

describe('videoGameData', () => {
  it("describes the game as schema.org's VideoGame, and leaves me out of it", () => {
    const page = buildGamePage(
      library,
      { ...game, rating: 90 },
      extras({
        summary: 'A hunt.',
        screenshots: [{ id: 'sc1', width: 1920, height: 1080 }],
        notes: 'For anyone.',
        notesPublic: true,
      }),
    )
    const data = videoGameData(page, 'https://shelf.test/en/u/sample/game/bloodborne', {
      cover: (id) => `cover:${id}`,
      screenshot: (id) => `shot:${id}`,
    })
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'VideoGame',
      name: 'Bloodborne',
      url: 'https://shelf.test/en/u/sample/game/bloodborne',
      description: 'A hunt.',
      datePublished: '2015-03-24',
      gamePlatform: ['PlayStation 4'],
      genre: ['Role-playing (RPG)', 'Adventure'],
      image: ['cover:cob99l', 'shot:sc1'],
      author: [{ '@type': 'Organization', name: 'FromSoftware' }],
      publisher: [{ '@type': 'Organization', name: 'Sony Computer Entertainment' }],
      isPartOf: { '@type': 'CreativeWorkSeries', name: 'Soulsborne' },
      playMode: ['https://schema.org/SinglePlayer', 'https://schema.org/CoOp'],
    })
    const text = JSON.stringify(data)
    expect(text).not.toContain('For anyone.')
    expect(text).not.toContain('rating')
  })
})
