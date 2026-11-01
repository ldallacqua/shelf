import 'server-only'

import { randomBytes, randomUUID } from 'node:crypto'

import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import type { Palette } from '@/domain/color/palette'
import type { Company, GameData, LineageStep } from '@/domain/igdb/game'
import type { IgdbNamed, VocabKind } from '@/domain/igdb/schema'
import type { SteamGameData } from '@/domain/steam/store-game'
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
  dayOf,
  isDay,
  isFormat,
  isRating,
  isStatus,
  relations,
  syncSources,
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
  playSessions,
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
export const gameColumns = (
  data: Omit<GameData, 'igdbId'> & { igdbId: number | null },
  lineage: readonly LineageStep[],
  now: number,
) => ({
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
  videos: data.videos,
  releases: data.releases,
  storeIds: data.storeIds,
  lineage: [...lineage],
  igdbUrl: data.igdbUrl ?? null,
  igdbUpdatedAt: data.igdbUpdatedAt ?? null,
  adultsOnly: data.adultsOnly,
  ages: data.ages,
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
  /** The platforms I want it on, kept only on the wishlist (spec 7.5). */
  wanted?: readonly number[]
  rating?: number
  notes?: string
  notesPublic?: boolean
  featured?: boolean
  /** Milliseconds. Defaults to now. */
  addedAt?: number
  completedOn?: Day
  copies?: readonly NewCopy[]
  tags?: readonly string[]
}

const checkCopy = (copy: NewCopy) => {
  if (!isFormat(copy.format)) throw invalid('A copy is physical or digital')
  if (!Number.isInteger(copy.platformId)) throw invalid('A copy needs a platform')
  if (copy.acquiredOn !== undefined && !isDay(copy.acquiredOn)) {
    throw invalid('The date a copy was acquired must be a calendar day')
  }
}

/** At most this many platforms wanted for one game: more is not a wish, it is every platform. */
const MAX_WANTED = 20

const checkMine = (input: {
  status?: Status
  rating?: number | null
  completedOn?: Day | null
  idle?: number
  wanted?: readonly number[] | null
}) => {
  if (input.status !== undefined && !isStatus(input.status)) throw invalid('Unknown status')
  if (
    input.wanted != null &&
    (input.wanted.length > MAX_WANTED ||
      !input.wanted.every((id) => Number.isInteger(id) && id > 0))
  ) {
    throw invalid(`A wish names at most ${MAX_WANTED} platforms, by id`)
  }
  if (input.rating !== undefined && input.rating !== null && !isRating(input.rating)) {
    throw invalid('A rating is a whole number from 0 to 100')
  }
  if (input.completedOn !== undefined && input.completedOn !== null && !isDay(input.completedOn)) {
    throw invalid('The completion date must be a calendar day')
  }
  if (input.idle !== undefined && (!Number.isInteger(input.idle) || input.idle < 0)) {
    throw invalid('Idle time is a whole number of minutes')
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
    wanted: input.status === 'wishlist' && input.wanted?.length ? [...new Set(input.wanted)] : null,
    createdAt: now,
    updatedAt: now,
  })
  await tx
    .insert(entryVersions)
    .values({ entryId: id, gameId: input.primaryGameId, userId: libraryId, relation: 'primary' })
  for (const copy of input.copies ?? []) await insertCopy(tx, id, copy, now)
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

/** Stores a record and the names and platforms it uses: our id for it. */
const storeRecord = async (tx: Executor, record: RecordToStore, now: number): Promise<string> => {
  await savePlatforms(tx, record.platforms)
  await saveCompanies(tx, record.data.companies)
  for (const { kind, items } of record.names) await saveVocab(tx, kind, items)
  return saveGame(tx, record.data, {
    lineage: record.lineage,
    ...(record.art ? { art: record.art } : {}),
    now,
  })
}

/** Stores a record and places it, inside a transaction that raises the version after. */
const placeRecord = async (
  tx: Executor,
  libraryId: string,
  record: RecordToStore,
  placement: Placement,
  now: number,
): Promise<Added> => placeGame(tx, libraryId, await storeRecord(tx, record, now), placement, now)

/** A game already stored, placed in the library. */
const placeGame = async (
  tx: Executor,
  libraryId: string,
  gameId: string,
  placement: Placement,
  now: number,
): Promise<Added> => {
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

/** Everything about a game read from Steam that adding it stores (ADR 006). */
export type SteamRecordToStore = {
  data: SteamGameData
  art?: CoverArt
  names: readonly { kind: Exclude<VocabKind, 'company'>; items: readonly IgdbNamed[] }[]
  platforms: readonly Platform[]
}

/** Companies only Steam names take ids from here up, past any IGDB gives for a long time yet. */
const FIRST_LOCAL_COMPANY = 1_000_000_000

/**
 * The ids of companies Steam gave only as names: IGDB's when it names one the
 * same, or new ones, kept beside IGDB's so a filter finds both.
 */
const companyIds = async (tx: Executor, names: readonly string[]): Promise<Map<string, number>> => {
  const slugs = new Map(names.map((name) => [name, toSlug(name) || name.toLowerCase()]))
  if (slugs.size === 0) return new Map()
  const known = await tx
    .select({ id: vocab.id, slug: vocab.slug })
    .from(vocab)
    .where(and(eq(vocab.kind, 'company'), inArray(vocab.slug, [...new Set(slugs.values())])))
  const bySlug = new Map(known.map((row) => [row.slug, row.id]))
  const [top] = await tx
    .select({ id: sql<number | null>`max(${vocab.id})` })
    .from(vocab)
    .where(and(eq(vocab.kind, 'company'), gte(vocab.id, FIRST_LOCAL_COMPANY)))
  let next = (top?.id ?? FIRST_LOCAL_COMPANY - 1) + 1
  const ids = new Map<string, number>()
  for (const [name, slug] of slugs) {
    let id = bySlug.get(slug)
    if (id === undefined) {
      id = next++
      bySlug.set(slug, id)
      await saveCompanies(tx, [{ id, name, slug }])
    }
    ids.set(name, id)
  }
  return ids
}

/**
 * Stores a game read from Steam, unless a moderator already has: every shelf
 * shares that row, and its title stays as they set it. Its address carries its
 * app, so no game IGDB may list one day can ever want the same one.
 */
const storeSteamRecord = async (
  tx: Executor,
  { data, art, names, platforms: on }: SteamRecordToStore,
  now: number,
): Promise<string> => {
  const [held] = await tx
    .select({ id: games.id })
    .from(games)
    .where(eq(games.steamAppId, data.steamAppId))
    .limit(1)
  await savePlatforms(tx, on)
  if (held) return held.id
  for (const { kind, items } of names) await saveVocab(tx, kind, items)
  const { steamAppId, developerNames, publisherNames, ...rest } = data
  const companies = await companyIds(tx, [...new Set([...developerNames, ...publisherNames])])
  const idsOf = (list: readonly string[]) => list.flatMap((name) => companies.get(name) ?? [])
  const slug = [toSlug(data.title), 'steam', steamAppId].filter(Boolean).join('-')
  const id = randomUUID()
  await tx.insert(games).values({
    id,
    steamAppId,
    ...gameColumns(
      {
        ...rest,
        igdbId: null,
        slug,
        developers: idsOf(developerNames),
        publishers: idsOf(publisherNames),
      },
      [],
      now,
    ),
    ...(art ? { colors: art.colors, thumbhash: art.thumbhash } : {}),
  })
  return id
}

/** The game read from Steam this app is, if a moderator has added it. */
export const findSteamGame = async (
  db: Executor,
  appId: string,
): Promise<{ id: string; title: string } | undefined> => {
  const [row] = await db
    .select({ id: games.id, title: games.title })
    .from(games)
    .where(eq(games.steamAppId, appId))
    .limit(1)
  return row
}

/** Stores a game read from Steam and adds it to the library, in one transaction (ADR 006). */
export const addFromSteam = (
  db: Db,
  libraryId: string,
  record: SteamRecordToStore,
  placement: Placement,
  now = Date.now(),
): Promise<Added> => {
  if (placement.kind === 'entry') checkMine(placement.entry)
  return withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const gameId = await storeSteamRecord(tx, record, now)
      const added = await placeGame(tx, libraryId, gameId, placement, now)
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
 * A completed game with no finish date takes the day it was last played on
 * any linked platform (spec 7.3): the owner seldom remembers the day, and the
 * last play is nearer it than the day it was marked. Once set it stays, so a
 * later play moves nothing; a game no platform saw played keeps none. Among
 * `entryIds` only, when given. True when one changed.
 */
const dateFinishes = async (
  tx: Executor,
  libraryId: string,
  entryIds?: readonly string[],
): Promise<boolean> => {
  if (entryIds?.length === 0) return false
  const rows = await tx
    .select({ id: entries.id, last: sql<number | null>`max(${sourceItems.lastPlayedAt})` })
    .from(entries)
    .innerJoin(copies, eq(copies.entryId, entries.id))
    .innerJoin(sourceItems, eq(sourceItems.copyId, copies.id))
    .where(
      and(
        eq(entries.userId, libraryId),
        eq(sourceItems.userId, libraryId),
        eq(entries.status, 'completed'),
        isNull(entries.completedOn),
        ...(entryIds ? [inArray(entries.id, [...entryIds])] : []),
      ),
    )
    .groupBy(entries.id)
  const dated = rows.flatMap((row) =>
    row.last && row.last > 0 ? [{ ...row, last: row.last }] : [],
  )
  for (const row of dated) {
    await tx
      .update(entries)
      .set({ completedOn: dayOf(row.last) })
      .where(eq(entries.id, row.id))
  }
  return dated.length > 0
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
      await dateFinishes(tx, libraryId, [added.entryId])
      await bumpVersion(tx, libraryId)
      return added
    }),
  )
}

