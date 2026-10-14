import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { Palette } from '@/domain/color/palette'
import type { Company, GameData, LineageStep } from '@/domain/igdb/game'
import type { IgdbNamed, VocabKind } from '@/domain/igdb/schema'
import type { LinkedMember } from '@/domain/library/family'
import {
  isDay,
  isFormat,
  isRating,
  isStatus,
  relations,
  type Day,
  type Format,
  type Relation,
  type Status,
} from '@/domain/library/values'
import type { Platform } from '@/domain/platforms/platforms'
import type { Db, Executor } from '@/server/db/client'
import {
  copies,
  entries,
  entryTags,
  entryVersions,
  games,
  libraryMeta,
  platforms,
  playTime,
  tags,
  vocab,
} from '@/server/db/schema'

/**
 * Every write to the library. Nothing here knows who is asking: the services
 * that call it check that first. Each public write runs in one transaction
 * and ends by raising the library's version, which is what tells every cache
 * and every open browser that the library changed.
 */

export type LibraryErrorCode = 'not-found' | 'invalid' | 'conflict'

export class LibraryError extends Error {
  readonly code: LibraryErrorCode

  constructor(code: LibraryErrorCode, message: string) {
    super(message)
    this.name = 'LibraryError'
    this.code = code
  }
}

const invalid = (message: string) => new LibraryError('invalid', message)
const notFound = (what: string) => new LibraryError('not-found', `${what} is not in the library`)

/** Colors and a blurred preview read from a cover. */
export type CoverArt = { colors: Palette; thumbhash: string }

export const toSlug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Raises the version by one. Called inside the transaction of every write. */
export const bumpVersion = (tx: Executor) =>
  tx
    .insert(libraryMeta)
    .values({ id: 1, version: 1 })
    .onConflictDoUpdate({
      target: libraryMeta.id,
      set: { version: sql`${libraryMeta.version} + 1` },
    })

export const readVersion = async (db: Executor): Promise<number> => {
  const [row] = await db.select({ version: libraryMeta.version }).from(libraryMeta).limit(1)
  return row?.version ?? 0
}

/** The columns of a `games` row that come from IGDB. */
export const gameColumns = (data: GameData, lineage: readonly LineageStep[], now: number) => ({
  igdbId: data.igdbId,
  slug: data.slug,
  title: data.title,
  kind: data.kind,
  versionTitle: data.versionTitle ?? null,
  releasedOn: data.releasedOn ?? null,
  year: data.year ?? null,
  cover: data.cover ?? null,
  summary: data.summary ?? null,
  storyline: data.storyline ?? null,
  igdbRating: data.igdbRating ?? null,
  igdbRatingCount: data.igdbRatingCount,
  length: data.length ?? null,
  genres: data.genres,
  themes: data.themes,
  modes: data.modes,
  perspectives: data.perspectives,
  platforms: data.platforms,
  franchises: data.franchises,
  series: data.series,
  keywords: data.keywords,
  developers: data.developers,
  publishers: data.publishers,
  screenshots: data.screenshots,
  artworks: data.artworks,
  releases: data.releases,
  storeIds: data.storeIds,
  lineage: [...lineage],
  igdbUrl: data.igdbUrl ?? null,
  igdbUpdatedAt: data.igdbUpdatedAt ?? null,
  fetchedAt: now,
  checkedAt: now,
})

/**
 * Stores an IGDB record, or refreshes the copy already held. Returns our id
 * for it. Cover colors are kept unless new ones are given.
 */
export const saveGame = async (
  tx: Executor,
  data: GameData,
  options: { lineage: readonly LineageStep[]; art?: CoverArt; now?: number },
): Promise<string> => {
  const now = options.now ?? Date.now()
  const columns = gameColumns(data, options.lineage, now)
  const art = options.art ? { colors: options.art.colors, thumbhash: options.art.thumbhash } : {}
  const [row] = await tx
    .insert(games)
    .values({ id: randomUUID(), ...columns, ...art })
    .onConflictDoUpdate({ target: games.igdbId, set: { ...columns, ...art } })
    .returning({ id: games.id })
  if (!row) throw new Error('The game was not stored')
  return row.id
}

