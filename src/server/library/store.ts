import 'server-only'

import { randomBytes, randomUUID } from 'node:crypto'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import type { Palette } from '@/domain/color/palette'
import type { Company, GameData, LineageStep } from '@/domain/igdb/game'
import type { IgdbNamed, VocabKind } from '@/domain/igdb/schema'
import type { Added } from '@/domain/library/adding'
import type { LinkedMember } from '@/domain/library/family'
import {
  cleanShelf,
  freeSlug,
  MAX_SHELF_NAME,
  STARTER_SHELVES,
  type SmartShelf,
} from '@/domain/library/shelves'
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
  type SyncSource,
} from '@/domain/library/values'
import { MAX_QUERY_LENGTH } from '@/domain/library/view'
import type { Platform } from '@/domain/platforms/platforms'
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
  removedEntries,
  shelves,
  sourceItems,
  tags,
  vocab,
} from '@/server/db/schema'

/**
 * Every write to a library. Each takes the library it is for, an account's
 * id (ADR 004), and reaches nothing outside it: an entry or copy of another
 * library is "not found". Who may write to which library is the services'
 * question, asked first. Each public write runs in one transaction and ends
 * by raising that library's version, which is what tells every cache and
 * every open browser that it changed. The IGDB records (`games`, `vocab`,
 * `platforms`) are every library's.
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

/** A key for a library's files: random, so one address can't be guessed from another. */
export const newLibraryKey = (): string => randomBytes(12).toString('base64url')

/** Raises a library's version by one. Called inside the transaction of every write to it. */
export const bumpVersion = (tx: Executor, libraryId: string) =>
  tx
    .insert(libraries)
    .values({ userId: libraryId, version: 1, key: newLibraryKey(), createdAt: Date.now() })
    .onConflictDoUpdate({
      target: libraries.userId,
      set: { version: sql`${libraries.version} + 1` },
    })

export const readVersion = async (db: Executor, libraryId: string): Promise<number> => {
  const [row] = await db
    .select({ version: libraries.version })
    .from(libraries)
    .where(eq(libraries.userId, libraryId))
    .limit(1)
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

/** An entry of this library. Another library's is not found, as if it did not exist. */
const requireEntry = async (tx: Executor, libraryId: string, entryId: string) => {
  const [entry] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, libraryId)))
    .limit(1)
  if (!entry) throw notFound('That entry')
  return entry
}

/** A copy on a game of this library. */
const requireCopy = async (tx: Executor, libraryId: string, copyId: string) => {
  const [copy] = await tx
    .select({ id: copies.id, entryId: copies.entryId })
    .from(copies)
    .innerJoin(entries, eq(entries.id, copies.entryId))
    .where(and(eq(copies.id, copyId), eq(entries.userId, libraryId)))
    .limit(1)
  if (!copy) throw notFound('That copy')
  return copy
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

/** A tag of this library that nothing wears is not a tag. */
const dropUnwornTags = (tx: Executor, libraryId: string) =>
  tx
    .delete(tags)
    .where(
      and(
        eq(tags.userId, libraryId),
        sql`${tags.id} not in (select ${entryTags.tagId} from ${entryTags})`,
      ),
    )

const writeTags = async (
  tx: Executor,
  libraryId: string,
  entryId: string,
  names: readonly string[],
) => {
  const wanted = cleanTagNames(names)
  await tx.delete(entryTags).where(eq(entryTags.entryId, entryId))
  if (wanted.length > 0) {
    await tx
      .insert(tags)
      .values(wanted.map((tag) => ({ id: randomUUID(), userId: libraryId, ...tag })))
      .onConflictDoNothing({ target: [tags.userId, tags.slug] })
    const stored = await tx
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.userId, libraryId),
          inArray(
            tags.slug,
            wanted.map((tag) => tag.slug),
          ),
        ),
      )
    await tx.insert(entryTags).values(stored.map((tag) => ({ entryId, tagId: tag.id })))
  }
  await dropUnwornTags(tx, libraryId)
}