/**
 * Brings every copy's hours from a source up to date with what its items
 * last reported, in one transaction that raises the version only when one
 * changed. A day's sync changes a few; the rest cost nothing. Completed games
 * still without a finish date take their last play's (`dateFinishes`).
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
    const dated = await dateFinishes(tx, libraryId)
    if (changed || dated) await bumpVersion(tx, libraryId)
    return changed || dated
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
  /** Only its own account sees it (spec 11.1). */
  private?: boolean
  /** The platforms I want it on; kept only while it is on the wishlist. */
  wanted?: readonly number[] | null
  rating?: number | null
  notes?: string | null
  notesPublic?: boolean
  featured?: boolean
  completedOn?: Day | null
  displayCopyId?: string | null
  addedAt?: number
}

/**
 * What I wanted is let go once a game leaves the wishlist (spec 7.5): its
 * first copy starts on that platform in the editor, which has it in hand.
 */
const letGo = (patch: Pick<EntryPatch, 'status' | 'wanted'>): { wanted?: number[] | null } => {
  if (patch.status !== undefined && patch.status !== 'wishlist') return { wanted: null }
  if (patch.wanted === undefined) return {}
  return { wanted: patch.wanted?.length ? [...new Set(patch.wanted)] : null }
}

/** Whether a change may leave a completed game without its finish date: one for `dateFinishes`. */
const undated = (patch: Pick<EntryPatch, 'status' | 'completedOn'>) =>
  patch.status === 'completed' || patch.completedOn === null

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
    const { wanted: _, private: hidden, ...rest } = patch
    await tx
      .update(entries)
      .set({
        ...rest,
        ...letGo(patch),
        ...(hidden === undefined ? {} : { isPrivate: hidden }),
        ...(notes === undefined ? {} : { notes }),
        updatedAt: now,
      })
      .where(eq(entries.id, entryId))
    if (undated(patch)) await dateFinishes(tx, libraryId, [entryId])
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
  /** `idle`: minutes of what its stores report that sat idle, taken off them (0 keeps them whole). */
  patch: { mine?: EntryPatch; tags?: readonly string[]; idle?: number },
  now = Date.now(),
) => {
  if (patch.mine) checkMine(patch.mine)
  if (patch.idle !== undefined) checkMine({ idle: patch.idle })
  return db.transaction(async (tx) => {
    await requireEntry(tx, libraryId, entryId)
    if (patch.mine && Object.keys(patch.mine).length > 0) {
      const notes = patch.mine.notes === undefined ? undefined : patch.mine.notes?.trim() || null
      const { wanted: _, private: hidden, ...rest } = patch.mine
      await tx
        .update(entries)
        .set({
          ...rest,
          ...letGo(patch.mine),
          ...(hidden === undefined ? {} : { isPrivate: hidden }),
          ...(notes === undefined ? {} : { notes }),
        })
        .where(eq(entries.id, entryId))
      if (undated(patch.mine)) await dateFinishes(tx, libraryId, [entryId])
    }
    if (patch.tags) await writeTags(tx, libraryId, entryId, patch.tags)
    await tx
      .update(entries)
      .set({ updatedAt: now, ...(patch.idle === undefined ? {} : { idleMinutes: patch.idle }) })
      .where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
  })
}

