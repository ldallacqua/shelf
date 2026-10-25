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
  syncSources,
  type Day,
  type Format,
  type Kind,
  type PlayTimeSource,
  type Relation,
  type Status,
  type SyncSource,
} from '@/domain/library/values'
import {
  decisions,
  itemFormats,
  resolutions,
  storeKinds,
  type Decision,
  type ItemFormat,
  type Resolution,
  type StoreKind,
} from '@/domain/sync/items'
import { linkProblems, type LinkProblem } from '@/domain/sync/link'
import { evidences, type Evidence } from '@/domain/sync/sources'
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

/**
 * Whose library a row is in: the account's id (ADR 004). Nullable only until
 * every row has one; the code always sets it, and a later release makes it
 * required.
 */
const libraryOf = () => text().references(() => users.id, { onDelete: 'cascade' })

/** The game as I think of it. Everything true of it whatever the platform. */
export const entries = sqliteTable(
  'entries',
  {
    id: text().primaryKey(),
    userId: libraryOf(),
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
    /** IGDB platform ids I want it on, while it is on the wishlist (spec 7.5). Null otherwise. */
    wanted: text({ mode: 'json' }).$type<number[]>(),
    /** When I archived it (spec 7.4): off the shelf and out of every answer, kept whole. */
    archivedAt: integer(),
    /** Only its own account sees it (spec 11.1): never in a public file or answer. */
    isPrivate: integer({ mode: 'boolean' }).notNull().default(false),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [
    index('entries_user').on(table.userId),
    check('entries_status', sql`${table.status} in (${oneOf(statuses)})`),
    check('entries_rating', sql`${table.rating} is null or (${table.rating} between 0 and 100)`),
  ],
)

/**
 * Which IGDB records an entry folds together. A record belongs to one entry
 * of a library: that is what lets search say "in library" for any version.
 * Another library may have it too. The library is the entry's, kept here as
 * well so the database can hold that rule.
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
    userId: libraryOf(),
    relation: text().$type<Relation>().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.entryId, table.gameId] }),
    uniqueIndex('entry_versions_user_game').on(table.userId, table.gameId),
    index('entry_versions_game').on(table.gameId),
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

/** A library's own words for its games. Two libraries may each have a "replay someday". */
export const tags = sqliteTable(
  'tags',
  {
    id: text().primaryKey(),
    userId: libraryOf(),
    name: text().notNull(),
    slug: text().notNull(),
  },
  (table) => [uniqueIndex('tags_user_slug').on(table.userId, table.slug)],
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
    userId: libraryOf(),
    slug: text().notNull(),
    name: text().notNull(),
    query: text().notNull().default(''),
    sort: text().notNull().default('title'),
    group: text().notNull().default('none'),
    position: integer().notNull().default(0),
    createdAt: integer().notNull(),
    updatedAt: integer().notNull(),
  },
  (table) => [uniqueIndex('shelves_user_slug').on(table.userId, table.slug)],
)

/**
 * A game just removed, kept whole for a day so Undo can put it back exactly
 * as it was (spec 7.3): the entry, its versions, the IGDB records only it
 * used, its copies, playtime and tags.
 */
export const removedEntries = sqliteTable(
  'removed_entries',
  {
    id: text().primaryKey(),
    userId: libraryOf(),
    entryId: text().notNull(),
    title: text().notNull(),
    snapshot: text({ mode: 'json' }).$type<unknown>().notNull(),
    removedAt: integer().notNull(),
  },
  (table) => [
    index('removed_entries_at').on(table.removedAt),
    index('removed_entries_user').on(table.userId),
  ],
)

/**
 * One row per account: its library's version, raised by every write to it,
 * and the key its files are addressed by. The key changes when the library
 * goes private, so a public file's address leads nowhere new (ADR 004).
 */
export const libraries = sqliteTable('libraries', {
  userId: text()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  version: integer().notNull().default(0),
  key: text().notNull().unique(),
  createdAt: integer().notNull(),
})

/**
 * An account's link to a store or console it syncs from (ADR 003): its
 * account there, and how the last sync went. One per source.
 */
export const platformLinks = sqliteTable(
  'platform_links',
  {
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text().$type<SyncSource>().notNull(),
    /** Its account's id there: for Steam, the SteamID64 that Steam's sign-in vouched for. Not a secret. */
    externalId: text().notNull(),
    /** Its name there, as last read, for the page. */
    name: text(),
    /** Synced again once a day, with the daily refresh. */
    daily: integer({ mode: 'boolean' }).notNull().default(true),
    linkedAt: integer().notNull(),
    /** When the source last answered with its list. */
    readAt: integer(),
    /** When a sync last left nothing to add. */
    syncedAt: integer(),
    /** Why the last read failed, in words the page has a sentence for. Null when it worked. */
    problem: text().$type<LinkProblem>(),
    /**
     * What the source's sign-in gave Shelf to read it with, sealed with this
     * server's key (`server/sync/sealed.ts`): Nintendo's session token. Null
     * for a source read with Shelf's own key, as Steam is.
     */
    secret: text(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.source] }),
    index('platform_links_synced').on(table.syncedAt),
    check('platform_links_source', sql`${table.source} in (${oneOf(syncSources)})`),
    check(
      'platform_links_problem',
      sql`${table.problem} is null or ${table.problem} in (${oneOf(linkProblems)})`,
    ),
  ],
)

