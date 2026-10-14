import { isHex, type Palette } from '@/domain/color/palette'
import {
  emptyNames,
  type Library,
  type LibraryCopy,
  type LibraryGame,
  type LibraryNames,
  type LibraryPlatform,
  type Named,
} from '@/domain/library/library'
import { formats, kinds, statuses, type Day } from '@/domain/library/values'
import type { GameKeywords } from '@/domain/query/evaluate'
import { caseShapes, families, plastics } from '@/domain/platforms/platforms'

/**
 * The library file: the whole library in one compact JSON document, fetched
 * once and cached by its version. Games are rows of values, not objects with
 * keys, and enumerations are positions in a list. That keeps a thousand games
 * near 100 KB compressed and quick to parse.
 *
 * This module uses no validation library on purpose: the browser decodes a
 * file our own server wrote, and Zod would add its weight to every page.
 * `decodeLibrary` still refuses a file of the wrong format.
 */

/** Raised whenever the row layout changes, so an old cached file is never misread. */
export const SNAPSHOT_FORMAT = 1

type CopyRow = [platform: number, format: number, cover?: string]

type GameRow = [
  slug: string,
  title: string,
  status: number,
  rating: number | null,
  addedOn: number,
  completedOn: number | null,
  minutes: number,
  releasedOn: number | null,
  igdbRating: number | null,
  igdbRatingCount: number,
  length: number | null,
  kind: number,
  cover: string,
  coverRatio: number,
  colors: string,
  hash: string,
  flags: number,
  copies: CopyRow[],
  genres: number[],
  themes: number[],
  modes: number[],
  perspectives: number[],
  platforms: number[],
  franchises: number[],
  series: number[],
  developers: number[],
  publishers: number[],
  tags: number[],
]

type NamedRow = [id: number, name: string, slug: string]

type PlatformRow = [
  id: number,
  key: string,
  name: string,
  short: string,
  family: number,
  generation: number | null,
  shape: number,
  plastic: number,
]

export type SnapshotFile = {
  format: number
  version: number
  names: {
    genre: NamedRow[]
    theme: NamedRow[]
    mode: NamedRow[]
    perspective: NamedRow[]
    franchise: NamedRow[]
    series: NamedRow[]
    company: NamedRow[]
    platform: PlatformRow[]
    tag: [name: string, slug: string][]
  }
  games: GameRow[]
}

const FEATURED = 1
const HAS_NOTES = 2

const DAY_MS = 86_400_000

/** A day as a whole number of days since 1970: five digits where a date takes ten. */
export const dayToNumber = (day: Day): number => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)

export const numberToDay = (days: number): Day => new Date(days * DAY_MS).toISOString().slice(0, 10)

const packColors = (colors: Palette | undefined): string =>
  colors ? colors.map((color) => color.slice(1)).join('') : ''

const unpackColors = (packed: string): Palette | undefined => {
  if (packed.length !== 18) return undefined
  const colors = [0, 6, 12].map((start) => `#${packed.slice(start, start + 6)}`)
  return colors.every(isHex) ? (colors as unknown as Palette) : undefined
}

const position = <T>(list: readonly T[], value: T): number => Math.max(0, list.indexOf(value))

const encodeGame = (game: LibraryGame): GameRow => [
  game.slug,
  game.title,
  position(statuses, game.status),
  game.rating ?? null,
  dayToNumber(game.addedOn),
  game.completedOn ? dayToNumber(game.completedOn) : null,
  game.minutes,
  game.releasedOn ? dayToNumber(game.releasedOn) : null,
  game.igdbRating ?? null,
  game.igdbRatingCount,
  game.length ?? null,
  position(kinds, game.kind),
  game.cover ?? '',
  game.coverRatio ?? 0,
  packColors(game.colors),
  game.hash ?? '',
  (game.featured ? FEATURED : 0) | (game.hasNotes ? HAS_NOTES : 0),
  game.copies.map((copy): CopyRow => {
    const row: CopyRow = [copy.platform, position(formats, copy.format)]
    if (copy.cover) row.push(copy.cover)
    return row
  }),
  game.genres,
  game.themes,
  game.modes,
  game.perspectives,
  game.platforms,
  game.franchises,
  game.series,
  game.developers,
  game.publishers,
  game.tags,
]