export const saveVocab = async (tx: Executor, kind: VocabKind, items: readonly IgdbNamed[]) => {
  if (items.length === 0) return
  await tx
    .insert(vocab)
    .values(items.map((item) => ({ kind, id: item.id, name: item.name, slug: item.slug })))
    .onConflictDoUpdate({
      target: [vocab.kind, vocab.id],
      set: { name: sql`excluded.name`, slug: sql`excluded.slug` },
    })
}

export const saveCompanies = (tx: Executor, companies: readonly Company[]) =>
  saveVocab(tx, 'company', companies)

export const platformColumns = (platform: Platform) => ({
  igdbId: platform.igdbId,
  key: platform.key,
  name: platform.name,
  short: platform.short,
  family: platform.family,
  generation: platform.generation ?? null,
  shape: platform.shape,
  plastic: platform.plastic,
})

export const savePlatforms = async (tx: Executor, list: readonly Platform[]) => {
  if (list.length === 0) return
  await tx
    .insert(platforms)
    .values(list.map(platformColumns))
    .onConflictDoUpdate({
      target: platforms.igdbId,
      set: {
        key: sql`excluded.key`,
        name: sql`excluded.name`,
        short: sql`excluded.short`,
        family: sql`excluded.family`,
        generation: sql`excluded.generation`,
        shape: sql`excluded.shape`,
        plastic: sql`excluded.plastic`,
      },
    })
}

export type NewCopy = {
  platformId: number
  format: Format
  /** Our id of the exact version this copy is, when it is not the primary. */
  gameId?: string
  acquiredOn?: Day
}

export type NewEntry = {
  /** Our id of the game that supplies the title and cover. */
  primaryGameId: string
  status: Status
  rating?: number
  notes?: string
  notesPublic?: boolean
  featured?: boolean
  /** Milliseconds. Defaults to now. */
  addedAt?: number
  completedOn?: Day
  copies?: readonly NewCopy[]
  /** Minutes I typed in. */
  minutes?: number
  tags?: readonly string[]
}

const checkCopy = (copy: NewCopy) => {
  if (!isFormat(copy.format)) throw invalid('A copy is physical or digital')
  if (!Number.isInteger(copy.platformId)) throw invalid('A copy needs a platform')
  if (copy.acquiredOn !== undefined && !isDay(copy.acquiredOn)) {
    throw invalid('The date a copy was acquired must be a calendar day')
  }
}

const checkMine = (input: {
  status?: Status
  rating?: number | null
  completedOn?: Day | null
  minutes?: number
}) => {
  if (input.status !== undefined && !isStatus(input.status)) throw invalid('Unknown status')
  if (input.rating !== undefined && input.rating !== null && !isRating(input.rating)) {
    throw invalid('A rating is a whole number from 0 to 100')
  }
  if (input.completedOn !== undefined && input.completedOn !== null && !isDay(input.completedOn)) {
    throw invalid('The completion date must be a calendar day')
  }
  if (input.minutes !== undefined && (!Number.isInteger(input.minutes) || input.minutes < 0)) {
    throw invalid('Playtime is a whole number of minutes')
  }
}

/**
 * True for a broken UNIQUE, CHECK or foreign key. SQLite says so in the
 * error's code; Drizzle wraps that error, so the cause chain is searched.
 */
const isConstraintError = (error: unknown): boolean => {
  for (let current = error, depth = 0; current instanceof Error && depth < 5; depth += 1) {
    const code = String((current as { code?: unknown }).code ?? '')
    if (code.startsWith('SQLITE_CONSTRAINT')) return true
    current = current.cause
  }
  return false
}

const withConflict = async <T>(message: string, run: () => Promise<T>): Promise<T> => {
  try {
    return await run()
  } catch (error) {
    if (error instanceof LibraryError) throw error
    if (isConstraintError(error)) throw new LibraryError('conflict', message)
    throw error
  }
}

const requireEntry = async (tx: Executor, entryId: string) => {
  const [entry] = await tx.select().from(entries).where(eq(entries.id, entryId)).limit(1)
  if (!entry) throw notFound('That entry')
  return entry
}

const insertCopy = async (tx: Executor, entryId: string, copy: NewCopy, now: number) => {
  checkCopy(copy)
  const id = randomUUID()
  await tx.insert(copies).values({
    id,
    entryId,
    platformId: copy.platformId,
    format: copy.format,
    gameId: copy.gameId ?? null,
    acquiredOn: copy.acquiredOn ?? null,
    createdAt: now,
  })
  return id
}