const insertEntry = async (
  tx: Executor,
  libraryId: string,
  input: NewEntry,
  now: number,
): Promise<string> => {
  const id = randomUUID()
  await tx.insert(entries).values({
    id,
    userId: libraryId,
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
    .values({ entryId: id, gameId: input.primaryGameId, userId: libraryId, relation: 'primary' })
  for (const copy of input.copies ?? []) await insertCopy(tx, id, copy, now)
  if (input.minutes) await writeManualMinutes(tx, id, input.minutes, now)
  if (input.tags?.length) await writeTags(tx, libraryId, id, input.tags)
  return id
}

/** Adds a game to a library: the entry, its primary version, its copies. */
export const createEntry = (
  db: Db,
  libraryId: string,
  input: NewEntry,
  now = Date.now(),
): Promise<string> => {
  checkMine(input)
  return withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const id = await insertEntry(tx, libraryId, input, now)
      await bumpVersion(tx, libraryId)
      return id
    }),
  )
}

/** Everything about one IGDB record that adding it stores: the record, and the names it uses. */
export type RecordToStore = {
  data: GameData
  lineage: readonly LineageStep[]
  art?: CoverArt
  names: readonly { kind: Exclude<VocabKind, 'company'>; items: readonly IgdbNamed[] }[]
  /** The platforms it was released on, and any a copy is on. */
  platforms: readonly Platform[]
}

/**
 * Where an added record goes (ADR 001, decision 4): an entry of its own, or
 * into an entry already on the shelf, as a version of it with the copies
 * owned of it. `version` is absent when the record is already that entry's.
 */
export type Placement =
  | { kind: 'entry'; entry: Omit<NewEntry, 'primaryGameId'> }
  | {
      kind: 'join'
      entryId: string
      version?: Exclude<Relation, 'primary'>
      copies: readonly Omit<NewCopy, 'gameId'>[]
    }

/** Stores a record and places it, inside a transaction that raises the version after. */
const placeRecord = async (
  tx: Executor,
  libraryId: string,
  record: RecordToStore,
  placement: Placement,
  now: number,
): Promise<Added> => {
  await savePlatforms(tx, record.platforms)
  await saveCompanies(tx, record.data.companies)
  for (const { kind, items } of record.names) await saveVocab(tx, kind, items)
  const gameId = await saveGame(tx, record.data, {
    lineage: record.lineage,
    ...(record.art ? { art: record.art } : {}),
    now,
  })

  if (placement.kind === 'entry') {
    const entryId = await insertEntry(
      tx,
      libraryId,
      { ...placement.entry, primaryGameId: gameId },
      now,
    )
    const copyIds = (
      await tx.select({ id: copies.id }).from(copies).where(eq(copies.entryId, entryId))
    ).map((row) => row.id)
    return { entryId, gameId, newEntry: true, newVersion: true, copyIds }
  }

  const { entryId } = placement
  await requireEntry(tx, libraryId, entryId)
  if (placement.version) {
    await tx
      .insert(entryVersions)
      .values({ entryId, gameId, userId: libraryId, relation: placement.version })
  }
  const copyIds: string[] = []
  for (const copy of placement.copies) {
    // A copy of a version names it; a copy of the entry's own record does not need to.
    const version = placement.version ? { gameId } : {}
    copyIds.push(await insertCopy(tx, entryId, { ...copy, ...version }, now))
  }
  await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
  return { entryId, gameId, newEntry: false, newVersion: Boolean(placement.version), copyIds }
}

/**
 * Stores an IGDB record and adds it to the library, in one transaction: the
 * record, the names it uses, its platforms, and the entry, or the version
 * and copies folded into an existing one.
 */
export const addFromIgdb = (
  db: Db,
  libraryId: string,
  record: RecordToStore,
  placement: Placement,
  now = Date.now(),
): Promise<Added> => {
  if (placement.kind === 'entry') checkMine(placement.entry)
  return withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const added = await placeRecord(tx, libraryId, record, placement, now)
      await bumpVersion(tx, libraryId)
      return added
    }),
  )
}

/**
 * A source's hours on this library's copies, as they should be: by copy, the
 * sum of the minutes of the items feeding it.
 */
