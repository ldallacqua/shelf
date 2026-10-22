import 'server-only'

import { z } from 'zod'

import { imageUrl } from '@/domain/igdb/images'
import { namesOf, type GamePage } from '@/domain/library/game-page'
import { groupings, type Shelf } from '@/domain/library/group'
import type { Library, LibraryGame, Named } from '@/domain/library/library'
import { numberToDay } from '@/domain/library/snapshot'
import { libraryStats } from '@/domain/library/stats'
import { parseSort, sortGames, writeSort } from '@/domain/library/sort'
import type { SmartShelf } from '@/domain/library/shelves'
import { statuses } from '@/domain/library/values'
import {
  arrangeLibrary,
  DEFAULT_GROUPING,
  indexOnce,
  keywordIndexOnce,
  MAX_QUERY_LENGTH,
  selectOnce,
} from '@/domain/library/view'
import {
  asksForKeywords,
  standingCopies,
  type GameKeywords,
  type LibraryIndex,
} from '@/domain/query/evaluate'
import { extentOf, facetCounts } from '@/domain/query/facets'
import { dateKeys, filterWord, listKeys, numberKeys, type ListKey } from '@/domain/query/keys'
import { parseQuery } from '@/domain/query/parse'
import { failure } from '@/server/api/respond'
import { findLibrary, type LibraryInfo } from '@/server/services/library'

/**
 * The public API's reads (architecture, section 16), of a public shelf named
 * by its handle: the library filtered, sorted and grouped, the values a
 * filter can take with their counts, and the smart shelves. Every answer has
 * a Zod schema here, and the OpenAPI document is made from these same
 * schemas, so the two cannot disagree.
 *
 * The API runs the same rules as the page: the filter language, the sort
 * and the grouping all come from `domain`.
 */

const problem = z.object({
  text: z.string().describe('The part of the filter that was ignored'),
  reason: z.string().describe('Why: unknown-key, bad-value, missing-value, and so on'),
  from: z.int().describe('Where it starts in `q`'),
  to: z.int().describe('Where it ends in `q`'),
})

export const apiGame = z
  .object({
    slug: z.string().describe('The game’s address on its shelf: /en/u/{handle}/game/{slug}'),
    title: z.string(),
    status: z.enum(statuses),
    rating: z.number().nullable().describe('Mine, out of ten, in half steps'),
    year: z.int().nullable(),
    releasedOn: z.string().nullable().describe('YYYY-MM-DD'),
    igdbRating: z.int().nullable().describe('IGDB’s, out of 100'),
    hoursPlayed: z.number().describe('Hours played, to one decimal'),
    timeToBeat: z.number().nullable().describe('Hours for a normal playthrough, from IGDB'),
    addedOn: z.string().describe('YYYY-MM-DD'),
    completedOn: z.string().nullable(),
    kind: z.string().describe('main, remake, remaster, expanded, port, bundle, expansion or other'),
    featured: z.boolean(),
    owned: z
      .array(
        z.object({
          platform: z.string().describe('The key `owned:` takes, such as ps5'),
          name: z.string(),
          format: z.enum(['physical', 'digital']),
        }),
      )
      .describe('Copies: one per platform and format'),
    platforms: z.array(z.string()).describe('Every platform it was released on, as filter keys'),
    genres: z.array(z.string()).describe('As `genre:` takes them'),
    themes: z.array(z.string()),
    tags: z.array(z.string()),
    cover: z.url().nullable().describe('From IGDB’s image servers, 264 pixels wide'),
  })
  .meta({ id: 'Game' })

const value = z.object({
  value: z.string().describe('As its filter key takes it'),
  name: z.string(),
})