const writeManualMinutes = async (tx: Executor, entryId: string, minutes: number, now: number) => {
  // Manual time is one row per entry: the row with no copy and the source "manual".
  await tx
    .delete(playTime)
    .where(
      and(eq(playTime.entryId, entryId), eq(playTime.source, 'manual'), isNull(playTime.copyId)),
    )
  if (minutes > 0) {
    await tx.insert(playTime).values({
      id: randomUUID(),
      entryId,
      copyId: null,
      source: 'manual',
      minutes,
      updatedAt: now,
    })
  }
}

const cleanTagNames = (names: readonly string[]): { name: string; slug: string }[] => {
  const bySlug = new Map<string, string>()
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ')
    const slug = toSlug(name)
    if (slug && !bySlug.has(slug)) bySlug.set(slug, name)
  }
  return [...bySlug].map(([slug, name]) => ({ name, slug }))
}

const writeTags = async (tx: Executor, entryId: string, names: readonly string[]) => {
  const wanted = cleanTagNames(names)
  await tx.delete(entryTags).where(eq(entryTags.entryId, entryId))
  if (wanted.length > 0) {
    await tx
      .insert(tags)
      .values(wanted.map((tag) => ({ id: randomUUID(), ...tag })))
      .onConflictDoNothing({ target: tags.slug })
    const stored = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        inArray(
          tags.slug,
          wanted.map((tag) => tag.slug),
        ),
      )
    await tx.insert(entryTags).values(stored.map((tag) => ({ entryId, tagId: tag.id })))
  }
  // A tag nothing wears is not a tag.
  await tx.delete(tags).where(sql`${tags.id} not in (select ${entryTags.tagId} from ${entryTags})`)
}

/** Adds a game to the library: the entry, its primary version, its copies. */
export const createEntry = (db: Db, input: NewEntry, now = Date.now()): Promise<string> => {
  checkMine(input)
  return withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const id = randomUUID()
      await tx.insert(entries).values({
        id,
        status: input.status,
        rating: input.rating ?? null,
        notes: input.notes?.trim() || null,
        notesPublic: input.notesPublic ?? false,
        featured: input.featured ?? false,
        addedAt: input.addedAt ?? now,
        completedOn: input.completedOn ?? null,
        createdAt: now,
        updatedAt: now,
      })
      await tx
        .insert(entryVersions)
        .values({ entryId: id, gameId: input.primaryGameId, relation: 'primary' })
      for (const copy of input.copies ?? []) await insertCopy(tx, id, copy, now)
      if (input.minutes) await writeManualMinutes(tx, id, input.minutes, now)
      if (input.tags?.length) await writeTags(tx, id, input.tags)
      await bumpVersion(tx)
      return id
    }),
  )
}

export type EntryPatch = {
  status?: Status
  rating?: number | null
  notes?: string | null
  notesPublic?: boolean
  featured?: boolean
  completedOn?: Day | null
  displayCopyId?: string | null
  addedAt?: number
}

export const updateEntry = (db: Db, entryId: string, patch: EntryPatch, now = Date.now()) => {
  checkMine(patch)
  return db.transaction(async (tx) => {
    await requireEntry(tx, entryId)
    if (patch.displayCopyId) {
      const [copy] = await tx
        .select({ id: copies.id })
        .from(copies)
        .where(and(eq(copies.id, patch.displayCopyId), eq(copies.entryId, entryId)))
        .limit(1)
      if (!copy) throw invalid('That copy belongs to another game')
    }
    const notes = patch.notes === undefined ? undefined : patch.notes?.trim() || null
    await tx
      .update(entries)
      .set({ ...patch, ...(notes === undefined ? {} : { notes }), updatedAt: now })
      .where(eq(entries.id, entryId))
    await bumpVersion(tx)
  })
}

/** Folds another IGDB record into an entry: an edition, a port, a remaster. */
export const addVersion = (
  db: Db,
  entryId: string,
  gameId: string,
  relation: Exclude<Relation, 'primary'>,
) => {
  if (!relations.includes(relation) || (relation as Relation) === 'primary') {
    throw invalid('An added version cannot be the primary')
  }
  return withConflict('That version already belongs to a game in the library', () =>
    db.transaction(async (tx) => {
      await requireEntry(tx, entryId)
      await tx.insert(entryVersions).values({ entryId, gameId, relation })
      await bumpVersion(tx)
    }),
  )
}