/**
 * The sync's memory (ADR 003, decision 3): each game a source reported to
 * an account, the IGDB record it was matched to, and what was decided
 * about it. An item can be decided before it has a copy, or decided as "not
 * a game" and never have one.
 */
export const sourceItems = sqliteTable(
  'source_items',
  {
    id: text().primaryKey(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    source: text().$type<SyncSource>().notNull(),
    /** The source's own id: a Steam app id. */
    storeId: text().notNull(),
    /** As the source gave them. */
    title: text().notNull(),
    platformId: integer(),
    year: integer(),
    evidence: text().$type<Evidence>().notNull(),
    minutes: integer().notNull().default(0),
    lastPlayedAt: integer(),
    firstSeenAt: integer().notNull(),
    /** When the source last listed it. Older than the link's last read: no longer listed. */
    lastSeenAt: integer().notNull(),
    /** The IGDB record it was matched to. Its `games` row exists once it is on the shelf. */
    igdbId: integer(),
    resolvedBy: text().$type<Resolution>(),
    /** When the title rung last found nothing for it, so a daily sync does not ask IGDB again every day. */
    titleTriedAt: integer(),
    decision: text().$type<Decision>().notNull().default('pending'),
    /** A played game's answer: how I own it. */
    format: text().$type<ItemFormat>(),
    /** The copy it feeds. Cleared, with the decision `removed`, when I take that copy off my shelf. */
    copyId: text().references(() => copies.id, { onDelete: 'set null' }),
    decidedAt: integer(),
    /** What the store says it is (`storeKinds`), asked once. Null until then. */
    kind: text().$type<StoreKind>(),
    /** A part's game, by the store's own id: the ladder matches that one. */
    parentStoreId: text(),
  },
  (table) => [
    uniqueIndex('source_items_user_store').on(table.userId, table.source, table.storeId),
    index('source_items_copy').on(table.copyId),
    check('source_items_source', sql`${table.source} in (${oneOf(syncSources)})`),
    check('source_items_evidence', sql`${table.evidence} in (${oneOf(evidences)})`),
    check('source_items_decision', sql`${table.decision} in (${oneOf(decisions)})`),
    check(
      'source_items_resolved_by',
      sql`${table.resolvedBy} is null or ${table.resolvedBy} in (${oneOf(resolutions)})`,
    ),
    check(
      'source_items_format',
      sql`${table.format} is null or ${table.format} in (${oneOf(itemFormats)})`,
    ),
    check('source_items_minutes', sql`${table.minutes} >= 0`),
    check(
      'source_items_kind',
      sql`${table.kind} is null or ${table.kind} in (${oneOf(storeKinds)})`,
    ),
  ],
)

/**
 * Before accounts: the one library's counter. Read once, by the step that
 * gave that library to its account; dropped in a later release.
 */
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

/*
 * Accounts and sign-in (architecture, section 9). Better Auth's own tables,
 * under the names its Drizzle adapter is given in `server/auth/auth.ts`.
 */

/** A moment as Better Auth hands it over, a Date, stored as milliseconds like every other moment here. */
const moment = () => integer({ mode: 'timestamp_ms' })

export const users = sqliteTable('users', {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer({ mode: 'boolean' }).notNull().default(false),
  image: text(),
  createdAt: moment().notNull(),
  updatedAt: moment().notNull(),
  /** The handle in the shelf's address, `/u/{username}`. Lowercase. Better Auth's username plugin. */
  username: text().unique(),
  /** Whether anyone may see the shelf, or only its owner. The owner chooses. */
  shelfPublic: integer({ mode: 'boolean' }).notNull().default(true),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text().primaryKey(),
    expiresAt: moment().notNull(),
    token: text().notNull().unique(),
    createdAt: moment().notNull(),
    updatedAt: moment().notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [index('sessions_user').on(table.userId)],
)

/** A sign-in method for a user: here, always an email address and the password's hash. */
export const accounts = sqliteTable(
  'accounts',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: moment(),
    refreshTokenExpiresAt: moment(),
    scope: text(),
    password: text(),
    createdAt: moment().notNull(),
    updatedAt: moment().notNull(),
  },
  (table) => [index('accounts_user').on(table.userId)],
)

/** Short-lived values a sign-in needs, such as an assistant's request while I sign in. */
export const verifications = sqliteTable(
  'verifications',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: moment().notNull(),
    createdAt: moment().notNull(),
    updatedAt: moment().notNull(),
  },
  (table) => [index('verifications_identifier').on(table.identifier)],
)

/**
 * Sign-in attempts, counted per address and path, so guessing the password
 * is slow. In the database: a function's memory is gone between requests.
 */
export const rateLimits = sqliteTable('rate_limits', {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  /** Milliseconds, as Better Auth counts them. */
  lastRequest: integer().notNull(),
})

