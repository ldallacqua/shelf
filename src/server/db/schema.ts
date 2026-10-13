import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

import type { Palette } from '@/domain/color/palette'
import type {
  GameArtwork,
  GameImage,
  Length,
  LineageStep,
  Release,
  StoreId,
} from '@/domain/igdb/game'
import type { VocabKind } from '@/domain/igdb/schema'
import {
  formats,
  kinds,
  playTimeSources,
  relations,
  statuses,
  type Day,
  type Format,
  type Kind,
  type PlayTimeSource,
  type Relation,
  type Status,
} from '@/domain/library/values'
import {
  caseShapes,
  families,
  plastics,
  type CaseShape,
  type Family,
  type Plastic,
} from '@/domain/platforms/platforms'

/**
 * The database, as ADR 001 decides it and section 7 of the architecture
 * stores it. Column names are snake_case in SQL; Drizzle maps them from the
 * camelCase used here (`casing: 'snake_case'`).
 *
 * Conventions: ids are text made by the app; moments are whole milliseconds
 * since 1970; days without a time are `YYYY-MM-DD`; enumerations are text
 * with a CHECK built from the same list the code uses.
 */

const oneOf = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '))

const ids = () =>
  text({ mode: 'json' })
    .$type<number[]>()
    .notNull()
    .default(sql`'[]'`)

/** The local copy of IGDB records. The library never waits on IGDB. */
export const games = sqliteTable(
  'games',
  {
    id: text().primaryKey(),
    /** Null for a game typed in by hand, which IGDB does not know. */
    igdbId: integer(),
    slug: text().notNull(),
    title: text().notNull(),
    kind: text().$type<Kind>().notNull(),
    versionTitle: text(),
    releasedOn: text().$type<Day>(),
    year: integer(),
    cover: text({ mode: 'json' }).$type<GameImage>(),
    /** Three colors read from the cover: accent, second, base. */
    colors: text({ mode: 'json' }).$type<Palette>(),
    /** A ThumbHash of the cover, base64. */
    thumbhash: text(),
    summary: text(),
    storyline: text(),
    igdbRating: integer(),
    igdbRatingCount: integer().notNull().default(0),
    length: text({ mode: 'json' }).$type<Length>(),
    genres: ids(),
    themes: ids(),
    modes: ids(),
    perspectives: ids(),
    platforms: ids(),
    franchises: ids(),
    series: ids(),
    keywords: ids(),
    developers: ids(),
    publishers: ids(),
    screenshots: text({ mode: 'json' })
      .$type<GameImage[]>()
      .notNull()
      .default(sql`'[]'`),
    artworks: text({ mode: 'json' })
      .$type<GameArtwork[]>()
      .notNull()
      .default(sql`'[]'`),
    releases: text({ mode: 'json' })
      .$type<Release[]>()
      .notNull()
      .default(sql`'[]'`),
    storeIds: text({ mode: 'json' })
      .$type<StoreId[]>()
      .notNull()
      .default(sql`'[]'`),
    /** The chain of records above this one in its family, nearest first. */
    lineage: text({ mode: 'json' })
      .$type<LineageStep[]>()
      .notNull()
      .default(sql`'[]'`),
    igdbUrl: text(),
    igdbUpdatedAt: integer(),
    /** When Shelf last stored this record. */
    fetchedAt: integer().notNull(),
    /** When Shelf last asked IGDB whether it changed. The daily refresh takes the oldest. */
    checkedAt: integer().notNull(),
  },
  (table) => [
    uniqueIndex('games_igdb_id').on(table.igdbId),
    uniqueIndex('games_slug').on(table.slug),
    index('games_checked_at').on(table.checkedAt),
    check('games_kind', sql`${table.kind} in (${oneOf(kinds)})`),
  ],
)

