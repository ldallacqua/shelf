import 'server-only'

import { eq, sql } from 'drizzle-orm'

import { lengthMinutes } from '@/domain/igdb/game'
import {
  emptyNames,
  type Library,
  type LibraryCopy,
  type LibraryGame,
  type LibraryPlatform,
  type Named,
} from '@/domain/library/library'
import { dayOf } from '@/domain/library/values'
import { comparePlatforms } from '@/domain/platforms/platforms'
import type { Executor } from '@/server/db/client'
import {
  copies,
  entries,
  entryTags,
  entryVersions,
  games,
  platforms,
  playTime,
  tags,
  vocab,
} from '@/server/db/schema'
import { readVersion } from '@/server/library/store'

/**
 * Reads the whole library in a handful of queries and puts it together in
 * memory. The library is always read whole: it is small, and every view
 * filters and sorts it on the device.
 */

const union = (lists: readonly (readonly number[])[]): number[] => [...new Set(lists.flat())]

const byId = <T extends { id: number }>(a: T, b: T) => a.id - b.id

export const readLibrary = async (db: Executor): Promise<Library> => {
  const [version, entryRows, versionRows, copyRows, timeRows, tagRows, entryTagRows] =
    await Promise.all([
      readVersion(db),
      db.select().from(entries),
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
        .innerJoin(games, eq(games.id, entryVersions.gameId)),
      // The order they were added in. Two copies added in the same millisecond
      // are told apart by SQLite's own row number, which only ever grows.
      db
        .select()
        .from(copies)
        .orderBy(copies.createdAt, sql`rowid`),
      db
        .select({ entryId: playTime.entryId, minutes: sql<number>`sum(${playTime.minutes})` })
        .from(playTime)
        .groupBy(playTime.entryId),
      db.select().from(tags).orderBy(tags.name),
      db.select().from(entryTags),
    ])

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
    const [vocabRows, platformRows] = await Promise.all([
      db
        .select()
        .from(vocab)
        .where(sql`${vocab.kind} != 'keyword'`),
      db.select().from(platforms),
    ])
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
