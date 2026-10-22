import 'server-only'

import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { imageUrl } from '@/domain/igdb/images'
import {
  refusalReasons,
  type AddedGame,
  type AddInput,
  type Answer,
  type Candidate,
  type Refusal,
  type SearchAnswer,
} from '@/domain/library/adding'
import {
  MAX_ADDITIONS,
  MAX_LINE_LENGTH,
  MAX_MATCH_LINES,
  type MatchAnswer,
} from '@/domain/library/bulk'
import { MAX_NOTES, type OwnerGame } from '@/domain/library/editing'
import { formats, kinds, relations, statuses } from '@/domain/library/values'
import { failure } from '@/server/api/respond'
import type { Done } from '@/server/services/for-account'
import { libraryTag } from '@/server/services/library'

/**
 * The API's writes (architecture, section 16), each to the signed-in
 * account's own library: search IGDB, add, change and remove games. They
 * take the session, the same as the interface, and run the same services.
 * Each body and answer has a schema here, which the OpenAPI document is
 * made from.
 */

const platformId = z.int().positive().describe('An IGDB platform id, from GET /igdb/search')

export const apiSearchResult = z
  .object({
    igdbId: z.int(),
    slug: z.string().describe('IGDB’s address for it'),
    title: z.string(),
    year: z.int().nullable(),
    kind: z.enum(kinds),
    cover: z.url().nullable(),
    platforms: z.array(platformId).describe('The platforms it was released on'),
    alsoOn: z.array(platformId).describe('More platforms, through ports folded into it'),
    onShelf: z
      .object({ slug: z.string(), title: z.string() })
      .nullable()
      .describe('The game in the library it already is, under any version'),
  })
  .meta({ id: 'SearchResult' })

const apiPlatformLabel = z.object({
  id: platformId,
  key: z.string(),
  name: z.string(),
  short: z.string(),
})

export const apiSearchAnswer = z
  .object({
    results: z.array(apiSearchResult).describe('Up to eight, editions left out, ports folded in'),
    platforms: z.array(apiPlatformLabel),
  })
  .meta({ id: 'IgdbSearch' })

export const apiPastedLines = z
  .object({
    lines: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(MAX_LINE_LENGTH * 2),
      )
      .min(1)
      .max(MAX_MATCH_LINES)
      .describe(
        'Titles, one a line. A year in brackets and a platform in square brackets are understood: `Hollow Knight (2017) [Switch]`.',
      ),
  })
  .meta({ id: 'PastedLines' })

export const apiLineMatch = z
  .object({
    text: z.string().describe('The line as sent, spaces tidied'),
    title: z.string(),
    year: z.int().nullable(),
    platform: z.string().nullable().describe('What the square brackets said'),
    platformId: platformId.nullable().describe('The platform they name, when they name one'),
    confidence: z
      .enum(['exact', 'close', 'none'])
      .describe('The title as written (and the year, if given); close to it; nothing found'),
    candidates: z
      .array(apiSearchResult)
      .describe('The match first, then up to five alternatives. Empty for none.'),
  })
  .meta({ id: 'LineMatch' })

export const apiListMatch = z
  .object({
    lines: z.array(apiLineMatch).describe('One for each line sent, in order'),
    platforms: z.array(apiPlatformLabel),
    habits: z
      .object({
        order: z.array(platformId).describe('The platforms the owner owns most on, most first'),
        formats: z
          .record(z.string(), z.enum(formats))
          .describe('The format last chosen on each platform, by its id'),
      })
      .describe('What the interface proposes for each row'),
  })
  .meta({ id: 'ListMatch' })

export const apiNewGame = z
  .object({
    igdbId: z.int().positive(),
    status: z.enum(statuses).default('backlog'),
    copies: z
      .array(z.object({ platform: platformId, format: z.enum(formats) }))
      .max(30)
      .default([]),
    rating: z.number().min(0).max(10).optional().describe('Out of ten, in half steps'),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    completedOn: z.iso.date().optional(),
    grouping: z
      .enum(['join', 'separate'])
      .optional()
      .describe(
        'For a game related to one in the library: fold it in, or keep it apart. Absent: what ADR 001 proposes.',
      ),
  })
  .meta({ id: 'NewGame' })

export const apiAdded = z
  .object({
    slug: z.string().describe('The game it is now, or joined: /en/u/{handle}/game/{slug}'),
    title: z.string(),
    version: z.int().describe('The library’s version after the change'),
  })
  .meta({ id: 'Added' })