/** The game as I think of it. Everything true of it whatever the platform. */
export const entries = sqliteTable(
  'entries',
  {
    id: text().primaryKey(),
    status: text().$type<Status>().notNull(),
    /** Mine, 0 to 100. */
    rating: integer(),
    notes: text(),
    notesPublic: integer({ mode: 'boolean' }).notNull().default(false),
    featured: integer({ mode: 'boolean' }).notNull().default(false),
    /** The copy shown when the game stands once. Null means the first added. */
    displayCopyId: text(),
    addedAt: integer().notNull(),
    completedOn: text().$type<Day>(),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [
    check('entries_status', sql`${table.status} in (${oneOf(statuses)})`),
    check('entries_rating', sql`${table.rating} is null or (${table.rating} between 0 and 100)`),
  ],
)

/**
 * Which IGDB records an entry folds together. A record belongs to one entry
 * only: that is what lets search say "in library" for any version.
 */
export const entryVersions = sqliteTable(
  'entry_versions',
  {
    entryId: text()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    gameId: text()
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    relation: text().$type<Relation>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.gameId] }),
    uniqueIndex('entry_versions_game').on(table.gameId),
    uniqueIndex('entry_versions_one_primary')
      .on(table.entryId)
      .where(sql`${table.relation} = 'primary'`),
    check('entry_versions_relation', sql`${table.relation} in (${oneOf(relations)})`),
  ],
)

/** What Shelf knows about a platform: IGDB's name plus our family and case. */
export const platforms = sqliteTable(
  'platforms',
  {
    igdbId: integer().primaryKey(),
    key: text().notNull(),
    name: text().notNull(),
    short: text().notNull(),
    family: text().$type<Family>().notNull(),
    generation: integer(),
    shape: text().$type<CaseShape>().notNull(),
    plastic: text().$type<Plastic>().notNull(),
  },
  (table) => [
    uniqueIndex('platforms_key').on(table.key),
    check('platforms_family', sql`${table.family} in (${oneOf(families)})`),
    check('platforms_shape', sql`${table.shape} in (${oneOf(caseShapes)})`),
    check('platforms_plastic', sql`${table.plastic} in (${oneOf(plastics)})`),
  ],
)

/** One thing I own: a platform and a format. Nothing else records ownership. */
export const copies = sqliteTable(
  'copies',
  {
    id: text().primaryKey(),
    entryId: text()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    platformId: integer()
      .notNull()
      .references(() => platforms.igdbId),
    format: text().$type<Format>().notNull(),
    /** The exact version this copy is, when it is not the primary. */
    gameId: text().references(() => games.id, { onDelete: 'set null' }),
    acquiredOn: text().$type<Day>(),
    createdAt: integer().notNull(),
  },
  (table) => [
    uniqueIndex('copies_one_per_platform_and_format').on(
      table.entryId,
      table.platformId,
      table.format,
    ),
    check('copies_format', sql`${table.format} in (${oneOf(formats)})`),
  ],
)

/** Minutes played, one row per source, so a sync never overwrites what I typed. */
export const playTime = sqliteTable(
  'play_time',
  {
    id: text().primaryKey(),
    entryId: text()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    copyId: text().references(() => copies.id, { onDelete: 'cascade' }),
    source: text().$type<PlayTimeSource>().notNull(),
    minutes: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [
    index('play_time_entry').on(table.entryId),
    check('play_time_source', sql`${table.source} in (${oneOf(playTimeSources)})`),
    check('play_time_minutes', sql`${table.minutes} >= 0`),
  ],
)

export const tags = sqliteTable(
  'tags',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (table) => [uniqueIndex('tags_slug').on(table.slug)],
)

export const entryTags = sqliteTable(
  'entry_tags',
  {
    entryId: text()
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: text()
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.entryId, table.tagId] })],
)

/** Names for the ids IGDB keeps on a game: genres, themes, companies and so on. */
export const vocab = sqliteTable(
  'vocab',
  {
    kind: text().$type<VocabKind>().notNull(),
    id: integer().notNull(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.id] })],
)

/** Saved smart shelves: a named filter with a sort and a grouping. */
export const shelves = sqliteTable(
  'shelves',
  {
    id: text().primaryKey(),
    slug: text().notNull(),
    name: text().notNull(),
    query: text().notNull().default(''),
    sort: text().notNull().default('title'),
    group: text().notNull().default('none'),
    position: integer().notNull().default(0),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [uniqueIndex('shelves_slug').on(table.slug)],
)

/** One row: the counter raised by every write. The library file's address contains it. */
export const libraryMeta = sqliteTable(
  'library_meta',
  {
    id: integer().primaryKey(),
    version: integer().notNull().default(0),
  },
  (table) => [check('library_meta_one_row', sql`${table.id} = 1`)],
)

/** One row: the current Twitch token, so a cold server does not ask for a new one. */
export const igdbToken = sqliteTable(
  'igdb_token',
  {
    id: integer().primaryKey(),
    accessToken: text().notNull(),
    expiresAt: integer().notNull(),
  },
  (table) => [check('igdb_token_one_row', sql`${table.id} = 1`)],
)
