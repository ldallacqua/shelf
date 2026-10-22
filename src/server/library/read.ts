import 'server-only'

import { and, eq, inArray, sql } from 'drizzle-orm'

import { lengthMinutes } from '@/domain/igdb/game'
import type { OwnerGame } from '@/domain/library/editing'
import type { GameExtras } from '@/domain/library/game-page'
import {
  emptyNames,
  type Library,
  type LibraryCopy,
  type LibraryGame,
  type LibraryPlatform,
  type Named,
} from '@/domain/library/library'
import { dayOf } from '@/domain/library/values'
import type { GameKeywords } from '@/domain/query/evaluate'
import { comparePlatforms } from '@/domain/platforms/platforms'
import type { Db, Executor } from '@/server/db/client'
import {
  copies,
  entries,
  entryTags,
  entryVersions,
  games,
  libraries,
  platforms,
  playTime,
  tags,
  vocab,
} from '@/server/db/schema'

/**
 * Reads one library, an account's (ADR 004), whole, in a handful of
 * queries, and puts it together in memory. A library is always read whole:
 * it is small, and every view filters and sorts it on the device. Nothing
 * here asks whether the reader may see it: the services do.
 */

const union = (lists: readonly (readonly number[])[]): number[] => [...new Set(lists.flat())]

const byId = <T extends { id: number }>(a: T, b: T) => a.id - b.id

