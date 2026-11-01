import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'

import { isAchievementProvider } from '@/domain/achievements/achievements'
import type { SyncSource } from '@/domain/library/values'
import {
  isSetAside,
  stateOf,
  type Decision,
  type ItemFormat,
  type Reported,
  type Resolution,
  type StoreKindOf,
} from '@/domain/sync/items'
import type { ItemCounts, ItemList, LinkProblem, LinkView } from '@/domain/sync/link'
import { MAX_LISTED } from '@/domain/sync/link'
import type { Evidence } from '@/domain/sync/sources'
import type { Db, Executor } from '@/server/db/client'
import { copies, entries, platformLinks, sourceItems } from '@/server/db/schema'
import { countAchievements, forgetOtherProgress, shelvedApps } from '@/server/sync/achievements'

/**
 * The sync's own rows (ADR 003, decision 3): each account's links to its
 * sources, and what each source reported and what was decided about it.
 * They are not the library: nothing here changes a library's version.
 * Writes that put a game on the shelf, or hours on a copy, go through
 * `library/store.ts` (`addFromSource`, `feedCopies`).
 */

export type Link = typeof platformLinks.$inferSelect
export type Item = typeof sourceItems.$inferSelect

const ofLink = (userId: string, source: SyncSource) =>
  and(eq(platformLinks.userId, userId), eq(platformLinks.source, source))

const ofSource = (userId: string, source: SyncSource) =>
  and(eq(sourceItems.userId, userId), eq(sourceItems.source, source))

export const readLink = async (
  db: Executor,
  userId: string,
  source: SyncSource,
): Promise<Link | undefined> => {
  const [row] = await db.select().from(platformLinks).where(ofLink(userId, source)).limit(1)
  return row
}

export const readLinks = (db: Executor, userId: string): Promise<Link[]> =>
  db.select().from(platformLinks).where(eq(platformLinks.userId, userId))

/** The account at a source that its sign-in vouched for, and what it gave Shelf to keep, sealed. */
export type Linked = { externalId: string; name?: string; sealed?: string }

/**
 * Links an account to its account at a source, or signs it in there again.
 * A new sign-in clears what went wrong with the last. Linking another
 * account at the same source forgets what the first one reported, and its
 * achievements, kept or not since it was disconnected: its games stay on
 * the shelf, but its answers were about someone else's list.
 */
export const saveLink = async (
  db: Db,
  userId: string,
  source: SyncSource,
  { externalId, name, sealed }: Linked,
  now = Date.now(),
) => {
  const before = await readLink(db, userId, source)
  const another = before !== undefined && before.externalId !== externalId
  const signIn = { externalId, name: name ?? null, secret: sealed ?? null, problem: null }
  await db.batch([
    db
      .insert(platformLinks)
      .values({ userId, source, ...signIn, linkedAt: now })
      .onConflictDoUpdate({
        target: [platformLinks.userId, platformLinks.source],
        set: {
          ...signIn,
          linkedAt: now,
          ...(another ? { readAt: null, syncedAt: null } : {}),
        },
      }),
    ...(another ? [db.delete(sourceItems).where(ofSource(userId, source))] : []),
    ...(isAchievementProvider(source) ? [forgetOtherProgress(db, userId, source, externalId)] : []),
  ])
}

/** The link and what its source reported, gone. The games it put on the shelf stay, with their hours. */
export const forgetLink = (db: Db, userId: string, source: SyncSource) =>
  db.batch([
    db.delete(sourceItems).where(ofSource(userId, source)),
    db.delete(platformLinks).where(ofLink(userId, source)),
  ])

export const setDaily = (db: Db, userId: string, source: SyncSource, daily: boolean) =>
  db.update(platformLinks).set({ daily }).where(ofLink(userId, source))

/** How the last read went: when it worked, and the account's name if it was read. */
export const noteRead = (
  db: Db,
  userId: string,
  source: SyncSource,
  outcome: { problem: LinkProblem } | { at: number; name?: string },
) =>
  db
    .update(platformLinks)
    .set(
      'problem' in outcome
        ? { problem: outcome.problem }
        : { problem: null, readAt: outcome.at, ...(outcome.name ? { name: outcome.name } : {}) },
    )
    .where(ofLink(userId, source))

