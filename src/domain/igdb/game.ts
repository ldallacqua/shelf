import type { IgdbGame, IgdbLineage, IgdbTimeToBeat } from '@/domain/igdb/schema'
import { dayOf, type Day, type Format, type Kind } from '@/domain/library/values'

/**
 * Turns an IGDB record into Shelf's own shape. This is the only place that
 * knows IGDB's field names and numeric codes; everything after it reads
 * `GameData`.
 */

export type GameImage = { id: string; width: number; height: number }

export type GameArtwork = GameImage & {
  /** `key` is key art without a logo: the best backdrop. */
  type: 'key' | 'key-logo' | 'art' | 'concept' | 'other'
}

export type Company = { id: number; name: string; slug: string }

export type StoreSource = 'steam' | 'gog' | 'epic' | 'microsoft' | 'playstation'

export type StoreId = {
  source: StoreSource
  uid: string
  platform?: number
  format?: Format
}

export type Release = {
  platform: number
  /** Missing when IGDB knows only the year. */
  day?: Day
  year?: number
}

/** How this record relates to the one above it in its family. */
export type FamilyLink = 'edition' | 'port' | 'remaster' | 'expanded' | 'remake'

/** One step up the family: the record reached, and how. */
export type LineageStep = { igdbId: number; via: FamilyLink }

/** Minutes for three ways of playing. */
export type Length = { hastily?: number; normally?: number; completely?: number }

export type GameData = {
  igdbId: number
  slug: string
  title: string
  kind: Kind
  /** A subtitle IGDB gives to editions, for example "Definitive Edition". */
  versionTitle?: string
  releasedOn?: Day
  year?: number
  cover?: GameImage
  summary?: string
  storyline?: string
  /** IGDB's combined rating, 0 to 100, rounded. */
  igdbRating?: number
  igdbRatingCount: number
  length?: Length
  genres: number[]
  themes: number[]
  modes: number[]
  perspectives: number[]
  platforms: number[]
  franchises: number[]
  series: number[]
  keywords: number[]
  developers: number[]
  publishers: number[]
  /** Every company named on the record, so their names can be stored. */
  companies: Company[]
  screenshots: GameImage[]
  artworks: GameArtwork[]
  releases: Release[]
  storeIds: StoreId[]
  /** The record this one points up to, and how. Absent for a game that stands alone. */
  parent?: LineageStep
  igdbUrl?: string
  /** When IGDB last changed the record, in milliseconds. */
  igdbUpdatedAt?: number
}

// IGDB's `game_types`, read from the live API on 13 Oct 2026.
const KIND_BY_TYPE: Record<number, Kind> = {
  0: 'main',
  3: 'bundle',
  4: 'expansion', // standalone expansion: a game in its own right
  8: 'remake',
  9: 'remaster',
  10: 'expanded',
  11: 'port',
}

/** DLC, mods, episodes, seasons, packs and updates: not games Shelf tracks. */
const NOT_A_GAME = new Set([1, 2, 5, 6, 7, 13, 14])

export const kindOf = (record: Pick<IgdbGame, 'game_type'>): Kind =>
  KIND_BY_TYPE[record.game_type?.id ?? 0] ?? 'other'

/** One definition of what counts as a game, shared by search and by adding. */
export const isGame = (record: Pick<IgdbGame, 'game_type'>): boolean =>
  !NOT_A_GAME.has(record.game_type?.id ?? 0)

const LINK_BY_KIND: Partial<Record<Kind, FamilyLink>> = {
  port: 'port',
  remaster: 'remaster',
  expanded: 'expanded',
  remake: 'remake',
}

/**
 * The record above this one in its family, if any. An edition points at its
 * game through `version_parent`. A port, remaster, expanded game or remake
 * points at its original through `parent_game`. Anything else with a parent
 * (a bundle, a standalone expansion) is a different game, so it has no link.
 */
export const parentOf = (record: IgdbLineage): LineageStep | undefined => {
  if (record.version_parent !== undefined && record.version_parent !== record.id) {
    return { igdbId: record.version_parent, via: 'edition' }
  }
  const via = LINK_BY_KIND[kindOf(record)]
  if (via && record.parent_game !== undefined && record.parent_game !== record.id) {
    return { igdbId: record.parent_game, via }
  }
  return undefined
}

// IGDB's `external_game_sources`.
const STORE_BY_SOURCE: Record<number, StoreSource> = {
  1: 'steam',
  5: 'gog',
  11: 'microsoft',
  26: 'epic',
  36: 'playstation',
}

// IGDB's `game_release_formats`.
const FORMAT_BY_CODE: Record<number, Format> = { 1: 'digital', 2: 'physical' }

// IGDB's `artwork_types`.
const ARTWORK_BY_TYPE: Record<number, GameArtwork['type']> = {
  1: 'art',
  2: 'key',
  3: 'key-logo',
  4: 'concept',
}

/** Logos, infographics, icons and alternative covers are not backdrops. */
const BACKDROP_TYPES = new Set([1, 2, 3, 4])

// Some IGDB dates are outside what makes sense for a game; those are dropped.
const EARLIEST = Date.UTC(1950, 0, 1) / 1000
const LATEST = Date.UTC(2100, 0, 1) / 1000

const dayFromSeconds = (seconds: number | undefined): Day | undefined =>
  seconds !== undefined && seconds >= EARLIEST && seconds < LATEST
    ? dayOf(seconds * 1000)
    : undefined