const sourceMinutes = async (
  tx: Executor,
  libraryId: string,
  source: SyncSource,
  copyIds?: readonly string[],
) => {
  const rows = await tx
    .select({
      copyId: copies.id,
      entryId: copies.entryId,
      minutes: sql<number>`sum(${sourceItems.minutes})`,
    })
    .from(sourceItems)
    .innerJoin(copies, eq(copies.id, sourceItems.copyId))
    .where(
      and(
        eq(sourceItems.userId, libraryId),
        eq(sourceItems.source, source),
        ...(copyIds ? [inArray(copies.id, [...copyIds])] : []),
      ),
    )
    .groupBy(copies.id, copies.entryId)
  return rows.map((row) => ({ ...row, minutes: Number(row.minutes) || 0 }))
}

/**
 * Writes a source's hours where they differ from what is stored, each copy
 * in a row of the source's own, so what I typed is never touched (ADR 003,
 * decision 5). True when anything changed.
 */
const writeSourceMinutes = async (
  tx: Executor,
  libraryId: string,
  source: SyncSource,
  wanted: readonly { copyId: string; entryId: string; minutes: number }[],
  now: number,
): Promise<boolean> => {
  if (wanted.length === 0) return false
  const stored = await tx
    .select({ copyId: playTime.copyId, minutes: playTime.minutes })
    .from(playTime)
    .innerJoin(entries, eq(entries.id, playTime.entryId))
    .where(and(eq(entries.userId, libraryId), eq(playTime.source, source)))
  const have = new Map<string, number[]>()
  for (const row of stored) {
    if (row.copyId) have.set(row.copyId, [...(have.get(row.copyId) ?? []), row.minutes])
  }
  const changed = wanted.filter(({ copyId, minutes }) => {
    const rows = have.get(copyId) ?? []
    return minutes === 0 ? rows.length > 0 : rows.length !== 1 || rows[0] !== minutes
  })
  if (changed.length === 0) return false
  await tx.delete(playTime).where(
    and(
      eq(playTime.source, source),
      inArray(
        playTime.copyId,
        changed.map((row) => row.copyId),
      ),
    ),
  )
  const rows = changed.filter((row) => row.minutes > 0)
  if (rows.length > 0) {
    await tx.insert(playTime).values(
      rows.map((row) => ({
        id: randomUUID(),
        entryId: row.entryId,
        copyId: row.copyId,
        source,
        minutes: row.minutes,
        updatedAt: now,
      })),
    )
  }
  return true
}

/** The copy a synced game feeds, once it is on the shelf. */
export type FromSource = {
  source: SyncSource
  /** Its items, every one naming this record. */
  itemIds: readonly string[]
  /** Where its copy is: the copy is made unless the entry has one there already. */
  platformId: number
  format: Format
}

/**
 * A game from a source, onto the shelf, in one transaction (ADR 003): the
 * record placed as ADR 001 places any other, the source's items pointed at
 * the copy on its platform and format, and that copy given the source's
 * hours. A copy the entry already has there is fed, not doubled.
 */
export const addFromSource = (
  db: Db,
  libraryId: string,
  record: RecordToStore,
  placement: Placement,
  feed: FromSource,
  now = Date.now(),
): Promise<Added> => {
  if (placement.kind === 'entry') checkMine(placement.entry)
  return withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const added = await placeRecord(tx, libraryId, record, placement, now)
      const [copy] = await tx
        .select({ id: copies.id })
        .from(copies)
        .where(
          and(
            eq(copies.entryId, added.entryId),
            eq(copies.platformId, feed.platformId),
            eq(copies.format, feed.format),
          ),
        )
        .limit(1)
      if (!copy) throw invalid('A synced game needs a copy on its platform')
      await tx
        .update(sourceItems)
        .set({ copyId: copy.id })
        .where(and(eq(sourceItems.userId, libraryId), inArray(sourceItems.id, [...feed.itemIds])))
      await writeSourceMinutes(
        tx,
        libraryId,
        feed.source,
        await sourceMinutes(tx, libraryId, feed.source, [copy.id]),
        now,
      )
      await bumpVersion(tx, libraryId)
      return added
    }),
  )
}