/**
 * Archives a game, or brings it back (spec 7.4). Archived, it is off the
 * shelf and out of every answer, to me as to anyone, and kept whole: its
 * status, rating, notes, tags, dates, copies and hours. A sync still feeds
 * its copies and joins new ones to it; it stays archived.
 */
export const setArchived = (
  db: Db,
  libraryId: string,
  entryId: string,
  archived: boolean,
  now = Date.now(),
) =>
  db.transaction(async (tx) => {
    const entry = await requireEntry(tx, libraryId, entryId)
    if ((entry.archivedAt !== null) === archived) return
    await tx
      .update(entries)
      .set({ archivedAt: archived ? now : null, updatedAt: now })
      .where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
  })

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
      await tx
        .update(entries)
        .set({ status, ...letGo({ status }), updatedAt: now })
        .where(own)
      if (status === 'completed') await dateFinishes(tx, libraryId, some)
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

/**
 * One of an entry's versions made a game of its own (spec 7.6), in one
 * transaction. The new entry is unsorted, private if the entry is, and added
 * when it was; nothing else of mine goes with it. The copies that name the
 * version go. Then every store item feeding either entry ends on the one its
 * record is: the version's items on the new entry, the rest on the old, each
 * on its entry's copy on the same platform and format, made where there is
 * none. A copy both fed becomes two, and each copy touched gets its hours
 * again. Answers the new entry's id.
 */
