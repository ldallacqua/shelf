import { describe, expect, it } from 'vitest'

import { countBoxes, groupLibrary, isGrouping } from '@/domain/library/group'
import {
  emptyNames,
  type LibraryGame,
  type LibraryNames,
  type LibraryPlatform,
} from '@/domain/library/library'
import { sortByTitle, titleKey } from '@/domain/library/sort'
import { libraryStats } from '@/domain/library/stats'
import {
  arrangeLibrary,
  arrangeOnce,
  buildFirstScreen,
  firstScreenShelves,
  keepFirstScreen,
  parseLibraryQuery,
  shareFirstBoxes,
} from '@/domain/library/view'

const platform = (id: number, key: string, family: LibraryPlatform['family']): LibraryPlatform => ({
  id,
  key,
  name: key.toUpperCase(),
  short: key.toUpperCase(),
  family,
  shape: 'bluRay',
  plastic: 'blue',
})

// In shelf order, as the library file gives them.
const names: LibraryNames = {
  ...emptyNames(),
  platform: [
    platform(167, 'ps5', 'playstation'),
    platform(130, 'switch', 'nintendo'),
    platform(6, 'pc', 'pc'),
  ],
}

const game = (title: string, extra: Partial<LibraryGame> = {}): LibraryGame => ({
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  title,
  status: 'backlog',
  addedOn: '2024-01-01',
  minutes: 0,
  igdbRatingCount: 0,
  kind: 'main',
  featured: false,
  hasNotes: false,
  copies: [],
  genres: [],
  themes: [],
  modes: [],
  perspectives: [],
  platforms: [],
  franchises: [],
  series: [],
  developers: [],
  publishers: [],
  tags: [],
  ...extra,
})

const on = (...platforms: number[]) => ({
  copies: platforms.map((id) => ({ platform: id, format: 'physical' as const })),
})

const hades = game('Hades', { ...on(130, 6), year: 2020, status: 'completed', minutes: 1500 })
const celeste = game('Celeste', { ...on(130), year: 2018, status: 'playing', minutes: 200 })
const astro = game('Astro Bot', { ...on(167), year: 2024, status: 'completed', minutes: 700 })
const witcher = game('The Witcher 3: Wild Hunt', { ...on(6), year: 2015 })
const silksong = game('Hollow Knight: Silksong', { status: 'wishlist' })
const all = [hades, celeste, astro, witcher, silksong]

const titles = (shelf: { items: { game: LibraryGame }[] }) =>
  shelf.items.map((item) => item.game.title)

describe('titleKey and sortByTitle (spec 6)', () => {
  it('ignores a leading The, A or An', () => {
    expect(titleKey('The Witcher 3')).toBe('Witcher 3')
    expect(titleKey('A Way Out')).toBe('Way Out')
    expect(titleKey('An Example')).toBe('Example')
    expect(titleKey('Anthem')).toBe('Anthem')
    expect(titleKey('Theatrhythm')).toBe('Theatrhythm')
  })

  it('files The Witcher under W', () => {
    expect(sortByTitle(all, 'en').map((item) => item.title)).toEqual([
      'Astro Bot',
      'Celeste',
      'Hades',
      'Hollow Knight: Silksong',
      'The Witcher 3: Wild Hunt',
    ])
  })

  it('ignores case and accents, and reads 2 before 10', () => {
    const sorted = sortByTitle(
      [game('Final Fantasy 10'), game('final fantasy 2'), game('Ōkami'), game('Okami HD')],
      'en',
    )
    expect(sorted.map((item) => item.title)).toEqual([
      'final fantasy 2',
      'Final Fantasy 10',
      'Ōkami',
      'Okami HD',
    ])
  })

  it('puts same-titled games oldest first, and never depends on the order given', () => {
    const remake = game('Resident Evil 4', { slug: 'resident-evil-4--1', year: 2023 })
    const original = game('Resident Evil 4', { slug: 'resident-evil-4', year: 2005 })
    expect(sortByTitle([remake, original], 'en')).toEqual([original, remake])
    expect(sortByTitle([original, remake], 'en')).toEqual([original, remake])
  })
})