export const readLibrary = async (db: Db, libraryId: string): Promise<Library> => {
  const own = sql`(select ${entries.id} from ${entries} where ${entries.userId} = ${libraryId})`
  // One batch is one transaction: every query sees the library as it was at
  // one moment. Run side by side, a write landing between them would give a
  // file that claims the new version without the new game, kept a year at
  // that version's address. On Turso it is also one round trip.
  const [
    versionRow,
    entryRows,
    versionRows,
    copyRows,
    timeRows,
    tagRows,
    entryTagRows,
    vocabRows,
    platformRows,
  ] = await db.batch([
    db
      .select({ version: libraries.version })
      .from(libraries)
      .where(eq(libraries.userId, libraryId))
      .limit(1),
    db.select().from(entries).where(eq(entries.userId, libraryId)),
    db
      .select({
        entryId: entryVersions.entryId,
        relation: entryVersions.relation,
        gameId: games.id,
        slug: games.slug,
        title: games.title,
        kind: games.kind,
        releasedOn: games.releasedOn,
        year: games.year,
        cover: games.cover,
        colors: games.colors,
        thumbhash: games.thumbhash,
        igdbRating: games.igdbRating,
        igdbRatingCount: games.igdbRatingCount,
        length: games.length,
        genres: games.genres,
        themes: games.themes,
        modes: games.modes,
        perspectives: games.perspectives,
        platforms: games.platforms,
        franchises: games.franchises,
        series: games.series,
        developers: games.developers,
        publishers: games.publishers,
      })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.userId, libraryId)),
    // The order they were added in. Two copies added in the same millisecond
    // are told apart by SQLite's own row number, which only ever grows.
    db
      .select()
      .from(copies)
      .where(sql`${copies.entryId} in ${own}`)
      .orderBy(copies.createdAt, sql`rowid`),
    db
      .select({ entryId: playTime.entryId, minutes: sql<number>`sum(${playTime.minutes})` })
      .from(playTime)
      .where(sql`${playTime.entryId} in ${own}`)
      .groupBy(playTime.entryId),
    db.select().from(tags).where(eq(tags.userId, libraryId)).orderBy(tags.name),
    db
      .select()
      .from(entryTags)
      .where(sql`${entryTags.entryId} in ${own}`),
    db
      .select()
      .from(vocab)
      .where(sql`${vocab.kind} != 'keyword'`),
    db.select().from(platforms),
  ])
  const version = versionRow[0]?.version ?? 0

  type VersionRow = (typeof versionRows)[number]
  const versionsByEntry = new Map<string, VersionRow[]>()
  const gameById = new Map<string, VersionRow>()
  for (const row of versionRows) {
    gameById.set(row.gameId, row)
    const list = versionsByEntry.get(row.entryId)
    if (list) list.push(row)
    else versionsByEntry.set(row.entryId, [row])
  }

  const copiesByEntry = new Map<string, (typeof copyRows)[number][]>()
  for (const row of copyRows) {
    const list = copiesByEntry.get(row.entryId)
    if (list) list.push(row)
    else copiesByEntry.set(row.entryId, [row])
  }

  const minutesByEntry = new Map(timeRows.map((row) => [row.entryId, Number(row.minutes) || 0]))

  const tagPosition = new Map(tagRows.map((tag, index) => [tag.id, index]))
  const tagsByEntry = new Map<string, number[]>()
  for (const row of entryTagRows) {
    const position = tagPosition.get(row.tagId)
    if (position === undefined) continue
    const list = tagsByEntry.get(row.entryId)
    if (list) list.push(position)
    else tagsByEntry.set(row.entryId, [position])
  }

  const used = {
    genre: new Set<number>(),
    theme: new Set<number>(),
    mode: new Set<number>(),
    perspective: new Set<number>(),
    franchise: new Set<number>(),
    series: new Set<number>(),
    company: new Set<number>(),
    platform: new Set<number>(),
  }
  const note = (set: Set<number>, values: readonly number[]) => {
    for (const value of values) set.add(value)
  }

  const libraryGames: LibraryGame[] = []
  for (const entry of entryRows) {
    const versions = versionsByEntry.get(entry.id) ?? []
    const primary = versions.find((version) => version.relation === 'primary')
    // An entry without a primary cannot be shown. The schema makes one hard to lose.
    if (!primary) continue

    const owned = copiesByEntry.get(entry.id) ?? []
    // The copy chosen for display stands first; the rest keep the order they were added in.
    const ordered = [
      ...owned.filter((copy) => copy.id === entry.displayCopyId),
      ...owned.filter((copy) => copy.id !== entry.displayCopyId),
    ]
    const gameCopies = ordered.map((copy): LibraryCopy => {
      const result: LibraryCopy = { platform: copy.platformId, format: copy.format }
      const version = copy.gameId ? gameById.get(copy.gameId) : undefined
      if (version?.cover && version.cover.id !== primary.cover?.id) result.cover = version.cover.id
      return result
    })

    const game: LibraryGame = {
      slug: primary.slug,
      title: primary.title,
      status: entry.status,
      addedOn: dayOf(entry.addedAt),
      minutes: minutesByEntry.get(entry.id) ?? 0,
      igdbRatingCount: primary.igdbRatingCount,
      kind: primary.kind,
      featured: entry.featured,
      hasNotes: Boolean(entry.notes) && entry.notesPublic,
      copies: gameCopies,
      genres: primary.genres,
      themes: primary.themes,
      modes: primary.modes,
      perspectives: primary.perspectives,
      platforms: union(versions.map((version) => version.platforms)),
      franchises: primary.franchises,
      series: primary.series,
      developers: primary.developers,
      publishers: primary.publishers,
      tags: (tagsByEntry.get(entry.id) ?? []).sort((a, b) => a - b),
    }
    if (entry.rating !== null) game.rating = entry.rating
    if (entry.completedOn) game.completedOn = entry.completedOn
    if (primary.releasedOn) {
      game.releasedOn = primary.releasedOn
      game.year = Number(primary.releasedOn.slice(0, 4))
    }
    if (primary.igdbRating !== null) game.igdbRating = primary.igdbRating
    const length = lengthMinutes(primary.length ?? undefined)
    if (length) game.length = length
    if (primary.cover) {
      game.cover = primary.cover.id
      game.coverRatio = Math.round((primary.cover.width / primary.cover.height) * 100)
    }
    if (primary.colors) game.colors = primary.colors
    if (primary.thumbhash) game.hash = primary.thumbhash

    note(used.genre, game.genres)
    note(used.theme, game.themes)
    note(used.mode, game.modes)
    note(used.perspective, game.perspectives)
    note(used.franchise, game.franchises)
    note(used.series, game.series)
    note(used.company, game.developers)
    note(used.company, game.publishers)
    note(used.platform, game.platforms)
    note(
      used.platform,
      game.copies.map((copy) => copy.platform),
    )

    libraryGames.push(game)
  }

  // A stable order for the file itself. Views sort it their own way.
  libraryGames.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))

  const names = emptyNames()
  if (libraryGames.length > 0) {
    for (const row of vocabRows) {
      if (row.kind === 'keyword') continue
      if (!used[row.kind].has(row.id)) continue
      names[row.kind].push({ id: row.id, name: row.name, slug: row.slug } satisfies Named)
    }
    for (const kind of [
      'genre',
      'theme',
      'mode',
      'perspective',
      'franchise',
      'series',
      'company',
    ] as const) {
      names[kind].sort(byId)
    }
    names.platform = platformRows
      .filter((row) => used.platform.has(row.igdbId))
      .map((row) => ({
        platform: {
          igdbId: row.igdbId,
          key: row.key,
          name: row.name,
          short: row.short,
          family: row.family,
          shape: row.shape,
          plastic: row.plastic,
          ...(row.generation === null ? {} : { generation: row.generation }),
        },
      }))
      .sort((a, b) => comparePlatforms(a.platform, b.platform))
      .map(({ platform }): LibraryPlatform => {
        const { igdbId, ...rest } = platform
        return { id: igdbId, ...rest }
      })
    names.tag = tagRows.map((tag) => ({ name: tag.name, slug: tag.slug }))
  }

  return { version, games: libraryGames, names }
}