export const separateVersion = (
  db: Db,
  libraryId: string,
  entryId: string,
  gameId: string,
  now = Date.now(),
): Promise<string> =>
  db.transaction(async (tx) => {
    const entry = await requireEntry(tx, libraryId, entryId)
    if (entry.archivedAt !== null) throw notFound('That entry')
    const versions = await tx
      .select({
        gameId: entryVersions.gameId,
        relation: entryVersions.relation,
        igdbId: games.igdbId,
      })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.entryId, entryId))
    const version = versions.find((each) => each.gameId === gameId)
    if (!version) throw notFound('That version')
    if (version.relation === 'primary') throw invalid('The main version is the game itself')

    const id = randomUUID()
    await tx.insert(entries).values({
      id,
      userId: libraryId,
      status: 'unsorted',
      isPrivate: entry.isPrivate,
      addedAt: entry.addedAt,
      createdAt: now,
      updatedAt: now,
    })
    await tx
      .update(entryVersions)
      .set({ entryId: id, relation: 'primary' })
      .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.gameId, gameId)))

    const named = (
      await tx
        .select({ id: copies.id })
        .from(copies)
        .where(and(eq(copies.entryId, entryId), eq(copies.gameId, gameId)))
    ).map((copy) => copy.id)
    if (named.length > 0) {
      // There it is the entry's own record, which a copy does not need to name.
      await tx.update(copies).set({ entryId: id, gameId: null }).where(inArray(copies.id, named))
      await tx.update(playTime).set({ entryId: id }).where(inArray(playTime.copyId, named))
      if (entry.displayCopyId && named.includes(entry.displayCopyId)) {
        await tx.update(entries).set({ displayCopyId: null }).where(eq(entries.id, entryId))
      }
    }

    const owned = await tx
      .select({
        id: copies.id,
        entryId: copies.entryId,
        platformId: copies.platformId,
        format: copies.format,
      })
      .from(copies)
      .where(inArray(copies.entryId, [entryId, id]))
    const fed =
      owned.length === 0
        ? []
        : await tx
            .select({
              id: sourceItems.id,
              source: sourceItems.source,
              igdbId: sourceItems.igdbId,
              copyId: sourceItems.copyId,
            })
            .from(sourceItems)
            .where(
              and(
                eq(sourceItems.userId, libraryId),
                inArray(
                  sourceItems.copyId,
                  owned.map((copy) => copy.id),
                ),
              ),
            )
    const theirs = (igdbId: number | null) =>
      version.igdbId !== null && igdbId === version.igdbId ? id : entryId
    // A copy made on the old entry names the version it is, when that is not the main one.
    const versionOf = (igdbId: number | null) =>
      versions.find((each) => each.relation !== 'primary' && each.igdbId === igdbId)?.gameId
    const touched = new Map<string, string>()
    const sources = new Set<SyncSource>()
    for (const item of fed) {
      const from = owned.find((copy) => copy.id === item.copyId)!
      const to = theirs(item.igdbId)
      if (from.entryId === to) continue
      let there = owned.find(
        (copy) =>
          copy.entryId === to && copy.platformId === from.platformId && copy.format === from.format,
      )
      if (!there) {
        const gameIdThere = to === entryId ? versionOf(item.igdbId) : undefined
        const made = await insertCopy(
          tx,
          to,
          {
            platformId: from.platformId,
            format: from.format,
            ...(gameIdThere ? { gameId: gameIdThere } : {}),
          },
          now,
        )
        there = { id: made, entryId: to, platformId: from.platformId, format: from.format }
        owned.push(there)
      }
      await tx.update(sourceItems).set({ copyId: there.id }).where(eq(sourceItems.id, item.id))
      touched.set(from.id, from.entryId)
      touched.set(there.id, there.entryId)
      sources.add(item.source)
    }
    for (const source of sources) {
      const sums = await sourceMinutes(tx, libraryId, source, [...touched.keys()])
      // A copy left with none of this source's items has none of its hours.
      const emptied = [...touched]
        .filter(([copyId]) => !sums.some((row) => row.copyId === copyId))
        .map(([copyId, owner]) => ({ copyId, entryId: owner, minutes: 0 }))
      await writeSourceMinutes(tx, libraryId, source, [...sums, ...emptied], now)
    }

    await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
    await bumpVersion(tx, libraryId)
    return id
  })