/** Makes another of the entry's versions the one that supplies title and cover. */
export const setPrimary = (db: Db, entryId: string, gameId: string, now = Date.now()) =>
  db.transaction(async (tx) => {
    const versions = await tx.select().from(entryVersions).where(eq(entryVersions.entryId, entryId))
    const next = versions.find((version) => version.gameId === gameId)
    if (!next) throw notFound('That version')
    if (next.relation === 'primary') return
    // The old primary steps down first: an entry may have only one.
    await tx
      .update(entryVersions)
      .set({ relation: 'other' })
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.relation, 'primary')))
    await tx
      .update(entryVersions)
      .set({ relation: 'primary' })
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.gameId, gameId)))
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx)
  })

export const addCopy = (db: Db, entryId: string, copy: NewCopy, now = Date.now()) =>
  withConflict('That platform and format are already on this game', () =>
    db.transaction(async (tx) => {
      await requireEntry(tx, entryId)
      const id = await insertCopy(tx, entryId, copy, now)
      await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
      await bumpVersion(tx)
      return id
    }),
  )

export const removeCopy = (db: Db, copyId: string, now = Date.now()) =>
  db.transaction(async (tx) => {
    const [copy] = await tx.select().from(copies).where(eq(copies.id, copyId)).limit(1)
    if (!copy) throw notFound('That copy')
    await tx.delete(playTime).where(eq(playTime.copyId, copyId))
    await tx.delete(copies).where(eq(copies.id, copyId))
    await tx
      .update(entries)
      .set({ displayCopyId: null, updatedAt: now })
      .where(and(eq(entries.id, copy.entryId), eq(entries.displayCopyId, copyId)))
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, copy.entryId))
    await bumpVersion(tx)
  })

/** Sets the minutes I typed in. Time from a future sync lives in its own rows. */
export const setManualMinutes = (db: Db, entryId: string, minutes: number, now = Date.now()) => {
  checkMine({ minutes })
  return db.transaction(async (tx) => {
    await requireEntry(tx, entryId)
    await writeManualMinutes(tx, entryId, minutes, now)
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx)
  })
}

export const setTags = (db: Db, entryId: string, names: readonly string[], now = Date.now()) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, entryId)
    await writeTags(tx, entryId, names)
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx)
  })

/**
 * Removes a game and everything added with it: versions, copies, playtime,
 * tags, and the cached IGDB records only it used. Children are deleted here
 * and not left to cascades, so the result is the same on every engine.
 */
export const removeEntry = (db: Db, entryId: string) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, entryId)
    const versions = await tx
      .select({ gameId: entryVersions.gameId })
      .from(entryVersions)
      .where(eq(entryVersions.entryId, entryId))
    await tx.delete(playTime).where(eq(playTime.entryId, entryId))
    await tx.delete(copies).where(eq(copies.entryId, entryId))
    await tx.delete(entryTags).where(eq(entryTags.entryId, entryId))
    await tx.delete(entryVersions).where(eq(entryVersions.entryId, entryId))
    await tx.delete(entries).where(eq(entries.id, entryId))
    if (versions.length > 0) {
      await tx.delete(games).where(
        inArray(
          games.id,
          versions.map((version) => version.gameId),
        ),
      )
    }
    await tx
      .delete(tags)
      .where(sql`${tags.id} not in (select ${entryTags.tagId} from ${entryTags})`)
    await bumpVersion(tx)
  })

/**
 * Every IGDB record linked to an entry, with its family chain: what the
 * grouping rule needs to recognize a relative of a game being added.
 */
export const readLinkedMembers = async (db: Executor): Promise<LinkedMember[]> => {
  const rows = await db
    .select({ igdbId: games.igdbId, lineage: games.lineage, entryId: entryVersions.entryId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
  return rows.flatMap((row) =>
    row.igdbId === null ? [] : [{ igdbId: row.igdbId, lineage: row.lineage, entryId: row.entryId }],
  )
}

/** The entry a public address belongs to, whichever of its versions the slug names. */
export const findEntryIdBySlug = async (
  db: Executor,
  slug: string,
): Promise<string | undefined> => {
  const [row] = await db
    .select({ entryId: entryVersions.entryId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(eq(games.slug, slug))
    .limit(1)
  return row?.entryId
}
