import type { Palette } from '@/domain/color/palette'
import { testGame, testLibrary, testPlatform } from '@/domain/library/testing'
import type { Library, LibraryGame } from '@/domain/library/library'

/**
 * A small library to duel with, for the duel's stories and tests only. No cover is stored or
 * drawn: each game is a wash of its own colors, as a cover is before it arrives.
 */

const palettes: Palette[] = [
  ['#5b8cff', '#1d2a55', '#0c1022'],
  ['#ff8a3d', '#5a2a12', '#1a0d07'],
  ['#3ddc97', '#174d3a', '#08160f'],
  ['#e04f8f', '#4b1630', '#14070e'],
  ['#f2c94c', '#5a4a12', '#1a1505'],
  ['#9b6bff', '#33205a', '#0f0a1c'],
]

const samples: [string, Partial<LibraryGame>][] = [
  [
    'Celeste',
    {
      length: 8 * 60,
      hastyShare: 60,
      igdbRating: 90,
      igdbRatingCount: 820,
      year: 2018,
      genres: [1, 2],
      modes: [1],
      copies: [{ platform: 130, format: 'digital' }],
      addedOn: '2023-03-02',
    },
  ],
  [
    'Hades',
    {
      length: 22 * 60,
      hastyShare: 70,
      igdbRating: 93,
      igdbRatingCount: 1200,
      year: 2020,
      genres: [3, 2],
      modes: [1],
      minutes: 140,
      copies: [{ platform: 6, format: 'digital' }],
      addedOn: '2024-06-10',
    },
  ],
  [
    'Hollow Knight',
    {
      length: 27 * 60,
      igdbRating: 91,
      igdbRatingCount: 1500,
      year: 2017,
      genres: [1, 2, 4],
      modes: [1],
      copies: [{ platform: 130, format: 'physical' }],
      addedOn: '2022-11-20',
    },
  ],
  [
    'Outer Wilds',
    {
      length: 19 * 60,
      igdbRating: 87,
      igdbRatingCount: 600,
      year: 2019,
      genres: [4, 2],
      modes: [1],
      copies: [{ platform: 6, format: 'digital' }],
      addedOn: '2025-01-15',
    },
  ],
  [
    'Disco Elysium',
    {
      length: 33 * 60,
      igdbRating: 91,
      igdbRatingCount: 900,
      year: 2019,
      genres: [5],
      modes: [1],
      copies: [{ platform: 6, format: 'digital' }],
      addedOn: '2021-08-01',
    },
  ],
  [
    'Inside',
    {
      length: 4 * 60,
      igdbRating: 89,
      igdbRatingCount: 700,
      year: 2016,
      genres: [1, 4],
      modes: [1],
      copies: [{ platform: 6, format: 'digital' }],
      addedOn: '2026-02-01',
    },
  ],
  [
    'Tunic',
    {
      length: 18 * 60,
      igdbRating: 87,
      igdbRatingCount: 300,
      year: 2022,
      genres: [4, 2],
      modes: [1],
      copies: [{ platform: 130, format: 'digital' }],
      addedOn: '2025-09-09',
    },
  ],
  [
    'Return of the Obra Dinn',
    {
      length: 10 * 60,
      igdbRating: 92,
      igdbRatingCount: 400,
      year: 2018,
      genres: [6, 2],
      modes: [1],
      copies: [{ platform: 6, format: 'digital' }],
      addedOn: '2024-12-24',
    },
  ],
  [
    'Silksong',
    {
      status: 'wishlist',
      length: 30 * 60,
      igdbRating: 88,
      igdbRatingCount: 200,
      year: 2025,
      genres: [1, 2],
      modes: [1],
      wanted: [130],
      addedOn: '2025-09-04',
    },
  ],
  [
    'Final Fantasy XVI',
    {
      status: 'playing',
      length: 50 * 60,
      hastyShare: 70,
      igdbRating: 87,
      igdbRatingCount: 500,
      year: 2023,
      genres: [5],
      modes: [1],
      minutes: 12 * 60,
      copies: [{ platform: 167, format: 'physical' }],
      addedOn: '2023-07-01',
    },
  ],
]

/** The sample games, each in its own colors, a backlog of eight with a wish and one being played. */
export const sampleGames: LibraryGame[] = samples.map(([title, extra], index) =>
  testGame(title, { colors: palettes[index % palettes.length], ...extra }),
)

export const sampleLibrary: Library = testLibrary(sampleGames, {
  genre: [
    { id: 1, name: 'Platform', slug: 'platform' },
    { id: 2, name: 'Indie', slug: 'indie' },
    { id: 3, name: 'Roguelike', slug: 'roguelike' },
    { id: 4, name: 'Adventure', slug: 'adventure' },
    { id: 5, name: 'Role-playing (RPG)', slug: 'role-playing-rpg' },
    { id: 6, name: 'Puzzle', slug: 'puzzle' },
  ],
  mode: [{ id: 1, name: 'Single player', slug: 'single-player' }],
  platform: [
    testPlatform(6, 'pc', 'pc', 'PC'),
    testPlatform(130, 'switch', 'nintendo', 'Switch'),
    testPlatform(167, 'ps5', 'playstation', 'PS5'),
  ],
})

export const sampleBySlug = new Map(sampleGames.map((game) => [game.slug, game]))

/** The sample game with this title, by its address. */
export const slugOf = (title: string): string =>
  sampleGames.find((game) => game.title === title)?.slug ?? title
