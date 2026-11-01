import { describe, expect, it } from 'vitest'

import { groupLibrary } from '@/domain/library/group'
import { ownedOn, testGame, testLibrary, testPlatform } from '@/domain/library/testing'

import { buildIndex, evaluate, gamesIn, standingCopies, withKeywords } from './evaluate'
import { facetCounts, rankFacets, withoutKey } from './facets'
import { parseQuery } from './parse'

/**
 * Every filter in spec 5.1, alone and combined (5.2, 5.3), on a library
 * small enough to know the answer to each by heart.
 */

const platforms = [
  testPlatform(167, 'ps5', 'playstation', 'PlayStation 5'),
  testPlatform(48, 'ps4', 'playstation', 'PlayStation 4'),
  testPlatform(11, 'xbox', 'xbox', 'Xbox'),
  testPlatform(169, 'xbox-series', 'xbox', 'Xbox Series X|S'),
  testPlatform(130, 'switch', 'nintendo', 'Nintendo Switch'),
  testPlatform(6, 'pc', 'pc', 'PC'),
  testPlatform(14, 'mac', 'pc', 'Mac'),
]

const names = {
  platform: platforms,
  genre: [
    { id: 12, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
    { id: 31, name: 'Adventure', slug: 'adventure' },
    { id: 15, name: 'Strategy', slug: 'strategy' },
  ],
  theme: [
    { id: 19, name: 'Horror', slug: 'horror' },
    { id: 17, name: 'Fantasy', slug: 'fantasy' },
  ],
  mode: [
    { id: 1, name: 'Single player', slug: 'single-player' },
    { id: 3, name: 'Co-operative', slug: 'co-operative' },
  ],
  perspective: [
    { id: 1, name: 'First person', slug: 'first-person' },
    { id: 2, name: 'Third person', slug: 'third-person' },
  ],
  franchise: [{ id: 1, name: 'The Legend of Zelda', slug: 'the-legend-of-zelda' }],
  series: [{ id: 2, name: 'Tomb Raider: Survivor', slug: 'tomb-raider-survivor' }],
  company: [
    { id: 100, name: 'Eidos Montréal', slug: 'eidos-montreal' },
    { id: 101, name: 'Square Enix', slug: 'square-enix' },
  ],
  tag: [
    { name: 'couch co-op', slug: 'couch-co-op' },
    { name: '100%', slug: '100' },
  ],
}

const zelda = testGame('The Legend of Zelda: Breath of the Wild', {
  ...ownedOn(130),
  status: 'completed',
  rating: 100,
  completedOn: '2025-07-15',
  addedOn: '2023-05-01',
  minutes: 6000,
  year: 2017,
  igdbRating: 92,
  length: 50 * 60,
  genres: [31],
  themes: [17],
  modes: [1],
  perspectives: [2],
  platforms: [130],
  franchises: [1],
  featured: true,
  hasNotes: true,
  cover: 'co3p2d',
  tags: [0],
})
const tombRaider = testGame('Shadow of the Tomb Raider', {
  copies: [
    { platform: 48, format: 'physical' },
    { platform: 6, format: 'digital' },
  ],
  year: 2018,
  igdbRating: 76,
  length: 15 * 60,
  addedOn: '2024-02-10',
  genres: [31, 12],
  series: [2],
  developers: [100],
  publishers: [101],
  platforms: [48, 6, 169],
  cover: 'co1r7c',
})
const residentEvil = testGame('Resident Evil 4', {
  copies: [{ platform: 167, format: 'digital' }],
  status: 'playing',
  private: true,
  rating: 85,
  minutes: 420,
  year: 2023,
  kind: 'remake',
  addedOn: '2024-06-01',
  themes: [19],
  genres: [31],
  modes: [1],
  perspectives: [2],
  length: 16 * 60,
  platforms: [167, 48, 6],
  cover: 'co6bo0',
})
const persona = testGame('Persona 5 Royal', {
  copies: [
    { platform: 48, format: 'digital' },
    { platform: 167, format: 'physical' },
  ],
  status: 'dropped',
  rating: 70,
  minutes: 1800,
  year: 2019,
  kind: 'expanded',
  addedOn: '2022-12-24',
  genres: [12],
  themes: [17],
  platforms: [48, 167, 130],
  cover: 'co1nmw',
})
const silksong = testGame('Hollow Knight: Silksong', {
  status: 'wishlist',
  addedOn: '2025-01-03',
  platforms: [130, 6, 14],
  wanted: [130],
})
const halo = testGame('Halo: Reach', {
  ...ownedOn(11),
  status: 'completed',
  completedOn: '2025-02-01',
  rating: 80,
  year: 2010,
  igdbRating: 85,
  minutes: 600,
  addedOn: '2021-03-03',
  modes: [1, 3],
  perspectives: [1],
  tags: [0, 1],
  platforms: [11, 6],
  cover: 'co2lb9',
})
const pokemon = testGame('Pokémon Legends: Arceus', {
  copies: [{ platform: 130, format: 'digital' }],
  status: 'completed',
  completedOn: '2024-12-31',
  addedOn: '2022-02-01',
  rating: 75,
  year: 2022,
  minutes: 2400,
  genres: [12],
  platforms: [130],
  cover: 'co2v3c',
})

const library = testLibrary(
  [zelda, tombRaider, residentEvil, persona, silksong, halo, pokemon],
  names,
)
const index = buildIndex(library)

const matching = (text: string) => {
  const parsed = parseQuery(text)
  expect(parsed.problems, text).toEqual([])
  return gamesIn(index, evaluate(index, parsed.tree)).map((game) => game.title)
}

const ZELDA = zelda.title
const TOMB = tombRaider.title
const RE4 = residentEvil.title
const PERSONA = persona.title
const SILKSONG = silksong.title
const HALO = halo.title
const POKEMON = pokemon.title

describe('each filter on its own (spec 5.1)', () => {
  it('status', () => {
    expect(matching('status:completed')).toEqual([ZELDA, HALO, POKEMON])
    expect(matching('status:playing,dropped')).toEqual([RE4, PERSONA])
  })

  it('platform owned, by platform or by family', () => {
    expect(matching('owned:ps5')).toEqual([RE4, PERSONA])
    expect(matching('owned:playstation')).toEqual([TOMB, RE4, PERSONA])
    expect(matching('owned:nintendo')).toEqual([ZELDA, POKEMON])
    // "xbox" is the family, which holds the first Xbox too.
    expect(matching('owned:xbox')).toEqual([HALO])
    expect(matching('owned:switch,pc')).toEqual([ZELDA, TOMB, POKEMON])
  })

  it('wanted on, by platform or by family, apart from owned (spec 7.5)', () => {
    expect(matching('wanted:switch')).toEqual([SILKSONG])
    expect(matching('wanted:nintendo')).toEqual([SILKSONG])
    expect(matching('wanted:pc')).toEqual([])
    expect(matching('owned:switch')).not.toContain(SILKSONG)
  })

  it('format: a game with a disc and a download is both', () => {
    expect(matching('format:physical')).toEqual([ZELDA, TOMB, PERSONA, HALO])
    expect(matching('format:digital')).toEqual([TOMB, RE4, PERSONA, POKEMON])
  })

  it('number of platforms owned', () => {
    expect(matching('copies:2')).toEqual([TOMB, PERSONA])
    expect(matching('copies:0')).toEqual([SILKSONG])
    expect(matching('copies:>=1')).toHaveLength(6)
  })

  it('my rating, out of ten', () => {
    expect(matching('rating:>=8')).toEqual([ZELDA, RE4, HALO])
    expect(matching('rating:8')).toEqual([HALO])
    expect(matching('rating:7..7.5')).toEqual([PERSONA, POKEMON])
  })

  it('playtime, in hours', () => {
    // Never played is no hours, which is under ten.
    expect(matching('hours:<10')).toEqual([TOMB, RE4, SILKSONG])
    expect(matching('hours:10')).toEqual([HALO])
    expect(matching('hours:>=40')).toEqual([ZELDA, POKEMON])
  })

  it('completion date, as a year, a month range or a day', () => {
    expect(matching('completed:2025')).toEqual([ZELDA, HALO])
    expect(matching('completed:2025-06..2025-08')).toEqual([ZELDA])
    expect(matching('completed:<2025')).toEqual([POKEMON])
    expect(matching('completed:2024-12-31')).toEqual([POKEMON])
    expect(matching('completed:>2025-02')).toEqual([ZELDA])
    expect(matching('completed:<=2025-02')).toEqual([HALO, POKEMON])
  })

  it('date added', () => {
    expect(matching('added:2024')).toEqual([TOMB, RE4])
    expect(matching('added:>=2025-01-01')).toEqual([SILKSONG])
  })

  it('tag, has and featured', () => {
    expect(matching('tag:couch-co-op')).toEqual([ZELDA, HALO])
    expect(matching('tag:100')).toEqual([HALO])
    expect(matching('has:notes')).toEqual([ZELDA])
    expect(matching('-has:rating')).toEqual([TOMB, SILKSONG])
    expect(matching('has:playtime')).toEqual([ZELDA, RE4, PERSONA, HALO, POKEMON])
    expect(matching('-has:cover')).toEqual([SILKSONG])
    expect(matching('is:featured')).toEqual([ZELDA])
    expect(matching('is:private')).toEqual([RE4])
  })

  it('genre, theme, mode and perspective, in short words or IGDB’s', () => {
    expect(matching('genre:rpg')).toEqual([TOMB, PERSONA, POKEMON])
    expect(matching('genre:role-playing-rpg')).toEqual([TOMB, PERSONA, POKEMON])
    expect(matching('theme:horror')).toEqual([RE4])
    expect(matching('mode:co-op')).toEqual([HALO])
    expect(matching('perspective:first-person')).toEqual([HALO])
  })

  it('platform released on, by platform or family', () => {
    expect(matching('platform:mac')).toEqual([SILKSONG])
    expect(matching('platform:xbox')).toEqual([TOMB, HALO])
  })

  it('kind, franchise, series, developer and publisher', () => {
    expect(matching('kind:remake')).toEqual([RE4])
    expect(matching('kind:expanded')).toEqual([PERSONA])
    expect(matching('franchise:the-legend-of-zelda')).toEqual([ZELDA])
    expect(matching('series:tomb-raider-survivor')).toEqual([TOMB])
    expect(matching('developer:eidos-montreal')).toEqual([TOMB])
    expect(matching('publisher:square-enix')).toEqual([TOMB])
  })

  it('release year, IGDB rating and time to beat', () => {
    expect(matching('year:2015..2020')).toEqual([ZELDA, TOMB, PERSONA])
    expect(matching('year:<2015')).toEqual([HALO])
    expect(matching('igdb:>=85')).toEqual([ZELDA, HALO])
    expect(matching('length:<20')).toEqual([TOMB, RE4])
  })

  it('keywords, once their file has arrived', () => {
    const withWords = withKeywords(index, {
      names: [{ id: 7, name: 'time travel', slug: 'time-travel' }],
      games: { [zelda.slug]: [7], [persona.slug]: [7], 'not-in-the-library': [7] },
    })
    const tree = parseQuery('keyword:time-travel').tree
    expect(gamesIn(index, evaluate(index, tree))).toEqual([])
    expect(gamesIn(withWords, evaluate(withWords, tree)).map((game) => game.title)).toEqual([
      ZELDA,
      PERSONA,
    ])
  })

  it('words in the title, ignoring case and accents', () => {
    expect(matching('zelda')).toEqual([ZELDA])
    expect(matching('POKEMON')).toEqual([POKEMON])
    expect(matching('"breath of the wild"')).toEqual([ZELDA])
    expect(matching('halo: reach')).toEqual([HALO])
    expect(matching('of the')).toEqual([ZELDA, TOMB])
  })

  it('a name nothing carries matches nothing', () => {
    expect(matching('genre:puzzle')).toEqual([])
    expect(matching('-genre:puzzle')).toHaveLength(7)
  })
})

describe('age rating (spec 5.1)', () => {
  const erotic = { id: 42, name: 'Erotic', slug: 'erotic' }
  const rated = testLibrary(
    [
      testGame('Adults only', { ages: ['esrb-ao', 'pegi-18'] }),
      testGame('Mature', { ages: ['esrb-m', 'pegi-18'] }),
      testGame('Erotic, unrated', { themes: [42] }),
      testGame('Unrated'),
    ],
    { theme: [erotic] },
  )
  const ratedIndex = buildIndex(rated)
  const titles = (text: string) => {
    const parsed = parseQuery(text)
    expect(parsed.problems, text).toEqual([])
    return gamesIn(ratedIndex, evaluate(ratedIndex, parsed.tree)).map((game) => game.title)
  }

  it('by a board’s rating', () => {
    expect(titles('age:esrb-ao')).toEqual(['Adults only'])
    expect(titles('age:pegi-18')).toEqual(['Adults only', 'Mature'])
    expect(titles('-age:pegi-18')).toEqual(['Erotic, unrated', 'Unrated'])
  })

  it('joins with other keys in a group, as any list does', () => {
    expect(titles('theme:erotic OR age:esrb-ao')).toEqual(['Adults only', 'Erotic, unrated'])
  })

  it('counts each rating the library has, named by its board, board by board, youngest first', () => {
    expect(facetCounts(ratedIndex, undefined, 'age')).toEqual([
      { word: 'esrb-m', name: 'ESRB Mature 17+', count: 1 },
      { word: 'esrb-ao', name: 'ESRB Adults Only 18+', count: 1 },
      { word: 'pegi-18', name: 'PEGI 18', count: 2 },
    ])
  })

  it('points out a rating no board gives', () => {
    expect(parseQuery('age:esrb-z').problems).not.toEqual([])
  })
})

describe('combining them (spec 5.2 and 5.3)', () => {
  it('and, or and not', () => {
    expect(matching('genre:rpg status:completed')).toEqual([POKEMON])
    expect(matching('genre:rpg,adventure -theme:horror')).toEqual([ZELDA, TOMB, PERSONA, POKEMON])
    expect(matching('genre:rpg genre:adventure')).toEqual([TOMB])
    expect(matching('status:completed OR status:playing')).toEqual([ZELDA, RE4, HALO, POKEMON])
    expect(matching('-(status:completed OR status:playing)')).toEqual([TOMB, PERSONA, SILKSONG])
  })

  it('the spec’s own example: physical on PS5, or anything rated 9 and up', () => {
    expect(matching('(owned:ps5 format:physical) OR rating:>=9')).toEqual([ZELDA, PERSONA])
  })

  it('reads owned and format in one group as one copy', () => {
    // Tomb Raider is a disc on PS4 and a download on PC: there is no PC disc.
    expect(matching('owned:pc format:physical')).toEqual([])
    expect(matching('owned:pc format:digital')).toEqual([TOMB])
    // Persona is a download on PS4 and a disc on PS5.
    expect(matching('owned:ps4 format:digital')).toEqual([PERSONA])
    expect(matching('owned:ps4 format:physical')).toEqual([TOMB])
    // Negated, it is about the game: no download of it at all.
    expect(matching('owned:ps4 -format:digital')).toEqual([])
  })

  it('nests groups as deep as written', () => {
    expect(matching('(genre:rpg (owned:switch OR status:dropped)) OR -has:playtime')).toEqual([
      TOMB,
      PERSONA,
      SILKSONG,
      POKEMON,
    ])
  })
})

describe('which copies stand on the shelves', () => {
  const shelves = (text: string) => {
    const tree = parseQuery(text).tree
    const games = gamesIn(index, evaluate(index, tree))
    return groupLibrary(games, library.names, 'platform', standingCopies(index, tree)).map(
      (shelf) => [shelf.key, shelf.items.map((item) => item.game.slug)],
    )
  }

  it('only the copies the filter is about', () => {
    expect(shelves('format:digital')).toEqual([
      ['platform:167', ['resident-evil-4']],
      ['platform:48', ['persona-5-royal']],
      ['platform:130', ['pok-mon-legends-arceus']],
      ['platform:6', ['shadow-of-the-tomb-raider']],
    ])
    expect(shelves('owned:playstation')).toEqual([
      ['platform:167', ['resident-evil-4', 'persona-5-royal']],
      ['platform:48', ['shadow-of-the-tomb-raider', 'persona-5-royal']],
    ])
  })

  it('every copy, when the filter is not about copies', () => {
    expect(standingCopies(index, parseQuery('genre:rpg').tree)).toBeUndefined()
    expect(standingCopies(index, parseQuery('owned:ps5 OR rating:>=9').tree)).toBeUndefined()
  })

  it('shows the copy the filter is about when a game stands once', () => {
    const tree = parseQuery('format:digital').tree
    const [shelf] = groupLibrary(
      gamesIn(index, evaluate(index, tree)),
      library.names,
      'none',
      standingCopies(index, tree),
    )
    const tomb = shelf!.items.find((item) => item.game === tombRaider)
    expect(tomb?.copy).toEqual({ platform: 6, format: 'digital' })
  })
})

describe('counts beside every value (spec 5.4)', () => {
  const counts = (text: string, key: Parameters<typeof facetCounts>[2]) =>
    Object.fromEntries(
      facetCounts(index, parseQuery(text).tree, key).map((value) => [value.word, value.count]),
    )

  it('count what each value would match, given everything else that is active', () => {
    expect(counts('', 'status')).toEqual({
      playing: 1,
      backlog: 1,
      someday: 0,
      completed: 3,
      retired: 0,
      dropped: 1,
      wishlist: 1,
      unsorted: 0,
    })
    expect(counts('genre:rpg', 'status')).toEqual({
      playing: 0,
      backlog: 1,
      someday: 0,
      completed: 1,
      retired: 0,
      dropped: 1,
      wishlist: 0,
      unsorted: 0,
    })
  })

  it('leave the filter’s own conditions on that key out, so picking one does not hide the rest', () => {
    expect(counts('genre:rpg', 'genre')).toEqual({ rpg: 3, adventure: 3 })
    expect(counts('-genre:adventure status:completed', 'genre')).toEqual({
      rpg: 1,
      adventure: 1,
    })
  })

  it('count copies as copies: discs on each platform', () => {
    expect(counts('format:physical', 'owned')).toMatchObject({
      ps5: 1,
      ps4: 1,
      pc: 0,
      switch: 1,
      xbox: 1,
      playstation: 2,
    })
  })

  it('keep a condition inside an OR, which is not one of the filter’s own', () => {
    expect(withoutKey(parseQuery('genre:rpg OR status:playing').tree, 'genre')).toEqual(
      parseQuery('genre:rpg OR status:playing').tree,
    )
    expect(withoutKey(parseQuery('genre:rpg -genre:strategy zelda').tree, 'genre')).toEqual(
      parseQuery('zelda').tree,
    )
  })

  it('rank a long list: values that match something first, most games first; nothing sinks', () => {
    const ranked = rankFacets(facetCounts(index, parseQuery('status:dropped').tree, 'theme'), 'en')
    expect(ranked.map((value) => [value.name, value.count])).toEqual([
      ['Fantasy', 1],
      ['Horror', 0],
    ])
    const owned = rankFacets(facetCounts(index, undefined, 'genre'), 'en')
    expect(owned.map((value) => [value.name, value.count])).toEqual([
      ['Adventure', 3],
      ['Role-playing (RPG)', 3],
    ])
  })
})

describe('store:', () => {
  const library = testLibrary([
    testGame('On Steam', { copies: [{ platform: 6, format: 'digital', stores: ['steam'] }] }),
    testGame('On both', { copies: [{ platform: 6, format: 'digital', stores: ['steam', 'gog'] }] }),
    testGame('Wanted from GOG', { status: 'wishlist', wanted: [6], wantedStores: ['gog'] }),
    testGame('Nowhere named', { copies: [{ platform: 6, format: 'digital' }] }),
  ])
  const stored = buildIndex(library)
  const titles = (text: string) => {
    const parsed = parseQuery(text)
    expect(parsed.problems, text).toEqual([])
    return gamesIn(stored, evaluate(stored, parsed.tree)).map((game) => game.title)
  }

  it('finds where I have a game', () => {
    expect(titles('store:steam')).toEqual(['On Steam', 'On both'])
  })

  it('finds what I would buy from a store too: a sale there finds it', () => {
    expect(titles('store:gog')).toEqual(['On both', 'Wanted from GOG'])
  })
})