/**
 * What a game's page shows beyond the library file, for the game whose
 * primary version has this slug. Nothing for a slug that is no game's
 * address, including a version folded into another game.
 */
export const readGameExtras = async (
  db: Executor,
  libraryId: string,
  slug: string,
): Promise<GameExtras | undefined> => {
  const [primary] = await db
    .select({ entryId: entryVersions.entryId, relation: entryVersions.relation })
    .from(games)
    .innerJoin(entryVersions, eq(entryVersions.gameId, games.id))
    .where(and(eq(games.slug, slug), eq(entryVersions.userId, libraryId)))
  if (!primary || primary.relation !== 'primary') return undefined

  const [entryRows, versionRows] = await Promise.all([
    db
      .select({ notes: entries.notes, notesPublic: entries.notesPublic })
      .from(entries)
      .where(eq(entries.id, primary.entryId)),
    db
      .select({
        relation: entryVersions.relation,
        versionTitle: games.versionTitle,
        summary: games.summary,
        storyline: games.storyline,
        artworks: games.artworks,
        screenshots: games.screenshots,
        releases: games.releases,
        length: games.length,
        igdbUrl: games.igdbUrl,
      })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.entryId, primary.entryId)),
  ])
  const entry = entryRows[0]
  const main = versionRows.find((row) => row.relation === 'primary')
  if (!entry || !main) return undefined

  const extras: GameExtras = {
    artworks: main.artworks,
    screenshots: main.screenshots,
    // The primary's releases first, then each version's.
    releases: [main, ...versionRows.filter((row) => row !== main)].map((row) => row.releases),
    notesPublic: entry.notesPublic,
  }
  if (main.versionTitle) extras.versionTitle = main.versionTitle
  if (main.summary) extras.summary = main.summary
  if (main.storyline) extras.storyline = main.storyline
  if (main.length) extras.length = main.length
  if (main.igdbUrl) extras.igdbUrl = main.igdbUrl
  if (entry.notes) extras.notes = entry.notes
  return extras
}

/**
 * Every game's keywords, by its slug, with the names of the keywords used:
 * the second file. Keywords are many (thousands across a library), so the
 * library file leaves them out and this is fetched the first time a
 * filter asks for one.
 */
