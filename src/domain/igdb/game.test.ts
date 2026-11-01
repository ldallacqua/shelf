import { describe, expect, it } from 'vitest'

import { isGame, kindOf, lengthMinutes, parentOf, toGameData, toLength } from '@/domain/igdb/game'
import { igdbGameSchema } from '@/domain/igdb/schema'

const parse = (record: Record<string, unknown>) =>
  igdbGameSchema.parse({ id: 1, name: 'A Game', slug: 'a-game', ...record })

describe('igdbGameSchema', () => {
  it('fills in the lists IGDB leaves out', () => {
    const game = parse({})
    expect(game.genres).toEqual([])
    expect(game.involved_companies).toEqual([])
  })

  it('accepts game_type expanded or as a bare id', () => {
    expect(parse({ game_type: { id: 8, type: 'Remake' } }).game_type).toEqual({ id: 8 })
    expect(parse({ game_type: 8 }).game_type).toEqual({ id: 8 })
  })

  it('accepts id 0, which is a real row in some IGDB tables', () => {
    expect(parse({ game_type: { id: 0 } }).game_type).toEqual({ id: 0 })
  })

  it('refuses a record with no name', () => {
    expect(igdbGameSchema.safeParse({ id: 1, slug: 'x' }).success).toBe(false)
  })
})

describe('kindOf and isGame', () => {
  it.each([
    [0, 'main'],
    [3, 'bundle'],
    [4, 'expansion'],
    [8, 'remake'],
    [9, 'remaster'],
    [10, 'expanded'],
    [11, 'port'],
    [12, 'other'],
  ])('maps IGDB type %i to %s', (type, kind) => {
    expect(kindOf({ game_type: { id: type } })).toBe(kind)
  })

  it('treats a missing type as a main game', () => {
    expect(kindOf({})).toBe('main')
  })

  it('counts DLC, mods, episodes, seasons, packs and updates as not games', () => {
    for (const type of [1, 2, 5, 6, 7, 13, 14])
      expect(isGame({ game_type: { id: type } })).toBe(false)
    for (const type of [0, 3, 4, 8, 9, 10, 11])
      expect(isGame({ game_type: { id: type } })).toBe(true)
  })
})

describe('parentOf', () => {
  it('prefers version_parent: an edition is an edition whatever else it is', () => {
    expect(parentOf({ id: 2, game_type: { id: 11 }, parent_game: 9, version_parent: 1 })).toEqual({
      igdbId: 1,
      via: 'edition',
    })
  })

  it('ignores a record that points at itself', () => {
    expect(parentOf({ id: 2, game_type: { id: 11 }, parent_game: 2 })).toBeUndefined()
  })

  it('has no link for a bundle or a standalone expansion with a parent', () => {
    expect(parentOf({ id: 2, game_type: { id: 3 }, parent_game: 1 })).toBeUndefined()
    expect(parentOf({ id: 2, game_type: { id: 4 }, parent_game: 1 })).toBeUndefined()
  })
})