/**
 * Where a game taken for the wrong one goes once I say which it is: the
 * entry already on the shelf that has that game, as it or as a version of
 * it. Absent, the game stays an entry of its own.
 */
export type RematchInto = { entryId: string; version?: Exclude<Relation, 'primary'> }

/**
 * A game a sync took for the wrong one, made the game I say it is, in one
 * transaction (spec 4.5, "Not this game"). Everything I set and own stays:
 * status, rating, notes, tags, copies and their hours. When the right game
 * is on the shelf already, under any version, this one folds into it as the
 * sync would have folded it: its copies join (one already there on the same
 * platform and format is fed, not doubled), its hours with them, and the
 * entry goes; what the other lacks of mine (a status, a rating, notes) it
 * takes. Either way the sync's items now name the right record.
 */
export const rematchEntry = (
  db: Db,
  libraryId: string,
  entryId: string,
  record: RecordToStore,
  into: RematchInto | undefined,
  now = Date.now(),
): Promise<{ entryId: string; merged: boolean }> =>
  withConflict('That game is already in the library', () =>
    db.transaction(async (tx) => {
      const wrong = await requireEntry(tx, libraryId, entryId)
      if (into?.entryId === entryId) throw invalid('A game cannot fold into itself')
      const gameId = await storeRecord(tx, record, now)
      const versions = await tx
        .select()
        .from(entryVersions)
        .where(eq(entryVersions.entryId, entryId))
      const primary = versions.find((version) => version.relation === 'primary')
      if (!into && primary?.gameId === gameId) return { entryId, merged: false }
      const owned = await tx.select().from(copies).where(eq(copies.entryId, entryId))
      if (owned.length > 0) {
        await tx
          .update(sourceItems)
          .set({ igdbId: record.data.igdbId, resolvedBy: 'owner' })
          .where(
            and(
              eq(sourceItems.userId, libraryId),
              inArray(
                sourceItems.copyId,
                owned.map((copy) => copy.id),
              ),
            ),
          )
      }

      if (!into) {
        // The record it was taken for steps out; the one I said it is takes its place.
        await tx
          .delete(entryVersions)
          .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.relation, 'primary')))
        if (versions.some((version) => version.gameId === gameId)) {
          await tx
            .update(entryVersions)
            .set({ relation: 'primary' })
            .where(and(eq(entryVersions.entryId, entryId), eq(entryVersions.gameId, gameId)))
        } else {
          await tx
            .insert(entryVersions)
            .values({ entryId, gameId, userId: libraryId, relation: 'primary' })
        }
        await tx.update(entries).set({ updatedAt: now }).where(eq(entries.id, entryId))
        if (primary) await dropUnusedGames(tx, [primary.gameId])
        await bumpVersion(tx, libraryId)
        return { entryId, merged: false }
      }

      const target = await requireEntry(tx, libraryId, into.entryId)
      if (into.version) {
        await tx
          .insert(entryVersions)
          .values({ entryId: target.id, gameId, userId: libraryId, relation: into.version })
      }
      const [exact] = await tx
        .select({ relation: entryVersions.relation })
        .from(entryVersions)
        .where(and(eq(entryVersions.entryId, target.id), eq(entryVersions.gameId, gameId)))
      // A copy of a version names it; a copy of the entry's own record does not need to.
      const copyGameId = exact && exact.relation !== 'primary' ? gameId : null
      const theirs = await tx.select().from(copies).where(eq(copies.entryId, target.id))
      const fed: string[] = []
      for (const copy of owned) {
        const same = theirs.find(
          (each) => each.platformId === copy.platformId && each.format === copy.format,
        )
        if (same) {
          await tx
            .update(sourceItems)
            .set({ copyId: same.id })
            .where(eq(sourceItems.copyId, copy.id))
          await tx.delete(playTime).where(eq(playTime.copyId, copy.id))
          await tx.delete(copies).where(eq(copies.id, copy.id))
          fed.push(same.id)
        } else {
          await tx
            .update(copies)
            .set({ entryId: target.id, gameId: copyGameId })
            .where(eq(copies.id, copy.id))
          await tx.update(playTime).set({ entryId: target.id }).where(eq(playTime.copyId, copy.id))
        }
      }
      // A copy fed by both games' items has their hours together.
      for (const source of fed.length > 0 ? syncSources : []) {
        await writeSourceMinutes(
          tx,
          libraryId,
          source,
          await sourceMinutes(tx, libraryId, source, fed),
          now,
        )
      }
      const typed = (id: string) =>
        tx
          .select({ id: playTime.id })
          .from(playTime)
          .where(
            and(eq(playTime.entryId, id), eq(playTime.source, 'manual'), isNull(playTime.copyId)),
          )
      const [mine] = await typed(entryId)
      const [kept] = await typed(target.id)
      if (mine && !kept) {
        await tx.update(playTime).set({ entryId: target.id }).where(eq(playTime.id, mine.id))
      }
      await tx
        .update(playSessions)
        .set({ entryId: target.id })
        .where(eq(playSessions.entryId, entryId))
      const worn = await tx
        .select({ tagId: entryTags.tagId })
        .from(entryTags)
        .where(eq(entryTags.entryId, entryId))
      if (worn.length > 0) {
        await tx
          .insert(entryTags)
          .values(worn.map((tag) => ({ entryId: target.id, tagId: tag.tagId })))
          .onConflictDoNothing()
      }
      await tx
        .update(entries)
        .set({
          ...(target.status === 'unsorted' ? { status: wrong.status } : {}),
          ...(target.rating === null ? { rating: wrong.rating } : {}),
          ...(target.notes === null ? { notes: wrong.notes, notesPublic: wrong.notesPublic } : {}),
          // Its copies brought their hours, so the time they sat idle comes too.
          ...(wrong.idleMinutes === null
            ? {}
            : { idleMinutes: (target.idleMinutes ?? 0) + wrong.idleMinutes }),
          updatedAt: now,
        })
        .where(eq(entries.id, target.id))
      await tx.delete(entries).where(eq(entries.id, entryId))
      await dropUnusedGames(
        tx,
        versions.map((version) => version.gameId),
      )
      await bumpVersion(tx, libraryId)
      return { entryId: target.id, merged: true }
    }),
  )

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

