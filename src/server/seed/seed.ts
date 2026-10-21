import 'server-only'

import { createHash } from 'node:crypto'

import type { SQLiteTable } from 'drizzle-orm/sqlite-core'

import { toGameData, type Company, type GameData } from '@/domain/igdb/game'
import type { VocabKind } from '@/domain/igdb/schema'
import { STARTER_SHELVES } from '@/domain/library/shelves'
import { toPlatform } from '@/domain/platforms/platforms'
import type { Db } from '@/server/db/client'
import {
  copies,
  entries,
  entryTags,
  entryVersions,
  games,
  libraryMeta,
  platforms,
  playTime,
  removedEntries,
  shelves,
  tags,
  vocab,
} from '@/server/db/schema'
import { gameColumns, platformColumns, toSlug } from '@/server/library/store'
import { loadFixtures, type Fixtures } from '@/server/seed/fixtures'
import { inventEntry, SEED_NOW, type SeedEntry } from '@/server/seed/mine'

/**
 * Fills a database with one of three data sets, replacing what was there.
 *
 * | Set       | What                                   | Used by                          |
 * | --------- | -------------------------------------- | -------------------------------- |
 * | `default` | About 230 real, varied games           | Local work, tests, previews      |
 * | `empty`   | No entries                             | The empty-library screens        |
 * | `stress`  | The default set plus about 1,050 more  | Speed tests, long lists, 3D      |
 *
 * It never touches the network: everything comes from `fixtures/`.
 */

export const seedSets = ['default', 'empty', 'stress'] as const
export type SeedSet = (typeof seedSets)[number]

export const isSeedSet = (value: unknown): value is SeedSet =>
  typeof value === 'string' && (seedSets as readonly string[]).includes(value)