/**
 * Brings every copy's hours from a source up to date with what its items
 * last reported, in one transaction that raises the version only when one
 * changed. A day's sync changes a few; the rest cost nothing.
 */
export const feedCopies = (
  db: Db,
  libraryId: string,
  source: SyncSource,
  now = Date.now(),
): Promise<boolean> =>
  db.transaction(async (tx) => {
    const changed = await writeSourceMinutes(
      tx,
      libraryId,
      source,
      await sourceMinutes(tx, libraryId, source),
      now,
    )
    if (changed) await bumpVersion(tx, libraryId)
    return changed
  })

/**
 * The sync's items that fed copies about to be deleted: marked as removed by
 * me, so the next sync does not put them back.
 */
const letGoOfCopies = async (tx: Executor, copyIds: readonly string[]) => {
  if (copyIds.length === 0) return
  await tx
    .update(sourceItems)
    .set({ copyId: null, decision: 'removed' })
    .where(inArray(sourceItems.copyId, [...copyIds]))
}

/**
 * Deletes these IGDB records where no library uses them any more, as a
 * version or as a copy's exact version. Another library's are kept.
 */
const dropUnusedGames = async (tx: Executor, gameIds: readonly string[]) => {
  if (gameIds.length === 0) return
  await tx
    .delete(games)
    .where(
      and(
        inArray(games.id, [...gameIds]),
        sql`${games.id} not in (select ${entryVersions.gameId} from ${entryVersions})`,
        sql`${games.id} not in (select ${copies.gameId} from ${copies} where ${copies.gameId} is not null)`,
      ),
    )
}

/**
 * Undoes an add that joined an existing entry: its copies, and the version
 * it linked, with the record when nothing else uses it. An add that made an
 * entry of its own is undone with `removeEntry`.
 */
export const undoJoin = (db: Db, libraryId: string, added: Added, now = Date.now()) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, added.entryId)
    if (added.copyIds.length > 0) {
      await tx.delete(playTime).where(inArray(playTime.copyId, added.copyIds))
      await tx
        .update(entries)
        .set({ displayCopyId: null })
        .where(and(eq(entries.id, added.entryId), inArray(entries.displayCopyId, added.copyIds)))
      await tx
        .delete(copies)
        .where(and(eq(copies.entryId, added.entryId), inArray(copies.id, added.copyIds)))
    }
    if (added.newVersion) {
      await tx
        .delete(entryVersions)
        .where(
          and(
            eq(entryVersions.entryId, added.entryId),
            eq(entryVersions.gameId, added.gameId),
            sql`${entryVersions.relation} != 'primary'`,
          ),
        )
      await dropUnusedGames(tx, [added.gameId])
    }
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, added.entryId))
    await bumpVersion(tx, libraryId)
  })

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

export const updateEntry = (
  db: Db,
  libraryId: string,
  entryId: string,
  patch: EntryPatch,
  now = Date.now(),
) => {
  checkMine(patch)
  return db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
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
    await bumpVersion(tx, libraryId)
  })
}

/**
 * Several changes to one entry, in one transaction: what is mine about it,
 * its tags, and the minutes I typed in. For the API, where one request may
 * carry them all.
 */
export const patchEntry = (
  db: Db,
  libraryId: string,
  entryId: string,
  patch: { mine?: EntryPatch; tags?: readonly string[]; minutes?: number },
  now = Date.now(),
) => {
  if (patch.mine) checkMine(patch.mine)
  if (patch.minutes !== undefined) checkMine({ minutes: patch.minutes })
  return db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
    if (patch.mine && Object.keys(patch.mine).length > 0) {
      const notes = patch.mine.notes === undefined ? undefined : patch.mine.notes?.trim() || null
      await tx
        .update(entries)
        .set({ ...patch.mine, ...(notes === undefined ? {} : { notes }) })
        .where(eq(entries.id, entryId))
    }
    if (patch.tags) await writeTags(tx, libraryId, entryId, patch.tags)
    if (patch.minutes !== undefined) await writeManualMinutes(tx, entryId, patch.minutes, now)
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
  })
}