export const noteSynced = (db: Db, userId: string, source: SyncSource, at: number) =>
  db.update(platformLinks).set({ syncedAt: at }).where(ofLink(userId, source))

/** Rows a statement may carry, well under SQLite's limit on values in one statement. */
const ROWS_AT_ONCE = 100

/**
 * What a source listed, remembered: a game new to the list waits to be
 * matched; one seen before has its title, minutes and last play brought up
 * to date, and is marked seen. One the list leaves out keeps the moment it
 * was last seen.
 */
export const recordReport = async (
  db: Db,
  userId: string,
  source: SyncSource,
  evidence: Evidence,
  reported: readonly Reported[],
  now = Date.now(),
) => {
  const unique = [...new Map(reported.map((item) => [item.storeId, item])).values()]
  const statements = []
  for (let at = 0; at < unique.length; at += ROWS_AT_ONCE) {
    statements.push(
      db
        .insert(sourceItems)
        .values(
          unique.slice(at, at + ROWS_AT_ONCE).map((item) => ({
            id: randomUUID(),
            userId,
            source,
            storeId: item.storeId,
            title: item.title,
            platformId: item.platformId ?? null,
            year: item.year ?? null,
            evidence,
            minutes: item.minutes,
            lastPlayedAt: item.lastPlayedAt ?? null,
            firstSeenAt: now,
            lastSeenAt: now,
          })),
        )
        .onConflictDoUpdate({
          target: [sourceItems.userId, sourceItems.source, sourceItems.storeId],
          set: {
            title: sql`excluded.title`,
            minutes: sql`excluded.minutes`,
            lastPlayedAt: sql`excluded.last_played_at`,
            lastSeenAt: sql`excluded.last_seen_at`,
          },
        }),
    )
  }
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/** Items no rung has matched and I have not answered, oldest first. */
export const unmatched = (db: Executor, userId: string, source: SyncSource, limit: number) =>
  db
    .select()
    .from(sourceItems)
    .where(
      and(
        ofSource(userId, source),
        isNull(sourceItems.igdbId),
        eq(sourceItems.decision, 'pending'),
      ),
    )
    .orderBy(asc(sourceItems.firstSeenAt), asc(sourceItems.storeId))
    .limit(limit)

export type Resolved = { id: string; igdbId: number; by: Resolution; decision: Decision }

/** What the ladder found, and the items the title rung tried without an answer. */
export const saveResolutions = async (
  db: Db,
  resolved: readonly Resolved[],
  triedByTitle: readonly string[],
  now = Date.now(),
) => {
  const statements = [
    ...resolved.map((item) =>
      db
        .update(sourceItems)
        .set({ igdbId: item.igdbId, resolvedBy: item.by, decision: item.decision })
        .where(eq(sourceItems.id, item.id)),
    ),
    ...(triedByTitle.length > 0
      ? [
          db
            .update(sourceItems)
            .set({ titleTriedAt: now })
            .where(inArray(sourceItems.id, [...triedByTitle])),
        ]
      : []),
  ]
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/** The items of these apps. */
export const itemsOfApps = (
  db: Executor,
  userId: string,
  source: SyncSource,
  storeIds: readonly string[],
) =>
  db
    .select({ id: sourceItems.id })
    .from(sourceItems)
    .where(and(ofSource(userId, source), inArray(sourceItems.storeId, [...storeIds])))

/** Items whose store page was read just now for a game IGDB has none of. */
export const noteStoreTried = (db: Db, ids: readonly string[], now = Date.now()) =>
  db
    .update(sourceItems)
    .set({ storeTriedAt: now })
    .where(inArray(sourceItems.id, [...ids]))

/** Every item's store id and title: where a mode the store names no game for looks for it. */
export const listedTitles = (db: Executor, userId: string, source: SyncSource) =>
  db
    .select({ storeId: sourceItems.storeId, title: sourceItems.title })
    .from(sourceItems)
    .where(ofSource(userId, source))

/** Items the store has not been asked about yet, oldest first. */
export const unclassified = (db: Executor, userId: string, source: SyncSource, limit: number) =>
  db
    .select({ id: sourceItems.id, storeId: sourceItems.storeId, title: sourceItems.title })
    .from(sourceItems)
    .where(and(ofSource(userId, source), isNull(sourceItems.kind)))
    .orderBy(asc(sourceItems.firstSeenAt), asc(sourceItems.storeId))
    .limit(limit)

/**
 * What the store said each item is. One it says is a demo, software or a
 * video, that nothing has matched and I have not answered, is left out as
 * "not a game": what I would have answered. "Ask again" undoes it, and the
 * store is not asked a second time.
 */
export const saveKinds = async (
  db: Db,
  userId: string,
  items: readonly { id: string; storeId: string }[],
  kinds: ReadonlyMap<string, StoreKindOf>,
  now = Date.now(),
) => {
  // One statement for each kind (and a part's game), a hundred items at a time.
  const groups = new Map<string, { said: StoreKindOf; ids: string[] }>()
  const asides: string[] = []
  for (const item of items) {
    const said = kinds.get(item.storeId)
    if (!said) continue
    const key = `${said.kind} ${said.parentStoreId ?? ''}`
    const group = groups.get(key) ?? { said, ids: [] }
    group.ids.push(item.id)
    groups.set(key, group)
    if (isSetAside(said.kind)) asides.push(item.id)
  }
  const chunks = (ids: readonly string[]) => {
    const out: string[][] = []
    for (let at = 0; at < ids.length; at += ROWS_AT_ONCE) out.push(ids.slice(at, at + ROWS_AT_ONCE))
    return out
  }
  const mine = (ids: readonly string[]) =>
    and(eq(sourceItems.userId, userId), inArray(sourceItems.id, [...ids]))
  const statements = [
    ...[...groups.values()].flatMap(({ said, ids }) =>
      chunks(ids).map((chunk) =>
        db
          .update(sourceItems)
          .set({ kind: said.kind, parentStoreId: said.parentStoreId ?? null })
          .where(mine(chunk)),
      ),
    ),
    ...chunks(asides).map((chunk) =>
      db
        .update(sourceItems)
        .set({ decision: 'not_a_game', decidedAt: now })
        .where(
          and(
            mine(chunk),
            eq(sourceItems.decision, 'pending'),
            isNull(sourceItems.igdbId),
            isNull(sourceItems.copyId),
          ),
        ),
    ),
  ]
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/** Matched games waiting to go on the shelf. */
export const waitingToAdd = (db: Executor, userId: string, source: SyncSource) =>
  db
    .select()
    .from(sourceItems)
    .where(
      and(
        ofSource(userId, source),
        eq(sourceItems.decision, 'copy'),
        isNull(sourceItems.copyId),
        isNotNull(sourceItems.igdbId),
      ),
    )
    .orderBy(asc(sourceItems.firstSeenAt), asc(sourceItems.storeId))

/** Items feeding copies, for their hours. */
export const feeding = (db: Executor, userId: string, source: SyncSource) =>
  db
    .select({ copyId: sourceItems.copyId, minutes: sourceItems.minutes })
    .from(sourceItems)
    .where(and(ofSource(userId, source), isNotNull(sourceItems.copyId)))

export const readItem = async (db: Executor, userId: string, id: string) => {
  const [row] = await db
    .select()
    .from(sourceItems)
    .where(and(eq(sourceItems.userId, userId), eq(sourceItems.id, id)))
    .limit(1)
  return row
}

/** My answer about one item: what it is, the game it is, how I own it. */
export const decideItem = (
  db: Db,
  userId: string,
  id: string,
  patch: { decision: Decision; igdbId?: number; by?: Resolution; format?: ItemFormat },
  now = Date.now(),
) =>
  db
    .update(sourceItems)
    .set({
      decision: patch.decision,
      decidedAt: now,
      ...(patch.igdbId === undefined
        ? {}
        : { igdbId: patch.igdbId, resolvedBy: patch.by ?? 'owner' }),
      ...(patch.format === undefined ? {} : { format: patch.format }),
    })
    .where(and(eq(sourceItems.userId, userId), eq(sourceItems.id, id)))

/**
 * One answer for many items: each matched one still waiting for me is the
 * game it was matched to, owned this way. Any other is left as it is.
 */
export const confirmItems = async (
  db: Db,
  userId: string,
  source: SyncSource,
  ids: readonly string[],
  format: ItemFormat,
  now = Date.now(),
) => {
  const statements = []
  for (let at = 0; at < ids.length; at += ROWS_AT_ONCE) {
    statements.push(
      db
        .update(sourceItems)
        .set({ decision: 'copy', format, decidedAt: now })
        .where(
          and(
            ofSource(userId, source),
            inArray(sourceItems.id, ids.slice(at, at + ROWS_AT_ONCE)),
            eq(sourceItems.decision, 'pending'),
            isNotNull(sourceItems.igdbId),
            isNull(sourceItems.copyId),
          ),
        ),
    )
  }
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/**
 * How many games are in each state, and how many on the shelf the source no
 * longer lists. A game the source lists twice, as Nintendo lists Warframe
 * for the Switch and the Switch 2, counts once: on the shelf by its copy,
 * waiting by the record it was matched to. What is left out counts by item.
 */
export const countItems = async (db: Executor, link: Link): Promise<ItemCounts> => {
  const game = sql`case when ${sourceItems.decision} in ('pending', 'copy')
    then coalesce(${sourceItems.copyId}, 'game:' || ${sourceItems.igdbId}, ${sourceItems.id})
    else ${sourceItems.id} end`
  const rows = await db
    .select({
      decision: sourceItems.decision,
      shelved: sql<number>`${sourceItems.copyId} is not null`,
      count: sql<number>`count(distinct ${game})`,
      unseen: sql<number>`count(distinct case when ${sourceItems.lastSeenAt} < ${link.readAt ?? 0} then ${game} end)`,
    })
    .from(sourceItems)
    .where(ofSource(link.userId, link.source))
    .groupBy(sql`1, 2`)
  // The games it fed that still wait for me to place them, each once; not one I archived.
  const [waiting] = await db
    .select({ count: sql<number>`count(distinct ${copies.entryId})` })
    .from(sourceItems)
    .innerJoin(copies, eq(copies.id, sourceItems.copyId))
    .innerJoin(entries, eq(entries.id, copies.entryId))
    .where(
      and(
        ofSource(link.userId, link.source),
        eq(entries.status, 'unsorted'),
        isNull(entries.archivedAt),
      ),
    )
  const counts: ItemCounts = {
    'on-shelf': 0,
    adding: 0,
    'needs-you': 0,
    hidden: 0,
    notSeen: 0,
    unsorted: Number(waiting?.count ?? 0),
  }
  for (const row of rows) {
    const state = stateOf({ decision: row.decision, copyId: Number(row.shelved) ? 'yes' : null })
    counts[state] += Number(row.count)
    if (state === 'on-shelf') counts.notSeen += Number(row.unseen)
  }
  return counts
}

export const viewOf = async (db: Executor, link: Link): Promise<LinkView> => ({
  source: link.source,
  externalId: link.externalId,
  name: link.name,
  daily: link.daily,
  linkedAt: link.linkedAt,
  readAt: link.readAt,
  syncedAt: link.syncedAt,
  problem: link.problem,
  counts: await countItems(db, link),
  ...(isAchievementProvider(link.source)
    ? {
        achievements: countAchievements(
          await shelvedApps(db, link.userId, link.source),
          link.externalId,
        ),
      }
    : {}),
})

/**
 * One of the page's lists of items, the most played first. Those waiting
 * for me start with the ones Shelf matched, which need only how I own
 * them, before the ones it could not find.
 */
export const listItems = (db: Executor, link: Link, list: ItemList) => {
  const where =
    list === 'needs-you'
      ? eq(sourceItems.decision, 'pending')
      : list === 'hidden'
        ? inArray(sourceItems.decision, ['not_mine', 'not_a_game', 'removed'])
        : and(isNotNull(sourceItems.copyId), lt(sourceItems.lastSeenAt, link.readAt ?? 0))
  return db
    .select()
    .from(sourceItems)
    .where(and(ofSource(link.userId, link.source), where))
    .orderBy(
      ...(list === 'needs-you' ? [sql`${sourceItems.igdbId} is null`] : []),
      sql`${sourceItems.minutes} desc`,
      asc(sourceItems.title),
    )
    .limit(MAX_LISTED)
}

/** Links due their daily sync, the longest unsynced first. */
export const dueLinks = (db: Executor, limit: number) =>
  db
    .select()
    .from(platformLinks)
    .where(eq(platformLinks.daily, true))
    .orderBy(sql`coalesce(${platformLinks.syncedAt}, 0) asc`)
    .limit(limit)