const decodeGame = (row: GameRow): LibraryGame => {
  const game: LibraryGame = {
    slug: row[0],
    title: row[1],
    status: statuses[row[2]] ?? 'backlog',
    addedOn: numberToDay(row[4]),
    minutes: row[6],
    igdbRatingCount: row[9],
    kind: kinds[row[11]] ?? 'other',
    featured: (row[16] & FEATURED) !== 0,
    hasNotes: (row[16] & HAS_NOTES) !== 0,
    copies: row[17].map((copy) => {
      const decoded: LibraryCopy = { platform: copy[0], format: formats[copy[1]] ?? 'physical' }
      if (copy[2]) decoded.cover = copy[2]
      return decoded
    }),
    genres: row[18],
    themes: row[19],
    modes: row[20],
    perspectives: row[21],
    platforms: row[22],
    franchises: row[23],
    series: row[24],
    developers: row[25],
    publishers: row[26],
    tags: row[27],
  }
  if (row[3] !== null) game.rating = row[3]
  if (row[5] !== null) game.completedOn = numberToDay(row[5])
  if (row[7] !== null) {
    game.releasedOn = numberToDay(row[7])
    game.year = Number(game.releasedOn.slice(0, 4))
  }
  if (row[8] !== null) game.igdbRating = row[8]
  if (row[10] !== null) game.length = row[10]
  if (row[12]) game.cover = row[12]
  if (row[13]) game.coverRatio = row[13]
  const colors = unpackColors(row[14])
  if (colors) game.colors = colors
  if (row[15]) game.hash = row[15]
  return game
}

const encodeNamed = (items: readonly Named[]): NamedRow[] =>
  items.map((item) => [item.id, item.name, item.slug])

const decodeNamed = (rows: readonly NamedRow[] | undefined): Named[] =>
  (rows ?? []).map(([id, name, slug]) => ({ id, name, slug }))

const encodePlatform = (platform: LibraryPlatform): PlatformRow => [
  platform.id,
  platform.key,
  platform.name,
  platform.short,
  position(families, platform.family),
  platform.generation ?? null,
  position(caseShapes, platform.shape),
  position(plastics, platform.plastic),
]

const decodePlatform = (row: PlatformRow): LibraryPlatform => {
  const platform: LibraryPlatform = {
    id: row[0],
    key: row[1],
    name: row[2],
    short: row[3],
    family: families[row[4]] ?? 'other',
    shape: caseShapes[row[6]] ?? 'keepCase',
    plastic: plastics[row[7]] ?? 'black',
  }
  if (row[5] !== null) platform.generation = row[5]
  return platform
}

export const encodeLibrary = (library: Library): SnapshotFile => ({
  format: SNAPSHOT_FORMAT,
  version: library.version,
  names: {
    genre: encodeNamed(library.names.genre),
    theme: encodeNamed(library.names.theme),
    mode: encodeNamed(library.names.mode),
    perspective: encodeNamed(library.names.perspective),
    franchise: encodeNamed(library.names.franchise),
    series: encodeNamed(library.names.series),
    company: encodeNamed(library.names.company),
    platform: library.names.platform.map(encodePlatform),
    tag: library.names.tag.map((tag) => [tag.name, tag.slug]),
  },
  games: library.games.map(encodeGame),
})

export class SnapshotFormatError extends Error {
  constructor(found: unknown) {
    super(`Library file format ${String(found)} is not ${SNAPSHOT_FORMAT}`)
    this.name = 'SnapshotFormatError'
  }
}

export const decodeLibrary = (file: SnapshotFile): Library => {
  if (file?.format !== SNAPSHOT_FORMAT) throw new SnapshotFormatError(file?.format)
  const names: LibraryNames = {
    ...emptyNames(),
    genre: decodeNamed(file.names.genre),
    theme: decodeNamed(file.names.theme),
    mode: decodeNamed(file.names.mode),
    perspective: decodeNamed(file.names.perspective),
    franchise: decodeNamed(file.names.franchise),
    series: decodeNamed(file.names.series),
    company: decodeNamed(file.names.company),
    platform: (file.names.platform ?? []).map(decodePlatform),
    tag: (file.names.tag ?? []).map(([name, slug]) => ({ name, slug })),
  }
  return { version: file.version, names, games: file.games.map(decodeGame) }
}

/** The keywords file: every game's keyword ids by slug, and the keywords' names. */
export type KeywordsFile = {
  format: number
  version: number
  names: NamedRow[]
  games: Record<string, number[]>
}

export const encodeKeywords = (version: number, keywords: GameKeywords): KeywordsFile => ({
  format: SNAPSHOT_FORMAT,
  version,
  names: encodeNamed(keywords.names),
  games: keywords.games as Record<string, number[]>,
})

export const decodeKeywords = (file: KeywordsFile): GameKeywords => {
  if (file?.format !== SNAPSHOT_FORMAT) throw new SnapshotFormatError(file?.format)
  return { names: decodeNamed(file.names), games: file.games ?? {} }
}
