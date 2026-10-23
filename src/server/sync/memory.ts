import 'server-only'

import { randomUUID } from 'node:crypto'

import { and, asc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm'

import type { SyncSource } from '@/domain/library/values'
import {
  isSetAside,
  stateOf,
  type Decision,
  type Reported,
  type Resolution,
  type StoreKindOf,
} from '@/domain/sync/items'
import type { ItemCounts, ItemList, LinkProblem, LinkView } from '@/domain/sync/link'
import { MAX_LISTED } from '@/domain/sync/link'
import type { Evidence } from '@/domain/sync/sources'
import type { Db, Executor } from '@/server/db/client'
import { platformLinks, sourceItems } from '@/server/db/schema'

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

/**
 * Links an account to its account at a source. Linking another account at
 * the same source forgets what the first one reported: its games stay on
 * the shelf, but its answers were about someone else's list.
 */
export const saveLink = async (
  db: Db,
  userId: string,
  source: SyncSource,
  externalId: string,
  name: string | undefined,
  now = Date.now(),
) => {
  const before = await readLink(db, userId, source)
  const another = before !== undefined && before.externalId !== externalId
  await db.batch([
    db
      .insert(platformLinks)
      .values({ userId, source, externalId, name: name ?? null, linkedAt: now })
      .onConflictDoUpdate({
        target: [platformLinks.userId, platformLinks.source],
        set: {
          externalId,
          name: name ?? null,
          linkedAt: now,
          ...(another ? { readAt: null, syncedAt: null, problem: null } : {}),
        },
      }),
    ...(another ? [db.delete(sourceItems).where(ofSource(userId, source))] : []),
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

/** My answer about one item. */
export const decideItem = (
  db: Db,
  userId: string,
  id: string,
  patch: { decision: Decision; igdbId?: number; by?: Resolution },
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
    })
    .where(and(eq(sourceItems.userId, userId), eq(sourceItems.id, id)))

/** How many items are in each state, and how many on the shelf the source no longer lists. */
export const countItems = async (db: Executor, link: Link): Promise<ItemCounts> => {
  const rows = await db
    .select({
      decision: sourceItems.decision,
      shelved: sql<number>`${sourceItems.copyId} is not null`,
      unseen: sql<number>`${sourceItems.lastSeenAt} < ${link.readAt ?? 0}`,
      count: sql<number>`count(*)`,
    })
    .from(sourceItems)
    .where(ofSource(link.userId, link.source))
    .groupBy(sql`1, 2, 3`)
  const counts: ItemCounts = { 'on-shelf': 0, adding: 0, 'needs-you': 0, hidden: 0, notSeen: 0 }
  for (const row of rows) {
    const state = stateOf({ decision: row.decision, copyId: Number(row.shelved) ? 'yes' : null })
    counts[state] += Number(row.count)
    if (state === 'on-shelf' && Number(row.unseen)) counts.notSeen += Number(row.count)
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
})

/** One of the page's lists of items. */
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
    .orderBy(sql`${sourceItems.minutes} desc`, asc(sourceItems.title))
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