/** How many ids one query names: well under SQLite's limit on a statement's values. */
const IDS_PER_QUERY = 200

/**
 * Gives many games one status in one write (spec 4.5): placing what a sync
 * brought in, or taking that back. Nothing else about them changes. Every
 * one must be the library's own, or none is changed.
 */
export const setStatuses = async (
  db: Db,
  libraryId: string,
  entryIds: readonly string[],
  status: Status,
  now = Date.now(),
) => {
  if (!isStatus(status)) throw invalid('No such status')
  const ids = [...new Set(entryIds)]
  await db.transaction(async (tx) => {
    for (let at = 0; at < ids.length; at += IDS_PER_QUERY) {
      const some = ids.slice(at, at + IDS_PER_QUERY)
      const own = and(eq(entries.userId, libraryId), inArray(entries.id, some))
      const found = await tx.select({ id: entries.id }).from(entries).where(own)
      if (found.length !== some.length) throw notFound('A game')
      await tx.update(entries).set({ status, updatedAt: now }).where(own)
    }
    await bumpVersion(tx, libraryId)
  })
}

/** Folds another IGDB record into an entry: an edition, a port, a remaster. */
export const addVersion = (
  db: Db,
  libraryId: string,
  entryId: string,
  gameId: string,
  relation: Exclude<Relation, 'primary'>,
) => {
  if (!relations.includes(relation) || (relation as Relation) === 'primary') {
    throw invalid('An added version cannot be the primary')
  }
  return withConflict('That version already belongs to a game in the library', () =>
    db.transaction(async (tx) => {
      await requireEntry(tx, libraryId, entryId)
      await tx.insert(entryVersions).values({ entryId, gameId, userId: libraryId, relation })
      await bumpVersion(tx, libraryId)
    }),
  )
}

/** Makes another of the entry's versions the one that supplies title and cover. */
export const setPrimary = (
  db: Db,
  libraryId: string,
  entryId: string,
  gameId: string,
  now = Date.now(),
) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
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
    await bumpVersion(tx, libraryId)
  })

export const addCopy = (
  db: Db,
  libraryId: string,
  entryId: string,
  copy: NewCopy,
  now = Date.now(),
) =>
  withConflict('That platform and format are already on this game', () =>
    db.transaction(async (tx) => {
      await requireEntry(tx, libraryId, entryId)
      const id = await insertCopy(tx, entryId, copy, now)
      await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
      await bumpVersion(tx, libraryId)
      return id
    }),
  )

export const removeCopy = (db: Db, libraryId: string, copyId: string, now = Date.now()) =>
  db.transaction(async (tx) => {
    const copy = await requireCopy(tx, libraryId, copyId)
    await letGoOfCopies(tx, [copyId])
    await tx.delete(playTime).where(eq(playTime.copyId, copyId))
    await tx.delete(copies).where(eq(copies.id, copyId))
    await tx
      .update(entries)
      .set({ displayCopyId: null, updatedAt: now })
      .where(and(eq(entries.id, copy.entryId), eq(entries.displayCopyId, copyId)))
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, copy.entryId))
    await bumpVersion(tx, libraryId)
  })

/** Sets the minutes I typed in. Time from a future sync lives in its own rows. */
export const setManualMinutes = (
  db: Db,
  libraryId: string,
  entryId: string,
  minutes: number,
  now = Date.now(),
) => {
  checkMine({ minutes })
  return db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
    await writeManualMinutes(tx, entryId, minutes, now)
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
  })
}

export const setTags = (
  db: Db,
  libraryId: string,
  entryId: string,
  names: readonly string[],
  now = Date.now(),
) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
    await writeTags(tx, libraryId, entryId, names)
    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
  })

/**
 * Removes a game and everything added with it: versions, copies, playtime,
 * tags, and the cached IGDB records only it used: a record another library
 * has stays. Children are deleted here and not left to cascades, so the
 * result is the same on every engine.
 */