export const apiGamePage = apiGame
  .extend({
    versionTitle: z
      .string()
      .nullable()
      .describe('What IGDB calls this version: "Definitive Edition"'),
    summary: z.string().nullable().describe('IGDB’s, in English'),
    storyline: z.string().nullable().describe('IGDB’s, in English'),
    developers: z.array(value).describe('As `developer:` takes them'),
    publishers: z.array(value).describe('As `publisher:` takes them'),
    franchises: z.array(value),
    series: z.array(value),
    modes: z.array(value),
    perspectives: z.array(value),
    releases: z
      .array(
        z.object({
          platform: z.string().describe('As `platform:` takes it'),
          name: z.string(),
          date: z.string().nullable().describe('YYYY-MM-DD, or YYYY when only the year is known'),
        }),
      )
      .describe('The first release on each platform, oldest first'),
    timesToBeat: z
      .object({
        hastily: z.number().nullable(),
        normally: z.number().nullable(),
        completely: z.number().nullable(),
      })
      .nullable()
      .describe('Hours, from IGDB: rushing, a normal playthrough, and everything'),
    igdbRatingCount: z.int().describe('How many ratings IGDB’s rests on'),
    igdbUrl: z.url().nullable(),
    notes: z
      .string()
      .nullable()
      .describe('Mine, when I have made them public. Private notes are never sent.'),
    backdrop: z.url().nullable().describe('Key art, or a screenshot: 1280 by 720'),
    screenshots: z.array(z.url()).describe('1280 by 720'),
  })
  .meta({ id: 'GamePage' })

export const shelfOutline = z
  .object({
    key: z.string().describe('platform:167, status:playing, year:2018, all'),
    count: z.int().describe('Boxes on the shelf. A game owned on two platforms stands on both.'),
  })
  .meta({ id: 'ShelfOutline' })

export const libraryAnswer = z
  .object({
    version: z.int().describe('Raised by every change to the library'),
    query: z.object({
      q: z.string(),
      sort: z.string(),
      group: z.enum(groupings),
      seed: z.string(),
    }),
    problems: z.array(problem).describe('Parts of `q` that were not understood, and ignored'),
    stats: z.object({
      games: z.int().describe('Games that match, each counted once'),
      finished: z.int(),
      hours: z.int(),
    }),
    shelves: z.array(shelfOutline).describe('The shelves the grouping makes, in order'),
    games: z.array(apiGame).describe('This page of the matching games, in sort order'),
    next: z.string().nullable().describe('Pass as `cursor` for the next page; null at the end'),
  })
  .meta({ id: 'Library' })

export const facetsAnswer = z
  .object({
    version: z.int(),
    q: z.string(),
    total: z.int().describe('Games the filter matches'),
    facets: z
      .record(
        z.string(),
        z.array(z.object({ value: z.string(), name: z.string(), count: z.int() })),
      )
      .describe(
        'Per list key, every value with the games it would match given the rest of the filter. Keywords are left out: there are thousands.',
      ),
    ranges: z
      .record(z.string(), z.object({ min: z.number(), max: z.number() }).nullable())
      .describe('Per number key, the lowest and highest value in the library'),
    dates: z
      .record(z.string(), z.object({ min: z.string(), max: z.string() }).nullable())
      .describe('Per date key, the earliest and latest day in the library, as YYYY-MM-DD'),
  })
  .meta({ id: 'Facets' })

export const apiShelf = z
  .object({
    slug: z.string(),
    name: z.string(),
    query: z.string().describe('The filter, in the filter language'),
    sort: z.string(),
    group: z.enum(groupings),
    path: z.string().describe('Its page, after the language: /u/{handle}/shelves/{slug}'),
  })
  .meta({ id: 'SmartShelf' })

export const shelvesAnswer = z.object({ shelves: z.array(apiShelf) }).meta({ id: 'SmartShelves' })

export const apiError = z
  .object({ error: z.object({ code: z.string(), message: z.string() }) })
  .meta({ id: 'Error' })