/** A stable id from a name, so a re-seed gives every row the id it had before. */
const stableId = (...parts: (string | number)[]): string => {
  const hash = createHash('sha256').update(parts.join(':')).digest('hex')
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

type Rows<T extends SQLiteTable> = T['$inferInsert'][]

const insertAll = async <T extends SQLiteTable>(db: Db, table: T, rows: Rows<T>, size: number) => {
  for (let start = 0; start < rows.length; start += size) {
    await db.insert(table).values(rows.slice(start, start + size))
  }
}

/** Removes everything a seed writes. Sign-in tables, when they arrive, are left alone. */
export const clearLibrary = async (db: Db) => {
  // Children first, so it works whether or not the engine enforces foreign keys.
  for (const table of [
    removedEntries,
    playTime,
    copies,
    entryTags,
    entryVersions,
    entries,
    tags,
    games,
    vocab,
    platforms,
    shelves,
  ]) {
    await db.delete(table)
  }
}

export type SeedPlan = {
  games: GameData[]
  entries: SeedEntry[]
}

/** Which games a set holds and what "I" did with each. Pure: no database. */
export const planSeed = (set: SeedSet, fixtures: Fixtures): SeedPlan => {
  if (set === 'empty') return { games: [], entries: [] }

  const entryIds =
    set === 'stress' ? [...fixtures.sets.default, ...fixtures.sets.stress] : fixtures.sets.default
  const gameIds = [...entryIds, ...fixtures.sets.versions]

  const data = new Map<number, GameData>()
  for (const id of gameIds) {
    const record = fixtures.games.get(id)
    if (record) data.set(id, toGameData(record, fixtures.timeToBeat.get(id)))
  }

  const planned: SeedEntry[] = []
  for (const id of entryIds) {
    const game = data.get(id)
    if (!game) continue
    const entry = inventEntry(game)
    // A version the fixtures do not hold cannot be linked.
    entry.versions = entry.versions.filter((version) => data.has(version.igdbId))
    for (const copy of entry.copies) {
      if (copy.versionIgdbId !== undefined && !data.has(copy.versionIgdbId)) {
        delete copy.versionIgdbId
      }
    }
    planned.push(entry)
  }

  // Only games that ended up in an entry are stored.
  const linked = new Set(
    planned.flatMap((entry) => [entry.igdbId, ...entry.versions.map((v) => v.igdbId)]),
  )
  return { games: [...data.values()].filter((game) => linked.has(game.igdbId)), entries: planned }
}

export const seedLibrary = async (
  db: Db,
  set: SeedSet,
  fixtures: Fixtures = loadFixtures(),
): Promise<{ games: number; entries: number }> => {
  const plan = planSeed(set, fixtures)
  const now = SEED_NOW

  await clearLibrary(db)

  const gameId = (igdbId: number) => stableId('game', igdbId)

  const gameRows: Rows<typeof games> = plan.games.map((game) => {
    const art = game.cover ? fixtures.covers.get(game.cover.id) : undefined
    return {
      id: gameId(game.igdbId),
      ...gameColumns(game, fixtures.lineage.get(game.igdbId) ?? [], now),
      ...(art ? { colors: art.colors, thumbhash: art.thumbhash } : {}),
    }
  })

  // Names for every id the stored games mention.
  const mentioned: Record<Exclude<VocabKind, 'company'>, Set<number>> = {
    genre: new Set(),
    theme: new Set(),
    mode: new Set(),
    perspective: new Set(),
    franchise: new Set(),
    series: new Set(),
    keyword: new Set(),
  }
  const companies = new Map<number, Company>()
  const platformIds = new Set<number>()
  for (const game of plan.games) {
    for (const id of game.genres) mentioned.genre.add(id)
    for (const id of game.themes) mentioned.theme.add(id)
    for (const id of game.modes) mentioned.mode.add(id)
    for (const id of game.perspectives) mentioned.perspective.add(id)
    for (const id of game.franchises) mentioned.franchise.add(id)
    for (const id of game.series) mentioned.series.add(id)
    for (const id of game.keywords) mentioned.keyword.add(id)
    for (const id of game.platforms) platformIds.add(id)
    for (const company of game.companies) {
      if (game.developers.includes(company.id) || game.publishers.includes(company.id)) {
        companies.set(company.id, company)
      }
    }
  }
  for (const entry of plan.entries) {
    for (const copy of entry.copies) platformIds.add(copy.platformId)
  }

  const vocabRows: Rows<typeof vocab> = []
  for (const kind of Object.keys(mentioned) as Exclude<VocabKind, 'company'>[]) {
    for (const item of fixtures.names[kind]) {
      if (mentioned[kind].has(item.id)) {
        vocabRows.push({ kind, id: item.id, name: item.name, slug: item.slug })
      }
    }
  }
  for (const company of companies.values()) {
    vocabRows.push({ kind: 'company', id: company.id, name: company.name, slug: company.slug })
  }

  const platformRows: Rows<typeof platforms> = fixtures.platforms
    .filter((platform) => platformIds.has(platform.id))
    .map((platform) => platformColumns(toPlatform(platform)))
  const knownPlatforms = new Set(platformRows.map((row) => row.igdbId))

  const entryRows: Rows<typeof entries> = []
  const versionRows: Rows<typeof entryVersions> = []
  const copyRows: Rows<typeof copies> = []
  const timeRows: Rows<typeof playTime> = []
  const tagRows = new Map<string, Rows<typeof tags>[number]>()
  const entryTagRows: Rows<typeof entryTags> = []

  for (const entry of plan.entries) {
    const entryId = stableId('entry', entry.igdbId)
    entryRows.push({
      id: entryId,
      status: entry.status,
      rating: entry.rating ?? null,
      notes: entry.notes ?? null,
      notesPublic: entry.notesPublic,
      featured: entry.featured,
      addedAt: entry.addedAt,
      completedOn: entry.completedOn ?? null,
      createdAt: entry.addedAt,
      updatedAt: entry.addedAt,
    })
    versionRows.push({ entryId, gameId: gameId(entry.igdbId), relation: 'primary' })
    for (const version of entry.versions) {
      versionRows.push({ entryId, gameId: gameId(version.igdbId), relation: version.relation })
    }
    for (const [index, copy] of entry.copies.entries()) {
      if (!knownPlatforms.has(copy.platformId)) continue
      copyRows.push({
        id: stableId('copy', entry.igdbId, copy.platformId, copy.format),
        entryId,
        platformId: copy.platformId,
        format: copy.format,
        gameId: copy.versionIgdbId === undefined ? null : gameId(copy.versionIgdbId),
        acquiredOn: null,
        // One millisecond apart, so the order they were "bought" in is kept.
        createdAt: entry.addedAt + index,
      })
    }
    if (entry.minutes > 0) {
      timeRows.push({
        id: stableId('time', entry.igdbId),
        entryId,
        copyId: null,
        source: 'manual',
        minutes: entry.minutes,
        updatedAt: entry.addedAt,
      })
    }
    for (const name of entry.tags) {
      const slug = toSlug(name)
      if (!tagRows.has(slug)) tagRows.set(slug, { id: stableId('tag', slug), name, slug })
      entryTagRows.push({ entryId, tagId: stableId('tag', slug) })
    }
  }

  await insertAll(db, platforms, platformRows, 500)
  await insertAll(db, vocab, vocabRows, 1000)
  await insertAll(db, games, gameRows, 100)
  await insertAll(db, entries, entryRows, 500)
  await insertAll(db, entryVersions, versionRows, 1000)
  await insertAll(db, copies, copyRows, 500)
  await insertAll(db, playTime, timeRows, 500)
  await insertAll(db, tags, [...tagRows.values()], 500)
  await insertAll(db, entryTags, entryTagRows, 1000)
  // Every set starts with the starter shelves, as a new library does (the migration's own list).
  await insertAll(
    db,
    shelves,
    STARTER_SHELVES.map((shelf, position) => ({
      id: stableId('shelf', shelf.slug),
      ...shelf,
      position,
      createdAt: now,
      updatedAt: now,
    })),
    100,
  )

  // A version no earlier seed or deployment has used. The library file is
  // cached for a year under its version, so two different libraries must
  // never share one: the time of the seed, in seconds, cannot repeat.
  const version = Math.floor(Date.now() / 1000)
  await db
    .insert(libraryMeta)
    .values({ id: 1, version })
    .onConflictDoUpdate({ target: libraryMeta.id, set: { version } })

  return { games: gameRows.length, entries: entryRows.length }
}