describe('toGameData', () => {
  it('keeps the title, slug and kind', () => {
    const data = toGameData(parse({ name: '  Persona 5 Royal ', game_type: { id: 10 } }))
    expect(data).toMatchObject({
      igdbId: 1,
      title: 'Persona 5 Royal',
      slug: 'a-game',
      kind: 'expanded',
    })
  })

  it('says when the ESRB rates it Adults Only, and only the ESRB (spec 3.13)', () => {
    const rated = (ratings: { organization: number; rating: string }[]) =>
      toGameData(
        parse({
          age_ratings: ratings.map(({ organization, rating }) => ({
            organization,
            rating_category: { rating },
          })),
        }),
      ).adultsOnly
    expect(rated([{ organization: 1, rating: 'AO' }])).toBe(true)
    // PEGI's 18 and the ESRB's Mature are not Adults Only.
    expect(
      rated([
        { organization: 2, rating: '18' },
        { organization: 1, rating: 'M' },
      ]),
    ).toBe(false)
    expect(toGameData(parse({})).adultsOnly).toBe(false)
  })

  it('keeps what each board that rates games says of it, as filter words (spec 5.1)', () => {
    const game = toGameData(
      parse({
        age_ratings: [
          { organization: 2, rating_category: { rating: '18' } },
          { organization: 1, rating_category: { rating: 'M' } },
        ],
      }),
    )
    expect(game.ages).toEqual(['esrb-m', 'pegi-18'])
    expect(toGameData(parse({})).ages).toEqual([])
  })

  it('keeps up to six videos by their YouTube ids, with what IGDB calls each (spec 7.1)', () => {
    const videos = toGameData(
      parse({
        videos: [
          { video_id: '2UJxaWZoK6Y', name: ' Gameplay Trailer ' },
          { video_id: 'not a youtube id' },
          { video_id: 'Ga98zSE9Q3Y' },
          ...Array.from({ length: 6 }, (_, at) => ({ video_id: `abcdefghij${at}` })),
        ],
      }),
    ).videos
    expect(videos).toHaveLength(6)
    expect(videos[0]).toEqual({ id: '2UJxaWZoK6Y', name: 'Gameplay Trailer' })
    expect(videos[1]).toEqual({ id: 'Ga98zSE9Q3Y' })
    expect(toGameData(parse({})).videos).toEqual([])
  })

  it('turns the release date into a day and a year', () => {
    const data = toGameData(parse({ first_release_date: 1536883200 }))
    expect(data.releasedOn).toBe('2018-09-14')
    expect(data.year).toBe(2018)
  })

  it('drops a release date outside any sensible range', () => {
    expect(toGameData(parse({ first_release_date: -99999999999 })).releasedOn).toBeUndefined()
    expect(toGameData(parse({ first_release_date: 99999999999 })).releasedOn).toBeUndefined()
  })

  it('merges franchise and franchises without repeats', () => {
    expect(toGameData(parse({ franchise: 5, franchises: [7, 5] })).franchises).toEqual([5, 7])
  })

  it('splits developers from publishers and keeps every company name', () => {
    const data = toGameData(
      parse({
        involved_companies: [
          { company: { id: 27, name: 'Eidos Montréal', slug: 'eidos-montreal' }, developer: true },
          { company: { id: 26, name: 'Square Enix', slug: 'square-enix' }, publisher: true },
          {
            company: { id: 23, name: 'Feral Interactive', slug: 'feral-interactive' },
            porting: true,
          },
        ],
      }),
    )
    expect(data.developers).toEqual([27])
    expect(data.publishers).toEqual([26])
    expect(data.companies.map((company) => company.name)).toEqual([
      'Eidos Montréal',
      'Square Enix',
      'Feral Interactive',
    ])
  })

  it('rounds the rating, and has none when nobody rated the game', () => {
    expect(toGameData(parse({ total_rating: 78.76, total_rating_count: 707 })).igdbRating).toBe(79)
    expect(toGameData(parse({ total_rating: 78.76 })).igdbRating).toBeUndefined()
  })

  it('keeps store ids a sync could use and drops the rest', () => {
    const data = toGameData(
      parse({
        external_games: [
          { uid: '750920', external_game_source: 1 },
          { uid: 'B07BH9ZMRR', external_game_source: 20, platform: 48, game_release_format: 2 },
          { uid: 'BRVK4W7RVCXR', external_game_source: 11 },
          { external_game_source: 5 },
        ],
      }),
    )
    expect(data.storeIds).toEqual([
      { source: 'steam', uid: '750920' },
      { source: 'microsoft', uid: 'BRVK4W7RVCXR' },
    ])
  })

  it('keeps wide key art first and leaves out logos and poster art', () => {
    const data = toGameData(
      parse({
        artworks: [
          { image_id: 'concept', width: 1920, height: 1080, artwork_type: 4 },
          { image_id: 'logo', width: 1386, height: 210, artwork_type: 7 },
          { image_id: 'poster', width: 600, height: 900, artwork_type: 1 },
          { image_id: 'key', width: 1280, height: 720, artwork_type: 2 },
        ],
      }),
    )
    expect(data.artworks.map((art) => art.id)).toEqual(['key', 'concept'])
  })

  it('keeps the earliest release for each platform', () => {
    const data = toGameData(
      parse({
        release_dates: [
          { platform: 6, date: 1536883200, y: 2018 },
          { platform: 6, date: 1500000000, y: 2017 },
          { platform: 48, y: 2019 },
          { date: 1536883200 },
        ],
      }),
    )
    expect(data.releases).toEqual([
      { platform: 6, day: '2017-07-14', year: 2017 },
      { platform: 48, year: 2019 },
    ])
  })

  it('records the link to the record above', () => {
    expect(toGameData(parse({ game_type: { id: 11 }, parent_game: 472 })).parent).toEqual({
      igdbId: 472,
      via: 'port',
    })
  })

  it('converts time to beat from seconds to minutes', () => {
    const time = { game_id: 1, hastily: 57600, normally: 79522, completely: 141660 }
    expect(toGameData(parse({}), time).length).toEqual({
      hastily: 960,
      normally: 1325,
      completely: 2361,
    })
  })
})