/** What `GET /library` takes. Anything it cannot read falls back to its default, as the page does. */
export const libraryParams = z.object({
  q: z.string().max(MAX_QUERY_LENGTH).catch('').default(''),
  sort: z.string().catch('title').default('title'),
  group: z.enum(groupings).catch(DEFAULT_GROUPING).default(DEFAULT_GROUPING),
  seed: z
    .string()
    .regex(/^[a-z0-9]{1,16}$/i)
    .catch('')
    .default(''),
  limit: z.coerce.number().int().min(1).max(200).catch(50).default(50),
  cursor: z.coerce.number().int().min(0).catch(0).default(0),
  lang: z.enum(['en', 'pt-BR']).catch('en').default('en'),
})

export type LibraryParams = z.infer<typeof libraryParams>

const toApiGame = (library: Library, game: LibraryGame): z.infer<typeof apiGame> => {
  const platforms = new Map(library.names.platform.map((platform) => [platform.id, platform]))
  const named = (kind: 'genre' | 'theme', ids: readonly number[]) => {
    const byId = new Map(library.names[kind].map((item) => [item.id, item]))
    return ids.flatMap((id) => {
      const item = byId.get(id)
      return item ? [filterWord(kind, id, item.slug)] : []
    })
  }
  return {
    slug: game.slug,
    title: game.title,
    status: game.status,
    rating: game.rating === undefined ? null : Math.round(game.rating / 5) / 2,
    year: game.year ?? null,
    releasedOn: game.releasedOn ?? null,
    igdbRating: game.igdbRating ?? null,
    hoursPlayed: Math.round(game.minutes / 6) / 10,
    timeToBeat: game.length === undefined ? null : Math.round(game.length / 6) / 10,
    addedOn: game.addedOn,
    completedOn: game.completedOn ?? null,
    kind: game.kind,
    featured: game.featured,
    owned: game.copies.flatMap((copy) => {
      const platform = platforms.get(copy.platform)
      return platform ? [{ platform: platform.key, name: platform.name, format: copy.format }] : []
    }),
    platforms: game.platforms.flatMap((id) => platforms.get(id)?.key ?? []),
    genres: named('genre', game.genres),
    themes: named('theme', game.themes),
    tags: game.tags.flatMap((position) => library.names.tag[position]?.slug ?? []),
    cover: game.cover ? imageUrl(game.cover, 'cover_big') : null,
  }
}

const hoursOrNull = (minutes: number | undefined): number | null =>
  minutes === undefined ? null : Math.round(minutes / 6) / 10

/** `GET /games/{slug}`: one game, with everything its page shows a visitor. */
export const answerGame = (library: Library, page: GamePage): z.infer<typeof apiGamePage> => {
  const { game, facts } = page
  const listed = (key: ListKey, names: readonly Named[], ids: readonly number[]) =>
    namesOf(names, ids).map((named) => ({
      value: filterWord(key, named.id, named.slug),
      name: named.name,
    }))
  const platforms = new Map(facts.names.platform.map((platform) => [platform.id, platform]))
  const { length } = facts
  return {
    ...toApiGame(library, game),
    versionTitle: facts.versionTitle ?? null,
    summary: facts.summary ?? null,
    storyline: facts.storyline ?? null,
    developers: listed('developer', facts.names.company, game.developers),
    publishers: listed('publisher', facts.names.company, game.publishers),
    franchises: listed('franchise', facts.names.franchise, game.franchises),
    series: listed('series', facts.names.series, game.series),
    modes: listed('mode', facts.names.mode, game.modes),
    perspectives: listed('perspective', facts.names.perspective, game.perspectives),
    releases: facts.releases.flatMap((release) => {
      const platform = platforms.get(release.platform)
      if (!platform) return []
      const date = release.day ?? (release.year === undefined ? null : String(release.year))
      return [{ platform: platform.key, name: platform.name, date }]
    }),
    timesToBeat: length
      ? {
          hastily: hoursOrNull(length.hastily),
          normally: hoursOrNull(length.normally),
          completely: hoursOrNull(length.completely),
        }
      : null,
    igdbRatingCount: game.igdbRatingCount,
    igdbUrl: facts.igdbUrl ?? null,
    notes: facts.notes ?? null,
    backdrop: facts.backdrop ? imageUrl(facts.backdrop.id, 'screenshot_huge') : null,
    screenshots: facts.screenshots.map((shot) => imageUrl(shot.id, 'screenshot_huge')),
  }
}