export const readKeywords = async (db: Executor, libraryId: string): Promise<GameKeywords> => {
  const rows = await db
    .select({ slug: games.slug, keywords: games.keywords })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(and(eq(entryVersions.relation, 'primary'), eq(entryVersions.userId, libraryId)))
  const used = new Set(rows.flatMap((row) => row.keywords))
  const names =
    used.size === 0
      ? []
      : (await db.select().from(vocab).where(eq(vocab.kind, 'keyword')))
          .filter((row) => used.has(row.id))
          .map((row): Named => ({ id: row.id, name: row.name, slug: row.slug }))
          .sort(byId)
  const byGame: Record<string, number[]> = {}
  for (const row of rows) if (row.keywords.length > 0) byGame[row.slug] = row.keywords
  return { names, games: byGame }
}

/**
 * A game as its owner edits it: the ids the edits need, the notes whether or
 * not they are public, the versions folded into it, and every platform it
 * could be owned on. Only for its library's owner: the caller checks. An
 * entry of another library is not found.
 */
export const readOwnerGame = async (
  db: Executor,
  libraryId: string,
  entryId: string,
): Promise<OwnerGame | undefined> => {
  const [entryRows, versionRows, copyRows, timeRows, tagRows] = await Promise.all([
    db
      .select()
      .from(entries)
      .where(and(eq(entries.id, entryId), eq(entries.userId, libraryId))),
    db
      .select({
        gameId: games.id,
        slug: games.slug,
        title: games.title,
        relation: entryVersions.relation,
        kind: games.kind,
        year: games.year,
        platforms: games.platforms,
      })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.entryId, entryId)),
    db
      .select({ id: copies.id, platformId: copies.platformId, format: copies.format })
      .from(copies)
      .where(eq(copies.entryId, entryId))
      .orderBy(copies.createdAt, sql`rowid`),
    db
      .select({ minutes: playTime.minutes })
      .from(playTime)
      .where(and(eq(playTime.entryId, entryId), eq(playTime.source, 'manual'))),
    db
      .select({ name: tags.name })
      .from(entryTags)
      .innerJoin(tags, eq(tags.id, entryTags.tagId))
      .where(eq(entryTags.entryId, entryId))
      .orderBy(tags.name),
  ])
  const entry = entryRows[0]
  const primary = versionRows.find((row) => row.relation === 'primary')
  if (!entry || !primary) return undefined

  const platformIds = union([
    ...versionRows.map((row) => row.platforms),
    copyRows.map((copy) => copy.platformId),
  ])
  const platformRows =
    platformIds.length > 0
      ? await db.select().from(platforms).where(inArray(platforms.igdbId, platformIds))
      : []

  const owned: OwnerGame = {
    entryId,
    slug: primary.slug,
    title: primary.title,
    status: entry.status,
    notesPublic: entry.notesPublic,
    minutes: timeRows.reduce((sum, row) => sum + row.minutes, 0),
    copies: copyRows,
    tags: tagRows.map((tag) => tag.name),
    versions: [primary, ...versionRows.filter((row) => row !== primary)].map((row) => ({
      gameId: row.gameId,
      slug: row.slug,
      title: row.title,
      relation: row.relation,
      kind: row.kind,
      ...(row.year === null ? {} : { year: row.year }),
      platforms: row.platforms,
    })),
    platforms: platformRows
      .map((row) => ({
        platform: {
          igdbId: row.igdbId,
          key: row.key,
          name: row.name,
          short: row.short,
          family: row.family,
          shape: row.shape,
          plastic: row.plastic,
          ...(row.generation === null ? {} : { generation: row.generation }),
        },
      }))
      .sort((a, b) => comparePlatforms(a.platform, b.platform))
      .map(({ platform }) => ({
        id: platform.igdbId,
        key: platform.key,
        name: platform.name,
        short: platform.short,
      })),
  }
  if (entry.rating !== null) owned.rating = entry.rating
  if (entry.completedOn) owned.completedOn = entry.completedOn
  if (entry.notes) owned.notes = entry.notes
  return owned
}
