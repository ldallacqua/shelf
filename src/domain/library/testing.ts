import type { Library, LibraryGame, LibraryNames, LibraryPlatform } from '@/domain/library/library'

/**
 * Small libraries made by hand, for the tests of the rules that read one:
 * filters, facets, sorting and grouping. Only tests and stories import this.
 */

export const testPlatform = (
  id: number,
  key: string,
  family: LibraryPlatform['family'],
  name = key.toUpperCase(),
): LibraryPlatform => ({
  id,
  key,
  name,
  short: name,
  family,
  shape: 'bluRay',
  plastic: 'blue',
})

export const testGame = (title: string, extra: Partial<LibraryGame> = {}): LibraryGame => ({
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

/** Copies, all physical, on these platforms. */
export const ownedOn = (...platforms: number[]): Pick<LibraryGame, 'copies'> => ({
  copies: platforms.map((id) => ({ platform: id, format: 'physical' as const })),
})

export const testLibrary = (
  games: LibraryGame[],
  names: Partial<LibraryNames> = {},
  version = 1,
): Library => ({
  version,
  games,
  names: {
    genre: [],
    theme: [],
    mode: [],
    perspective: [],
    franchise: [],
    series: [],
    company: [],
    platform: [],
    tag: [],
    ...names,
  },
})