const outline = (shelves: readonly Shelf[]) =>
  shelves.map((shelf) => ({ key: shelf.key, count: shelf.items.length }))

const indexFor = (library: Library, keywords: GameKeywords | undefined): LibraryIndex => {
  const index = indexOnce(library)
  return keywords ? keywordIndexOnce(index, keywords) : index
}

/** Whether answering this filter needs the keywords file. */
export const needsKeywords = (q: string): boolean => asksForKeywords(parseQuery(q).tree)

/**
 * The public library a handle names, for a read of the API, or the 404 to
 * answer instead. A private library answers the same 404 as no library:
 * whether it exists is not said (ADR 004).
 */
export const publicLibrary = async (handle: string): Promise<LibraryInfo | Response> => {
  const found = await findLibrary(handle)
  return found?.public
    ? found
    : failure(404, 'not-found', `There is no public shelf called ${handle}`)
}

/** `GET /library`: the matching games, a page at a time, and the shelves they make. */
export const answerLibrary = (
  library: Library,
  params: LibraryParams,
  keywords?: GameKeywords,
): z.infer<typeof libraryAnswer> => {
  const index = indexFor(library, keywords)
  const parsed = parseQuery(params.q)
  const sort = parseSort(params.sort)
  const matching = selectOnce(index, parsed.tree)
  const ordered = sortGames(matching, sort, params.lang, params.seed)
  const shelves = arrangeLibrary(
    matching,
    library.names,
    { group: params.group, sort, seed: params.seed },
    params.lang,
    standingCopies(index, parsed.tree),
  )
  const page = ordered.slice(params.cursor, params.cursor + params.limit)
  const end = params.cursor + page.length
  return {
    version: library.version,
    query: { q: params.q, sort: writeSort(sort), group: params.group, seed: params.seed },
    problems: parsed.problems,
    stats: libraryStats(matching),
    shelves: outline(shelves),
    games: page.map((game) => toApiGame(library, game)),
    next: end < ordered.length ? String(end) : null,
  }
}

/** `GET /library/facets`: every value of every list filter, with its count under `q`. */
export const answerFacets = (
  library: Library,
  q: string,
  keywords?: GameKeywords,
): z.infer<typeof facetsAnswer> => {
  const index = indexFor(library, keywords)
  const { tree } = parseQuery(q)
  const facets: Record<string, { value: string; name: string; count: number }[]> = {}
  for (const key of listKeys) {
    if (key === 'keyword') continue
    facets[key] = facetCounts(index, tree, key).map((value) => ({
      value: value.word,
      name: value.name,
      count: value.count,
    }))
  }
  const ranges: Record<string, { min: number; max: number } | null> = {}
  for (const key of numberKeys) {
    const extent = extentOf(index.numbers[key])
    ranges[key] = extent ? { min: extent[0], max: extent[1] } : null
  }
  const dates: Record<string, { min: string; max: string } | null> = {}
  for (const key of dateKeys) {
    const extent = extentOf(index.dates[key])
    dates[key] = extent ? { min: numberToDay(extent[0]), max: numberToDay(extent[1]) } : null
  }
  return {
    version: library.version,
    q,
    total: selectOnce(index, tree).length,
    facets,
    ranges,
    dates,
  }
}

/** A smart shelf as the API gives it, with its page's address on the shelf of this handle. */
export const toApiShelf =
  (handle: string) =>
  (shelf: SmartShelf): z.infer<typeof apiShelf> => ({
    ...shelf,
    path: `/u/${handle}/shelves/${shelf.slug}`,
  })