/*
 * Assistants signing in as me, for the owner's MCP endpoint (architecture,
 * section 16): the tables of Better Auth's OAuth provider and of its JWT
 * plugin, which signs the access tokens. Their shape is Better Auth's, as its
 * own Drizzle generator writes it; lists and objects are JSON text. Each
 * holds a row per assistant I let in, or per token it was given.
 */

/** A list or object Better Auth stores, as JSON text. */
const json = <T>() => text({ mode: 'json' }).$type<T>()

/** The keys access tokens are signed with; the public half is at /api/auth/jwks. */
export const jwks = sqliteTable('jwks', {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: moment().notNull(),
  expiresAt: moment(),
  alg: text(),
  crv: text(),
})

/** An assistant: here, always one known by its Client ID Metadata Document's address. */
export const oauthClients = sqliteTable(
  'oauth_clients',
  {
    id: text().primaryKey(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: integer({ mode: 'boolean' }).default(false),
    skipConsent: integer({ mode: 'boolean' }),
    enableEndSession: integer({ mode: 'boolean' }),
    subjectType: text(),
    scopes: json<string[]>(),
    clientCredentialsScopes: json<string[]>().default([]),
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: moment(),
    updatedAt: moment(),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: json<string[]>(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: json<string[]>().notNull(),
    postLogoutRedirectUris: json<string[]>(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: integer({ mode: 'boolean' }),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: json<string[]>(),
    responseTypes: json<string[]>(),
    requirePKCE: integer({ mode: 'boolean' }),
    dpopBoundAccessTokens: integer({ mode: 'boolean' }).default(false),
    referenceId: text(),
    metadata: json<unknown>(),
  },
  (table) => [index('oauth_clients_user').on(table.userId)],
)

/** What tokens are issued for: the owner's MCP endpoint. */
export const oauthResources = sqliteTable('oauth_resources', {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: json<string[]>(),
  customClaims: json<unknown>(),
  dpopBoundAccessTokensRequired: integer({ mode: 'boolean' }).default(false),
  disabled: integer({ mode: 'boolean' }).default(false),
  createdAt: moment(),
  updatedAt: moment(),
  policyVersion: integer().default(1),
  metadata: json<unknown>(),
})

export const oauthClientResources = sqliteTable(
  'oauth_client_resources',
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    resourceId: text()
      .notNull()
      .references(() => oauthResources.identifier, { onDelete: 'cascade' }),
    metadata: json<unknown>(),
    createdAt: moment(),
  },
  (table) => [
    uniqueIndex('oauth_client_resources_pair').on(table.clientId, table.resourceId),
    index('oauth_client_resources_resource').on(table.resourceId),
  ],
)

export const oauthRefreshTokens = sqliteTable(
  'oauth_refresh_tokens',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text().references(() => sessions.id, { onDelete: 'set null' }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: json<string[]>(),
    requestedUserInfoClaims: json<string[]>(),
    expiresAt: moment(),
    createdAt: moment(),
    revoked: moment(),
    rotatedAt: moment(),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: moment(),
    authTime: moment(),
    confirmation: json<unknown>(),
    scopes: json<string[]>().notNull(),
  },
  (table) => [
    index('oauth_refresh_tokens_client').on(table.clientId),
    index('oauth_refresh_tokens_session').on(table.sessionId),
    index('oauth_refresh_tokens_user').on(table.userId),
    index('oauth_refresh_tokens_code').on(table.authorizationCodeId),
  ],
)

export const oauthAccessTokens = sqliteTable(
  'oauth_access_tokens',
  {
    id: text().primaryKey(),
    token: text().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    sessionId: text().references(() => sessions.id, { onDelete: 'set null' }),
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: json<string[]>(),
    requestedUserInfoClaims: json<string[]>(),
    refreshId: text().references(() => oauthRefreshTokens.id, { onDelete: 'cascade' }),
    expiresAt: moment(),
    createdAt: moment(),
    revoked: moment(),
    confirmation: json<unknown>(),
    scopes: json<string[]>().notNull(),
  },
  (table) => [
    index('oauth_access_tokens_client').on(table.clientId),
    index('oauth_access_tokens_session').on(table.sessionId),
    index('oauth_access_tokens_user').on(table.userId),
    index('oauth_access_tokens_code').on(table.authorizationCodeId),
    index('oauth_access_tokens_refresh').on(table.refreshId),
  ],
)

/** My yes to an assistant, so it is asked once. */
export const oauthConsents = sqliteTable(
  'oauth_consents',
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: 'cascade' }),
    userId: text().references(() => users.id, { onDelete: 'cascade' }),
    referenceId: text(),
    resources: json<string[]>(),
    requestedUserInfoClaims: json<string[]>(),
    scopes: json<string[]>().notNull(),
    createdAt: moment(),
    updatedAt: moment(),
  },
  (table) => [
    index('oauth_consents_client').on(table.clientId),
    index('oauth_consents_user').on(table.userId),
  ],
)

export const oauthClientAssertions = sqliteTable('oauth_client_assertions', {
  id: text().primaryKey(),
  expiresAt: moment().notNull(),
})