export const apiNewGames = z
  .object({ games: z.array(apiNewGame).min(1).max(MAX_ADDITIONS) })
  .meta({ id: 'NewGames' })

export const apiAddUndo = z
  .object({
    entryId: z.string().min(1),
    gameId: z.string().min(1),
    newEntry: z.boolean(),
    newVersion: z.boolean(),
    copyIds: z.array(z.string().min(1)).max(30),
  })
  .describe('Exactly what one add wrote, for POST /additions/undo to take back')
  .meta({ id: 'AddUndo' })

export const apiAdditions = z
  .object({
    results: z
      .array(
        z.discriminatedUnion('added', [
          z.object({
            added: z.literal(true),
            slug: z.string(),
            title: z.string(),
            undo: apiAddUndo,
          }),
          z.object({ added: z.literal(false), error: z.enum(refusalReasons) }),
        ]),
      )
      .describe('One for each game sent, in order. One that fails leaves the rest.'),
    version: z.int().describe('The library’s version after the change'),
  })
  .meta({ id: 'Additions' })

export const apiUndoAdditions = z
  .object({ undo: z.array(apiAddUndo).min(1).max(MAX_ADDITIONS) })
  .meta({ id: 'UndoAdditions' })

export const apiGamePatch = z
  .object({
    status: z.enum(statuses).optional(),
    rating: z.number().min(0).max(10).nullable().optional().describe('Out of ten; null clears it'),
    completedOn: z.iso.date().nullable().optional(),
    notes: z.string().max(MAX_NOTES).nullable().optional(),
    notesPublic: z.boolean().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional().describe('All of them: replaces'),
    hoursPlayed: z.number().min(0).max(100_000).optional(),
    mainVersion: z
      .string()
      .optional()
      .describe('A version’s id, from GET /entries/{id}: it names the game and gives its cover'),
  })
  .meta({ id: 'GamePatch' })

export const apiOwnerGame = z
  .object({
    entryId: z.string(),
    slug: z.string(),
    title: z.string(),
    status: z.enum(statuses),
    rating: z.number().min(0).max(10).optional().describe('Out of ten'),
    completedOn: z.iso.date().optional(),
    notes: z
      .string()
      .optional()
      .describe('Whether or not they are public: this is the owner’s view'),
    notesPublic: z.boolean(),
    hoursPlayed: z.number().min(0).describe('Hours typed in'),
    copies: z.array(
      z.object({
        id: z.string().describe('For PATCH and DELETE /entries/{id}/copies/{copy}'),
        platform: platformId,
        format: z.enum(formats),
      }),
    ),
    tags: z.array(z.string()),
    versions: z.array(
      z.object({
        gameId: z.string().describe('For `mainVersion` in PATCH /entries/{id}'),
        slug: z.string(),
        title: z.string(),
        relation: z.enum(relations),
        kind: z.enum(kinds),
        year: z.int().optional(),
        platforms: z.array(z.int()),
      }),
    ),
    platforms: z.array(
      z.object({ id: z.int(), key: z.string(), name: z.string(), short: z.string() }),
    ),
  })
  .meta({ id: 'OwnerGame' })

export const apiNewCopy = z
  .object({ platform: platformId, format: z.enum(formats) })
  .meta({ id: 'NewCopy' })

export const apiCopyPatch = z.object({ format: z.enum(formats) }).meta({ id: 'CopyPatch' })

export const apiRestored = z.object({ version: z.int(), slug: z.string() }).meta({ id: 'Restored' })

export const apiChanged = z
  .object({ version: z.int().describe('The library’s version after the change') })
  .meta({ id: 'Changed' })

export const apiRemoved = z
  .object({
    version: z.int(),
    title: z.string(),
    undo: z.string().describe('Kept for a day; the interface’s Undo takes it'),
  })
  .meta({ id: 'Removed' })

const toApiResult = (result: Candidate): z.input<typeof apiSearchResult> => ({
  igdbId: result.igdbId,
  slug: result.slug,
  title: result.title,
  year: result.year ?? null,
  kind: result.kind,
  cover: result.cover ? imageUrl(result.cover.id, 'cover_big') : null,
  platforms: result.platforms,
  alsoOn: result.alsoOn,
  onShelf: result.onShelf ?? null,
})

export const toApiSearch = (answer: SearchAnswer): z.input<typeof apiSearchAnswer> => ({
  results: answer.results.map(toApiResult),
  platforms: answer.platforms,
})

