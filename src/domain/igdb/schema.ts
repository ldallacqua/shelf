import { z } from 'zod'

/**
 * The shape of what IGDB sends, for the fields Shelf asks for. Every response
 * passes one of these schemas before anything else touches it. Unknown fields
 * are dropped; a record that does not fit is skipped by the client, never
 * half-stored.
 */

const id = z.number().int().nonnegative()
const ids = z.array(id).default([])

const image = z.object({
  image_id: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

const artwork = image.extend({
  artwork_type: id.optional(),
})

const involvedCompany = z.object({
  company: z.object({
    id,
    name: z.string().min(1),
    slug: z.string().min(1),
  }),
  developer: z.boolean().default(false),
  publisher: z.boolean().default(false),
  porting: z.boolean().default(false),
  supporting: z.boolean().default(false),
})

const releaseDate = z.object({
  platform: id.optional(),
  date: z.number().optional(),
  y: z.number().int().optional(),
  release_region: id.optional(),
})

const externalGame = z.object({
  uid: z.string().optional(),
  external_game_source: id.optional(),
  platform: id.optional(),
  game_release_format: id.optional(),
})

export const igdbGameSchema = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
  // Asked for expanded (`game_type.type`), but tolerated as a bare id.
  game_type: z.union([z.object({ id }), id.transform((value) => ({ id: value }))]).optional(),
  first_release_date: z.number().optional(),
  cover: image.optional(),
  genres: ids,
  themes: ids,
  game_modes: ids,
  player_perspectives: ids,
  platforms: ids,
  franchise: id.optional(),
  franchises: ids,
  collections: ids,
  keywords: ids,
  involved_companies: z.array(involvedCompany).default([]),
  total_rating: z.number().optional(),
  total_rating_count: z.number().int().nonnegative().optional(),
  summary: z.string().optional(),
  storyline: z.string().optional(),
  screenshots: z.array(image).default([]),
  artworks: z.array(artwork).default([]),
  parent_game: id.optional(),
  version_parent: id.optional(),
  version_title: z.string().optional(),
  remakes: ids,
  remasters: ids,
  ports: ids,
  expanded_games: ids,
  release_dates: z.array(releaseDate).default([]),
  external_games: z.array(externalGame).default([]),
  updated_at: z.number().optional(),
  url: z.string().optional(),
})

export type IgdbGame = z.infer<typeof igdbGameSchema>

/** The fields the game schema reads. One list, so the query and the schema cannot drift. */
export const igdbGameFields = [
  'name',
  'slug',
  'game_type.type',
  'first_release_date',
  'cover.image_id',
  'cover.width',
  'cover.height',
  'genres',
  'themes',
  'game_modes',
  'player_perspectives',
  'platforms',
  'franchise',
  'franchises',
  'collections',
  'keywords',
  'involved_companies.company.name',
  'involved_companies.company.slug',
  'involved_companies.developer',
  'involved_companies.publisher',
  'involved_companies.porting',
  'involved_companies.supporting',
  'total_rating',
  'total_rating_count',
  'summary',
  'storyline',
  'screenshots.image_id',
  'screenshots.width',
  'screenshots.height',
  'artworks.image_id',
  'artworks.width',
  'artworks.height',
  'artworks.artwork_type',
  'parent_game',
  'version_parent',
  'version_title',
  'remakes',
  'remasters',
  'ports',
  'expanded_games',
  'release_dates.platform',
  'release_dates.date',
  'release_dates.y',
  'release_dates.release_region',
  'external_games.uid',
  'external_games.external_game_source',
  'external_games.platform',
  'external_games.game_release_format',
  'updated_at',
  'url',
] as const

/**
 * The few fields needed to place a record in its family: what it is, and
 * what it points up to.
 */
export const igdbLineageSchema = igdbGameSchema.pick({
  id: true,
  game_type: true,
  parent_game: true,
  version_parent: true,
})

export type IgdbLineage = z.infer<typeof igdbLineageSchema>

export const igdbLineageFields = ['game_type', 'parent_game', 'version_parent'] as const

/** One line of a search result: enough to tell same-titled games apart. */
export const igdbSearchHitSchema = igdbGameSchema.pick({
  id: true,
  name: true,
  slug: true,
  game_type: true,
  first_release_date: true,
  cover: true,
  platforms: true,
  parent_game: true,
  version_parent: true,
  total_rating_count: true,
})

export type IgdbSearchHit = z.infer<typeof igdbSearchHitSchema>

export const igdbSearchFields = [
  'name',
  'slug',
  'game_type',
  'first_release_date',
  'cover.image_id',
  'cover.width',
  'cover.height',
  'platforms',
  'parent_game',
  'version_parent',
  'total_rating_count',
] as const

/** How long a game takes, in seconds, from IGDB's `game_time_to_beats`. */
export const igdbTimeToBeatSchema = z.object({
  game_id: id,
  hastily: z.number().nonnegative().optional(),
  normally: z.number().nonnegative().optional(),
  completely: z.number().nonnegative().optional(),
  count: z.number().int().nonnegative().optional(),
})

export type IgdbTimeToBeat = z.infer<typeof igdbTimeToBeatSchema>

export const igdbTimeToBeatFields = [
  'game_id',
  'hastily',
  'normally',
  'completely',
  'count',
] as const

/** A named thing: a genre, a theme, a keyword, a franchise, a series, a company. */
export const igdbNamedSchema = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
})

export type IgdbNamed = z.infer<typeof igdbNamedSchema>

export const igdbNamedFields = ['name', 'slug'] as const

export const igdbPlatformSchema = z.object({
  id,
  name: z.string().min(1),
  slug: z.string().min(1),
  abbreviation: z.string().optional(),
  generation: z.number().int().optional(),
  platform_family: z.object({ id, name: z.string() }).optional(),
  platform_type: z.object({ id, name: z.string() }).optional(),
})

export type IgdbPlatform = z.infer<typeof igdbPlatformSchema>

export const igdbPlatformFields = [
  'name',
  'slug',
  'abbreviation',
  'generation',
  'platform_family.name',
  'platform_type.name',
] as const

/** What Twitch answers when asked for an app token. */
export const twitchTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  token_type: z.string(),
})

/**
 * The lists IGDB keeps as ids on a game, the endpoint each lives at, and the
 * name Shelf files it under.
 */
export const vocabKinds = [
  'genre',
  'theme',
  'mode',
  'perspective',
  'franchise',
  'series',
  'keyword',
  'company',
] as const

export type VocabKind = (typeof vocabKinds)[number]

export const vocabEndpoints: Record<Exclude<VocabKind, 'company'>, string> = {
  genre: 'genres',
  theme: 'themes',
  mode: 'game_modes',
  perspective: 'player_perspectives',
  franchise: 'franchises',
  series: 'collections',
  keyword: 'keywords',
}