describe('groupLibrary (spec 3.7)', () => {
  const sorted = sortByTitle(all, 'en')

  it('by platform: one shelf per platform owned, in shelf order, then Not owned', () => {
    const shelves = groupLibrary(sorted, names, 'platform')
    expect(shelves.map((shelf) => shelf.key)).toEqual([
      'platform:167',
      'platform:130',
      'platform:6',
      'platform:none',
    ])
    expect(shelves.map(titles)).toEqual([
      ['Astro Bot'],
      ['Celeste', 'Hades'],
      ['Hades', 'The Witcher 3: Wild Hunt'],
      ['Hollow Knight: Silksong'],
    ])
  })

  it('a game owned on two platforms stands on both shelves, each with its own copy', () => {
    const shelves = groupLibrary(sorted, names, 'platform')
    const copiesOfHades = shelves.flatMap((shelf) =>
      shelf.items.filter((item) => item.game === hades).map((item) => item.copy?.platform),
    )
    expect(copiesOfHades).toEqual([130, 6])
    expect(countBoxes(shelves)).toBe(6)
  })

  it('a disc and a download on one platform are one box there', () => {
    const both = game('Both', {
      copies: [
        { platform: 6, format: 'physical' },
        { platform: 6, format: 'digital' },
      ],
    })
    const [shelf] = groupLibrary([both], names, 'platform')
    expect(shelf?.items).toEqual([{ game: both, copy: { platform: 6, format: 'physical' } }])
  })

  it('by status: in the order playing, backlog, completed, dropped, wishlist; empty ones left out', () => {
    const shelves = groupLibrary(sorted, names, 'status')
    expect(shelves.map((shelf) => shelf.key)).toEqual([
      'status:playing',
      'status:backlog',
      'status:completed',
      'status:wishlist',
    ])
    expect(titles(shelves[2] ?? { items: [] })).toEqual(['Astro Bot', 'Hades'])
  })

  it('by year: newest first, unknown years last', () => {
    const shelves = groupLibrary(sorted, names, 'year')
    expect(shelves.map((shelf) => shelf.key)).toEqual([
      'year:2024',
      'year:2020',
      'year:2018',
      'year:2015',
      'year:unknown',
    ])
  })

  it('otherwise a game stands once, with the copy chosen for display', () => {
    const [shelf] = groupLibrary(sorted, names, 'none')
    expect(shelf?.key).toBe('all')
    expect(shelf?.items).toHaveLength(5)
    expect(shelf?.items.find((item) => item.game === hades)?.copy?.platform).toBe(130)
    expect(shelf?.items.find((item) => item.game === silksong)).not.toHaveProperty('copy')
  })

  it('has no shelves for an empty library', () => {
    for (const grouping of ['platform', 'status', 'year', 'none'] as const) {
      expect(groupLibrary([], names, grouping)).toEqual([])
    }
  })

  it('knows a grouping from anything else', () => {
    expect(isGrouping('year')).toBe(true)
    expect(isGrouping('genre')).toBe(false)
    expect(isGrouping(undefined)).toBe(false)
  })
})

describe('libraryStats', () => {
  it('counts each game once, finished games, and whole hours', () => {
    expect(libraryStats(all)).toEqual({ games: 5, finished: 2, hours: 40 })
    expect(libraryStats([])).toEqual({ games: 0, finished: 0, hours: 0 })
  })
})

describe('parseLibraryQuery (spec 2)', () => {
  const defaults = {
    view: 'shelf',
    group: 'platform',
    q: '',
    sort: { key: 'title', descending: false },
    seed: '',
  }

  it('defaults to the shelf, grouped by platform, in title order, with no filter', () => {
    expect(parseLibraryQuery({})).toEqual(defaults)
  })

  it('reads the view, the grouping, the filter, the sort and the seed', () => {
    expect(
      parseLibraryQuery({
        view: 'list',
        group: 'year',
        q: 'status:backlog genre:rpg',
        sort: '-rating',
        seed: 'k3x9',
      }),
    ).toEqual({
      view: 'list',
      group: 'year',
      q: 'status:backlog genre:rpg',
      sort: { key: 'rating', descending: true },
      seed: 'k3x9',
    })
  })

  it('falls back to the default for anything it does not know', () => {
    expect(parseLibraryQuery({ view: 'cube', group: ['status', 'year'] })).toEqual({
      ...defaults,
      group: 'status',
    })
    expect(
      parseLibraryQuery({ view: '', group: '<script>', sort: '-colour', seed: 'a b' }),
    ).toEqual(defaults)
    expect(parseLibraryQuery({ sort: '-random' }).sort).toEqual({
      key: 'random',
      descending: false,
    })
  })

  it('keeps a filter it cannot read, for the page to show what was ignored', () => {
    expect(parseLibraryQuery({ q: 'colour:red' }).q).toBe('colour:red')
    expect(parseLibraryQuery({ q: 'x'.repeat(5000) }).q).toHaveLength(1000)
  })
})