export const toApiMatch = (answer: MatchAnswer): z.input<typeof apiListMatch> => ({
  lines: answer.lines.map((line) => ({
    text: line.text,
    title: line.title,
    year: line.year ?? null,
    platform: line.platform ?? null,
    platformId: line.platformId ?? null,
    confidence: line.confidence,
    candidates: line.candidates.map(toApiResult),
  })),
  platforms: answer.platforms,
  habits: answer.habits,
})

/** A new game in the API's shape, as the services take it: copies by platform id, a rating out of 100. */
export const toAddInput = ({ copies, rating, ...rest }: z.output<typeof apiNewGame>): AddInput => ({
  ...rest,
  copies: copies.map((copy) => ({ platformId: copy.platform, format: copy.format })),
  ...(rating === undefined ? {} : { rating: Math.round(rating * 10) }),
})

export const toApiAdditions = (answer: {
  results: Answer<AddedGame>[]
  version: number
}): z.input<typeof apiAdditions> => ({
  results: answer.results.map((result) =>
    result.ok
      ? { added: true, slug: result.value.slug, title: result.value.title, undo: result.value.undo }
      : { added: false, error: result.reason },
  ),
  version: answer.version,
})

/** The owner's view of a game, in the API's units: a rating out of ten, time in hours. */
export const toApiOwnerGame = ({
  rating,
  minutes,
  copies,
  ...rest
}: OwnerGame): z.input<typeof apiOwnerGame> => ({
  ...rest,
  ...(rating === undefined ? {} : { rating: rating / 10 }),
  hoursPlayed: minutes / 60,
  copies: copies.map(({ id, platformId, format }) => ({ id, platform: platformId, format })),
})

const STATUS: Record<Refusal['reason'], number> = {
  'not-signed-in': 401,
  invalid: 400,
  'not-found': 404,
  conflict: 409,
  'not-kept': 503,
  igdb: 502,
  'too-many': 429,
  failed: 500,
}

const MESSAGE: Record<Refusal['reason'], string> = {
  'not-signed-in':
    'Sign in first: an account changes its own library, and the session cookie is the key.',
  invalid: 'The request is not one Shelf can carry out. See /api/v1/openapi.json.',
  'not-found': 'There is no such game in your library.',
  conflict: 'That is there already.',
  'not-kept': 'This deployment keeps nothing it is given, so nothing was saved.',
  igdb: 'IGDB did not answer. Try again.',
  'too-many': 'Every account shares one IGDB allowance, and this one has used its hour. Try later.',
  failed: 'That did not work. Try again.',
}

/** Writes are never kept by anything between here and the account. */
const PRIVATE = { 'Cache-Control': 'private, no-store' }

/** The answer to a write: its schema checked, its library's pages drawn again on their next visit. */
export const written = <T extends z.ZodType>(
  schema: T,
  result: Done<z.input<T>>,
  status = 200,
): Response => {
  if (!result.ok) return refused(result)
  revalidateTag(libraryTag(result.libraryId), { expire: 0 })
  return Response.json(schema.parse(result.value), { status, headers: PRIVATE })
}

/** The answer to an account's read of its own: checked, and kept by no one. */
export const ownerRead = <T extends z.ZodType>(schema: T, result: Answer<z.input<T>>): Response =>
  result.ok ? Response.json(schema.parse(result.value), { headers: PRIVATE }) : refused(result)

export const refused = (refusal: Refusal): Response =>
  failure(STATUS[refusal.reason], refusal.reason, MESSAGE[refusal.reason])

/** What a refusal says, for an answer that is not HTTP: an MCP tool's. */
export const refusalMessage = (refusal: Refusal): string => MESSAGE[refusal.reason]

/** A patch in the API's shape, as the editing service takes it: a rating out of 100, time in minutes. */
export const toEditPatch = ({
  tags,
  hoursPlayed,
  rating,
  mainVersion,
  ...mine
}: z.output<typeof apiGamePatch>) => {
  const changes = {
    ...mine,
    ...(rating === undefined ? {} : { rating: rating === null ? null : Math.round(rating * 10) }),
  }
  return {
    ...(Object.keys(changes).length > 0 ? { mine: changes } : {}),
    ...(tags ? { tags } : {}),
    ...(hoursPlayed === undefined ? {} : { minutes: Math.round(hoursPlayed * 60) }),
    ...(mainVersion ? { mainVersion } : {}),
  }
}

/** A body that is JSON, or nothing. */
export const bodyOf = async (request: Request): Promise<unknown> => {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}