/** A session as Shelf for Windows sends it, once its game is known. */
export type PlaySession = {
  id: string
  entryId: string
  startedAt: number
  endedAt: number
  seconds: number
}

/**
 * Keeps what Shelf for Windows counted (ADR 005, section 12), and answers with the ids it kept. A
 * session sent again changes nothing but what it has grown by, as the app sends again whatever
 * it never heard back about. A game not in this library is left out, and the app holds on to it.
 */
export const recordPlaySessions = (db: Db, libraryId: string, sessions: readonly PlaySession[]) =>
  db.transaction(async (tx) => {
    if (sessions.length === 0) return []
    const named = [...new Set(sessions.map((session) => session.entryId))]
    const mine = new Set(
      (
        await tx
          .select({ id: entries.id })
          .from(entries)
          .where(and(eq(entries.userId, libraryId), inArray(entries.id, named)))
      ).map((row) => row.id),
    )
    const kept = sessions.filter((session) => mine.has(session.entryId))
    if (kept.length === 0) return []
    await tx
      .insert(playSessions)
      .values([...kept])
      .onConflictDoUpdate({
        target: playSessions.id,
        set: {
          seconds: sql`max(${playSessions.seconds}, excluded.seconds)`,
          endedAt: sql`max(${playSessions.endedAt}, excluded.ended_at)`,
        },
        // An id another library's session has is not this one's to change.
        where: sql`${playSessions.entryId} = excluded.entry_id`,
      })
    await bumpVersion(tx, libraryId)
    return kept.map((session) => session.id)
  })

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
  await tx.delete(playSessions).where(eq(playSessions.entryId, entryId))
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
  /** What the app counted of it. Absent in what was removed before it counted. */
  playSessions?: (typeof playSessions.$inferSelect)[]
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
      playSessions: await tx.select().from(playSessions).where(eq(playSessions.entryId, entryId)),
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
          .where(
            game.igdbId !== null
              ? eq(games.igdbId, game.igdbId)
              : game.steamAppId !== null
                ? eq(games.steamAppId, game.steamAppId)
                : eq(games.id, game.id),
          )
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
      if (snapshot.playSessions?.length) {
        await tx.insert(playSessions).values(snapshot.playSessions)
      }
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