const deleteEntry = async (tx: Executor, libraryId: string, entryId: string) => {
  const versions = await tx
    .select({ gameId: entryVersions.gameId })
    .from(entryVersions)
    .where(eq(entryVersions.entryId, entryId))
  const owned = await tx.select({ id: copies.id }).from(copies).where(eq(copies.entryId, entryId))
  await letGoOfCopies(
    tx,
    owned.map((copy) => copy.id),
  )
  await tx.delete(playTime).where(eq(playTime.entryId, entryId))
  await tx.delete(copies).where(eq(copies.entryId, entryId))
  await tx.delete(entryTags).where(eq(entryTags.entryId, entryId))
  await tx.delete(entryVersions).where(eq(entryVersions.entryId, entryId))
  await tx.delete(entries).where(eq(entries.id, entryId))
  await dropUnusedGames(
    tx,
    versions.map((version) => version.gameId),
  )
  await dropUnwornTags(tx, libraryId)
}

export const removeEntry = (db: Db, libraryId: string, entryId: string) =>
  db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
    await deleteEntry(tx, libraryId, entryId)
    await bumpVersion(tx, libraryId)
  })

/**
 * Everything a library holds, gone: for an account being deleted. The IGDB
 * records stay where another library uses them. The version is not raised:
 * there is no library left to show.
 */
/**
 * A new account's library (ADR 004): its version and key, and the starter
 * shelves. Run once, when the account is made; again, it changes nothing
 * but the version.
 */