const toImage = (image: {
  image_id: string
  width?: number
  height?: number
}): GameImage | undefined =>
  image.width && image.height
    ? { id: image.image_id, width: image.width, height: image.height }
    : undefined

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)]

const minutes = (seconds: number | undefined): number | undefined =>
  seconds && seconds > 0 ? Math.round(seconds / 60) : undefined

export const toLength = (time: IgdbTimeToBeat | undefined): Length | undefined => {
  if (!time) return undefined
  const length: Length = {}
  const hastily = minutes(time.hastily)
  const normally = minutes(time.normally)
  const completely = minutes(time.completely)
  if (hastily) length.hastily = hastily
  if (normally) length.normally = normally
  if (completely) length.completely = completely
  return Object.keys(length).length > 0 ? length : undefined
}

/** The one figure used for "time to beat": a normal playthrough, or the nearest known. */
export const lengthMinutes = (length: Length | undefined): number | undefined =>
  length?.normally ?? length?.hastily ?? length?.completely

/** How many screenshots and backdrops are kept per game. */
const MAX_SCREENSHOTS = 12
const MAX_ARTWORKS = 6

const ARTWORK_ORDER: GameArtwork['type'][] = ['key', 'key-logo', 'art', 'concept', 'other']

export const toGameData = (record: IgdbGame, time?: IgdbTimeToBeat): GameData => {
  const releasedOn = dayFromSeconds(record.first_release_date)
  const companies = new Map<number, Company>()
  for (const { company } of record.involved_companies) companies.set(company.id, company)

  const artworks = record.artworks
    .filter((art) => art.artwork_type === undefined || BACKDROP_TYPES.has(art.artwork_type))
    .flatMap((art): GameArtwork[] => {
      const image = toImage(art)
      // A backdrop is wide. Portrait artwork is poster art and crops badly.
      if (!image || image.width < image.height) return []
      return [{ ...image, type: ARTWORK_BY_TYPE[art.artwork_type ?? 0] ?? 'other' }]
    })
    .sort((a, b) => ARTWORK_ORDER.indexOf(a.type) - ARTWORK_ORDER.indexOf(b.type))
    .slice(0, MAX_ARTWORKS)

  const releases = new Map<string, Release>()
  for (const release of record.release_dates) {
    if (release.platform === undefined) continue
    const day = dayFromSeconds(release.date)
    const year = day ? Number(day.slice(0, 4)) : release.y
    // Keep the earliest release per platform: regions are not shown.
    const key = String(release.platform)
    const known = releases.get(key)
    const earlier =
      !known || (day && (!known.day || day < known.day)) || (!known.day && !known.year && year)
    if (earlier) {
      const next: Release = { platform: release.platform }
      if (day) next.day = day
      if (year) next.year = year
      releases.set(key, next)
    }
  }

  const storeIds = new Map<string, StoreId>()
  for (const external of record.external_games) {
    const source = STORE_BY_SOURCE[external.external_game_source ?? -1]
    if (!source || !external.uid) continue
    const store: StoreId = { source, uid: external.uid }
    if (external.platform !== undefined) store.platform = external.platform
    const format = FORMAT_BY_CODE[external.game_release_format ?? -1]
    if (format) store.format = format
    storeIds.set(`${source}:${external.uid}`, store)
  }

  const data: GameData = {
    igdbId: record.id,
    slug: record.slug,
    title: record.name.trim(),
    kind: kindOf(record),
    igdbRatingCount: record.total_rating_count ?? 0,
    genres: unique(record.genres),
    themes: unique(record.themes),
    modes: unique(record.game_modes),
    perspectives: unique(record.player_perspectives),
    platforms: unique(record.platforms),
    franchises: unique([
      ...(record.franchise === undefined ? [] : [record.franchise]),
      ...record.franchises,
    ]),
    series: unique(record.collections),
    keywords: unique(record.keywords),
    developers: unique(
      record.involved_companies.filter((c) => c.developer).map((c) => c.company.id),
    ),
    publishers: unique(
      record.involved_companies.filter((c) => c.publisher).map((c) => c.company.id),
    ),
    companies: [...companies.values()],
    screenshots: record.screenshots
      .flatMap((shot) => toImage(shot) ?? [])
      .slice(0, MAX_SCREENSHOTS),
    artworks,
    releases: [...releases.values()],
    storeIds: [...storeIds.values()],
  }

  if (record.version_title?.trim()) data.versionTitle = record.version_title.trim()
  if (releasedOn) {
    data.releasedOn = releasedOn
    data.year = Number(releasedOn.slice(0, 4))
  }
  const cover = record.cover && toImage(record.cover)
  if (cover) data.cover = cover
  if (record.summary?.trim()) data.summary = record.summary.trim()
  if (record.storyline?.trim()) data.storyline = record.storyline.trim()
  if (record.total_rating !== undefined && data.igdbRatingCount > 0) {
    data.igdbRating = Math.min(100, Math.max(0, Math.round(record.total_rating)))
  }
  const length = toLength(time)
  if (length) data.length = length
  const parent = parentOf(record)
  if (parent) data.parent = parent
  if (record.url) data.igdbUrl = record.url
  if (record.updated_at) data.igdbUpdatedAt = record.updated_at * 1000

  return data
}