describe('length', () => {
  it('is undefined when IGDB has no figures', () => {
    expect(toLength(undefined)).toBeUndefined()
    expect(toLength({ game_id: 1, hastily: 0 })).toBeUndefined()
  })

  it('prefers a normal playthrough, then the nearest known', () => {
    expect(lengthMinutes({ hastily: 5, normally: 10, completely: 20 })).toBe(10)
    expect(lengthMinutes({ hastily: 5, completely: 20 })).toBe(5)
    expect(lengthMinutes({ completely: 20 })).toBe(20)
    expect(lengthMinutes(undefined)).toBeUndefined()
  })
})

describe('where a game is sold', () => {
  const links = (extra: Record<string, unknown>) =>
    toGameData(igdbGameSchema.parse({ id: 1, name: 'A', slug: 'a', ...extra })).storeLinks

  it('reads stores from both of IGDB’s lists, each missing some of the other’s', () => {
    expect(
      links({
        websites: [
          { type: 16, url: 'https://www.epicgames.com/store/en-US/product/a/home' },
          { type: 1, url: 'https://a.example' },
          { type: 24, url: 'https://www.nintendo.com/us/store/products/a/' },
        ],
        external_games: [
          { external_game_source: 1, uid: '10', url: 'https://store.steampowered.com/app/10' },
          { external_game_source: 5, uid: '20', url: 'https://www.gog.com/en/game/a' },
          { external_game_source: 3, uid: '30', url: 'https://www.giantbomb.com/games/3030-30/' },
          { external_game_source: 14, uid: '40', url: 'https://www.twitch.tv/directory/game/a' },
        ],
      }),
    ).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/10' },
      { store: 'gog', url: 'https://www.gog.com/game/a' },
      { store: 'epic', url: 'https://www.epicgames.com/store/product/a/home' },
      { store: 'nintendo', url: 'https://www.nintendo.com/us/store/products/a/' },
    ])
  })

  it('takes the website people chose over a list’s other edition', () => {
    expect(
      links({
        websites: [{ type: 17, url: 'https://www.gog.com/game/a' }],
        external_games: [
          { external_game_source: 5, uid: '2', url: 'https://www.gog.com/en/game/a_game' },
        ],
      }),
    ).toEqual([{ store: 'gog', url: 'https://www.gog.com/game/a' }])
  })

  it('gives a Steam app with no address the one every app has', () => {
    expect(links({ external_games: [{ external_game_source: 1, uid: '620' }] })).toEqual([
      { store: 'steam', url: 'https://store.steampowered.com/app/620' },
    ])
  })

  it('has none when IGDB lists none', () => {
    expect(links({})).toEqual([])
  })
})