export const startLibrary = (db: Db, libraryId: string, now = Date.now()) =>
  db.transaction(async (tx) => {
    await bumpVersion(tx, libraryId)
    await tx
      .insert(shelves)
      .values(
        STARTER_SHELVES.map((shelf, position) => ({
          id: randomUUID(),
          userId: libraryId,
          ...shelf,
          position,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
  })

export const removeLibrary = (db: Db, libraryId: string) =>
  db.transaction(async (tx) => {
    const own = await tx
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.userId, libraryId))
    for (const { id } of own) await deleteEntry(tx, libraryId, id)
    await tx.delete(tags).where(eq(tags.userId, libraryId))
    await tx.delete(shelves).where(eq(shelves.userId, libraryId))
    await tx.delete(removedEntries).where(eq(removedEntries.userId, libraryId))
    await tx.delete(libraries).where(eq(libraries.userId, libraryId))
  })

/** Everything removing a game takes away, as rows, so it can all go back. */
type EntrySnapshot = {
  entry: typeof entries.$inferSelect
  versions: (typeof entryVersions.$inferSelect)[]
  games: (typeof games.$inferSelect)[]
  copies: (typeof copies.$inferSelect)[]
  playTime: (typeof playTime.$inferSelect)[]
  tags: string[]
  /** The sync's items that fed its copies, put back with them. Absent in what was removed before sync. */
  sourceItems?: { id: string; copyId: string }[]
}

/** How long a removed game can be put back. */
const KEPT_FOR_MS = 24 * 60 * 60 * 1000

/**
 * Removes a game as `removeEntry` does, keeping what it removed for a day.
 * Returns the id Undo takes.
 */
export const removeEntryForUndo = (db: Db, libraryId: string, entryId: string, now = Date.now()) =>
  db.transaction(async (tx) => {
    const entry = await requireEntry(tx, libraryId, entryId)
    const versions = await tx.select().from(entryVersions).where(eq(entryVersions.entryId, entryId))
    const ids = versions.map((version) => version.gameId)
    const snapshot: EntrySnapshot = {
      entry,
      versions,
      games: ids.length > 0 ? await tx.select().from(games).where(inArray(games.id, ids)) : [],
      copies: await tx.select().from(copies).where(eq(copies.entryId, entryId)),
      playTime: await tx.select().from(playTime).where(eq(playTime.entryId, entryId)),
      tags: (
        await tx
          .select({ name: tags.name })
          .from(entryTags)
          .innerJoin(tags, eq(tags.id, entryTags.tagId))
          .where(eq(entryTags.entryId, entryId))
      ).map((tag) => tag.name),
    }
    const primary = snapshot.games.find(
      (game) => versions.find((version) => version.relation === 'primary')?.gameId === game.id,
    )
    const copyIds = snapshot.copies.map((copy) => copy.id)
    if (copyIds.length > 0) {
      snapshot.sourceItems = (
        await tx
          .select({ id: sourceItems.id, copyId: sourceItems.copyId })
          .from(sourceItems)
          .where(inArray(sourceItems.copyId, copyIds))
      ).flatMap((item) => (item.copyId ? [{ id: item.id, copyId: item.copyId }] : []))
    }
    await deleteEntry(tx, libraryId, entryId)
    const id = randomUUID()
    await tx.insert(removedEntries).values({
      id,
      userId: libraryId,
      entryId,
      title: primary?.title ?? '',
      snapshot,
      removedAt: now,
    })
    await tx.delete(removedEntries).where(sql`${removedEntries.removedAt} < ${now - KEPT_FOR_MS}`)
    await bumpVersion(tx, libraryId)
    return id
  })

/**
 * Puts a removed game back exactly as it was, into the library it was
 * removed from. Returns its entry's id. A record kept since for another
 * library, or added again by one, is used as it is now.
 */
export const restoreEntry = (db: Db, libraryId: string, removedId: string) =>
  withConflict('That game is in the library again already', () =>
    db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(removedEntries)
        .where(and(eq(removedEntries.id, removedId), eq(removedEntries.userId, libraryId)))
        .limit(1)
      if (!row) throw notFound('That removed game')
      const snapshot = row.snapshot as EntrySnapshot
      const gameIds = new Map<string, string>()
      for (const game of snapshot.games) {
        await tx.insert(games).values(game).onConflictDoNothing()
        const [stored] = await tx
          .select({ id: games.id })
          .from(games)
          .where(game.igdbId === null ? eq(games.id, game.id) : eq(games.igdbId, game.igdbId))
          .limit(1)
        gameIds.set(game.id, stored?.id ?? game.id)
      }
      const gameId = (id: string) => gameIds.get(id) ?? id
      await tx.insert(entries).values({ ...snapshot.entry, userId: libraryId })
      if (snapshot.versions.length > 0) {
        await tx.insert(entryVersions).values(
          snapshot.versions.map((version) => ({
            ...version,
            gameId: gameId(version.gameId),
            userId: libraryId,
          })),
        )
      }
      if (snapshot.copies.length > 0) {
        await tx.insert(copies).values(
          snapshot.copies.map((copy) => ({
            ...copy,
            gameId: copy.gameId ? gameId(copy.gameId) : null,
          })),
        )
      }
      if (snapshot.playTime.length > 0) await tx.insert(playTime).values(snapshot.playTime)
      // The items still remembered go back to feeding their copies.
      for (const item of snapshot.sourceItems ?? []) {
        await tx
          .update(sourceItems)
          .set({ copyId: item.copyId, decision: 'copy' })
          .where(
            and(
              eq(sourceItems.id, item.id),
              eq(sourceItems.userId, libraryId),
              eq(sourceItems.decision, 'removed'),
            ),
          )
      }
      if (snapshot.tags.length > 0) {
        await writeTags(tx, libraryId, snapshot.entry.id, snapshot.tags)
      }
      await tx.delete(removedEntries).where(eq(removedEntries.id, removedId))
      await bumpVersion(tx, libraryId)
      return snapshot.entry.id
    }),
  )

/** Switches a copy between physical and digital. */
export const setCopyFormat = (
  db: Db,
  libraryId: string,
  copyId: string,
  format: Format,
  now = Date.now(),
) => {
  if (!isFormat(format)) throw invalid('A copy is physical or digital')
  return withConflict('That platform and format are already on this game', () =>
    db.transaction(async (tx) => {
      const copy = await requireCopy(tx, libraryId, copyId)
      await tx.update(copies).set({ format }).where(eq(copies.id, copyId))
      await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, copy.entryId))
      await bumpVersion(tx, libraryId)
    }),
  )
}

/**
 * Every IGDB record linked to an entry of this library, with its family
 * chain: what the grouping rule needs to recognize a relative of a game
 * being added.
 */