describe('arranging once', () => {
  it('gives the shelves arrangeLibrary gives', () => {
    for (const group of ['platform', 'status', 'year', 'none'] as const) {
      expect(arrangeOnce(all, names, { group }, 'en')).toEqual(
        arrangeLibrary(all, names, { group }, 'en'),
      )
    }
  })

  it('answers with the same shelves when asked again', () => {
    const games = [...all]
    const shelves = arrangeOnce(games, names, { group: 'platform' }, 'en')
    expect(arrangeOnce(games, names, { group: 'platform' }, 'en')).toBe(shelves)
  })

  it('works them out anew for another grouping, language or list of games', () => {
    const games = [...all]
    const shelves = arrangeOnce(games, names, { group: 'platform' }, 'en')
    expect(arrangeOnce(games, names, { group: 'status' }, 'en')).not.toBe(shelves)
    expect(arrangeOnce(games, names, { group: 'platform' }, 'pt-BR')).not.toBe(shelves)
    expect(arrangeOnce([...games], names, { group: 'platform' }, 'en')).not.toBe(shelves)
  })
})

describe('sharing out the first boxes', () => {
  it('gives each shelf what it holds, in order, until the limit is spoken for', () => {
    expect(shareFirstBoxes([10, 30, 20, 5], 48)).toEqual([10, 30, 8, 0])
  })

  it('gives everything when the library is smaller than the limit', () => {
    expect(shareFirstBoxes([3, 4], 48)).toEqual([3, 4])
  })

  it('gives nothing for no limit, or a nonsense one', () => {
    expect(shareFirstBoxes([3, 4], 0)).toEqual([0, 0])
    expect(shareFirstBoxes([3, 4], -5)).toEqual([0, 0])
  })
})

describe('the first screen', () => {
  const library = { version: 9, games: all, names }

  it('outlines every shelf and sends only the first boxes', () => {
    const first = buildFirstScreen(library, { group: 'platform' }, 'en', 2)
    expect(first.version).toBe(9)
    expect(first.stats).toEqual({ games: 5, finished: 2, hours: 40 })
    expect(first.outline).toEqual([
      { key: 'platform:167', count: 1, known: 1 },
      { key: 'platform:130', count: 2, known: 1 },
      { key: 'platform:6', count: 2, known: 0 },
      { key: 'platform:none', count: 1, known: 0 },
    ])
    expect(first.games.map((item) => item.title)).toEqual(['Astro Bot', 'Celeste'])
  })

  it('draws each shelf with exactly the boxes it was sent, in their final places', () => {
    // Hades comes for the Switch shelf. It also belongs on the PC shelf, but
    // that shelf's first box is not known yet, so it must not appear there.
    const first = buildFirstScreen(library, { group: 'platform' }, 'en', 3)
    const shelves = firstScreenShelves(first, 'en')
    expect(shelves.map((shelf) => [shelf.key, titles(shelf), shelf.total])).toEqual([
      ['platform:167', ['Astro Bot'], 1],
      ['platform:130', ['Celeste', 'Hades'], 2],
      ['platform:6', [], 2],
    ])
  })

  it('keeps the objects that came with the page when the whole library arrives', () => {
    const first = buildFirstScreen(library, { group: 'platform' }, 'en', 2)
    // The file is the same library, read again: equal, but not the same objects.
    const file = structuredClone(library)
    const whole = keepFirstScreen(file, first)

    expect(whole).toEqual(file)
    const byTitle = (title: string) => whole.games.find((game) => game.title === title)
    expect(byTitle('Astro Bot')).toBe(first.games[0])
    expect(byTitle('Celeste')).toBe(first.games[1])
    // A game that did not come with the page is the file's.
    expect(byTitle('Hades')).toBe(file.games.find((game) => game.title === 'Hades'))
    expect(whole.names.platform[0]).toBe(first.platforms[0])
  })

  it('gives the very same library when asked again about the same file and page', () => {
    const first = buildFirstScreen(library, { group: 'platform' }, 'en', 2)
    const file = structuredClone(library)
    expect(keepFirstScreen(file, first)).toBe(keepFirstScreen(file, first))
  })

  it('keeps nothing from a page built for another version of the library', () => {
    const first = buildFirstScreen(library, { group: 'platform' }, 'en', 2)
    const file = { ...structuredClone(library), version: 10 }
    expect(keepFirstScreen(file, first)).toBe(file)
  })

  it('matches the full arrangement box for box', () => {
    for (const group of ['platform', 'status', 'year', 'none'] as const) {
      const full = arrangeLibrary(all, names, { group }, 'en')
      const first = firstScreenShelves(buildFirstScreen(library, { group }, 'en', 4), 'en')
      for (const shelf of first) {
        const whole = full.find((item) => item.key === shelf.key)
        expect(titles(shelf)).toEqual(titles(whole ?? { items: [] }).slice(0, shelf.items.length))
      }
    }
  })
})