export const readLinkedMembers = async (
  db: Executor,
  libraryId: string,
): Promise<LinkedMember[]> => {
  const rows = await db
    .select({ igdbId: games.igdbId, lineage: games.lineage, entryId: entryVersions.entryId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(eq(entryVersions.userId, libraryId))
  return rows.flatMap((row) =>
    row.igdbId === null ? [] : [{ igdbId: row.igdbId, lineage: row.lineage, entryId: row.entryId }],
  )
}

/** This library's entry a game's address belongs to, whichever of its versions the slug names. */
export const findEntryIdBySlug = async (
  db: Executor,
  libraryId: string,
  slug: string,
): Promise<string | undefined> => {
  const [row] = await db
    .select({ entryId: entryVersions.entryId })
    .from(entryVersions)
    .innerJoin(games, eq(games.id, entryVersions.gameId))
    .where(and(eq(games.slug, slug), eq(entryVersions.userId, libraryId)))
    .limit(1)
  return row?.entryId
}

/** A smart shelf as it is saved: a name, a filter as text, a sort and a grouping. */
export type ShelfInput = Omit<SmartShelf, 'slug'>

const checkShelf = (input: ShelfInput): ShelfInput => {
  const name = input.name.trim()
  if (name.length === 0 || name.length > MAX_SHELF_NAME) {
    throw invalid(`A shelf's name is 1 to ${MAX_SHELF_NAME} characters`)
  }
  if (input.query.length > MAX_QUERY_LENGTH) throw invalid('That filter is too long')
  const clean = cleanShelf({ slug: '', ...input, name })
  return { name: clean.name, query: clean.query, sort: clean.sort, group: clean.group }
}

/**
 * Saves a smart shelf and returns its slug. Given a slug, it changes that
 * shelf and keeps its address, even when the name changes; without one, it
 * adds a shelf with an address of its own, after the others.
 *
 * Shelves are not in the library file, so saving one does not raise the
 * library's version: every visitor's cached file stays good. The service
 * that calls this expires the shelves' own cache.
 */
export const saveShelf = (
  db: Db,
  libraryId: string,
  input: ShelfInput & { slug?: string },
  now = Date.now(),
): Promise<string> =>
  db.transaction(async (tx) => {
    const shelf = checkShelf(input)
    if (input.slug !== undefined) {
      const changed = await tx
        .update(shelves)
        .set({ ...shelf, updatedAt: now })
        .where(and(eq(shelves.slug, input.slug), eq(shelves.userId, libraryId)))
        .returning({ slug: shelves.slug })
      if (changed.length === 0) throw notFound(`The shelf ${input.slug}`)
      return input.slug
    }
    const existing = await tx
      .select({ slug: shelves.slug, position: shelves.position })
      .from(shelves)
      .where(eq(shelves.userId, libraryId))
    const slug = freeSlug(shelf.name, new Set(existing.map((row) => row.slug)))
    const position = Math.max(-1, ...existing.map((row) => row.position)) + 1
    await tx.insert(shelves).values({
      id: randomUUID(),
      userId: libraryId,
      slug,
      ...shelf,
      position,
      createdAt: now,
      updatedAt: now,
    })
    return slug
  })

export const removeShelf = (db: Db, libraryId: string, slug: string): Promise<void> =>
  db.transaction(async (tx) => {
    const removed = await tx
      .delete(shelves)
      .where(and(eq(shelves.slug, slug), eq(shelves.userId, libraryId)))
      .returning({ slug: shelves.slug })
    if (removed.length === 0) throw notFound(`The shelf ${slug}`)
  })

/** A library's smart shelves, in the order they were placed. */
export const readShelves = async (db: Executor, libraryId: string): Promise<SmartShelf[]> => {
  const rows = await db
    .select({
      slug: shelves.slug,
      name: shelves.name,
      query: shelves.query,
      sort: shelves.sort,
      group: shelves.group,
    })
    .from(shelves)
    .where(eq(shelves.userId, libraryId))
    .orderBy(shelves.position, shelves.createdAt)
  return rows.map((row) => cleanShelf(row as SmartShelf))
}
