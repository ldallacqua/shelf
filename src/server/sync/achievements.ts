import 'server-only'

import { and, desc, eq, inArray, isNotNull, like, ne, sql } from 'drizzle-orm'

import {
  isAchievementProvider,
  setIdOf,
  type AchievementCounts,
  type AchievementLanguage,
  type AchievementProvider,
  type AchievementSetView,
  type AchievementView,
  type DefinedSet,
  type ProgressProblem,
  type Unlock,
} from '@/domain/achievements/achievements'
import type { KnownApp } from '@/domain/achievements/due'
import type { Db, Executor } from '@/server/db/client'
import {
  achievementProgress,
  achievements,
  achievementSets,
  achievementUnlocks,
  copies,
  platformLinks,
  sourceItems,
} from '@/server/db/schema'

/**
 * Achievements' own rows (issue 72): each provider's sets and their
 * achievements, shared by every account, and each account's progress
 * through them. Like the sync's memory, they are not the library: nothing
 * here changes a library's version. A game's page asks for them when it
 * opens, and the account page's sync fills them in steps.
 */

type SetRow = typeof achievementSets.$inferSelect
type ProgressRow = typeof achievementProgress.$inferSelect

/** One of an account's games at a provider, on the shelf, and what is known of its achievements. */
export type App = {
  /** The provider's id for the game: a Steam app id. */
  storeId: string
  title: string
  copyId: string
  minutes: number
  lastPlayedAt: number | null
  set?: SetRow
  progress?: ProgressRow
  /** The account's unlocks in its set as last read. */
  unlocked: number
}

/** What the sync's ladder of due work reads of an app. */
export const knownOf = (app: App): KnownApp => ({
  lastPlayedAt: app.lastPlayedAt,
  ...(app.set ? { set: app.set } : {}),
  ...(app.progress ? { progress: app.progress } : {}),
})

/**
 * Every game the source put on the shelf, each with its set and the
 * account's progress, if read. A game the source listed but that is not on
 * the shelf (not a game, not mine, waiting for me) has nothing to read.
 */
export const shelvedApps = async (
  db: Executor,
  userId: string,
  provider: AchievementProvider,
): Promise<App[]> => {
  const rows = await db
    .select({
      storeId: sourceItems.storeId,
      title: sourceItems.title,
      copyId: sourceItems.copyId,
      minutes: sourceItems.minutes,
      lastPlayedAt: sourceItems.lastPlayedAt,
      set: achievementSets,
      progress: achievementProgress,
      unlocked:
        sql<number>`(select count(*) from ${achievementUnlocks} where ${achievementUnlocks.userId} = ${userId} and ${achievementUnlocks.setId} = ${achievementSets.id})`.mapWith(
          Number,
        ),
    })
    .from(sourceItems)
    .leftJoin(
      achievementSets,
      and(
        eq(achievementSets.provider, provider),
        eq(achievementSets.providerSetId, sourceItems.storeId),
      ),
    )
    .leftJoin(
      achievementProgress,
      and(
        eq(achievementProgress.userId, userId),
        eq(achievementProgress.setId, achievementSets.id),
      ),
    )
    .where(
      and(
        eq(sourceItems.userId, userId),
        eq(sourceItems.source, provider),
        isNotNull(sourceItems.copyId),
      ),
    )
  return rows.map(({ set, progress, copyId, ...app }) => ({
    ...app,
    copyId: copyId!,
    ...(set ? { set } : {}),
    ...(progress ? { progress } : {}),
  }))
}

/** Statements a batch may carry at once, and rows a statement, well under SQLite's limits. */
const ROWS_AT_ONCE = 100

const chunks = <T>(list: readonly T[], size = ROWS_AT_ONCE): T[][] => {
  const out: T[][] = []
  for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size))
  return out
}

/** Statements run as one: all of them, or none. */
const inOne = async <Statement extends Parameters<Db['batch']>[0][number]>(
  db: Db,
  statements: readonly Statement[],
) => {
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
}

/**
 * A set's definitions as the provider gave them just now, in English and in
 * the site's other languages, with the unlock rates the English came with:
 * new achievements are added, changed ones brought up to date, and those
 * the provider took out are taken out, with every account's unlock of them.
 * `undefined` is a game with none. Translations that say what the English
 * says are not kept.
 */
export const saveDefinitions = async (
  db: Db,
  provider: AchievementProvider,
  providerSetId: string,
  defined: DefinedSet | undefined,
  translated: Partial<Record<AchievementLanguage, DefinedSet>>,
  now: number,
): Promise<{ count: number; changed: boolean }> => {
  const setId = setIdOf(provider, providerSetId)
  const listed = defined?.achievements ?? []
  const before = new Set(
    (
      await db
        .select({ id: achievements.achievementId })
        .from(achievements)
        .where(eq(achievements.setId, setId))
    ).map((row) => row.id),
  )
  const listedIds = new Set(listed.map((each) => each.id))
  const changed =
    listed.some((each) => !before.has(each.id)) || [...before].some((id) => !listedIds.has(id))

  const otherwise = Object.entries(translated).map(
    ([language, set]) =>
      [
        language as AchievementLanguage,
        new Map(set.achievements.map((each) => [each.id, each])),
      ] as const,
  )
  const rows = listed.map((each, position) => {
    const translations: Partial<
      Record<AchievementLanguage, { name: string; description?: string }>
    > = {}
    for (const [language, byId] of otherwise) {
      const other = byId.get(each.id)
      if (!other || (other.name === each.name && other.description === each.description)) continue
      translations[language] = {
        name: other.name,
        ...(other.description ? { description: other.description } : {}),
      }
    }
    return {
      setId,
      achievementId: each.id,
      position,
      name: each.name,
      description: each.description ?? null,
      translations: Object.keys(translations).length > 0 ? translations : null,
      icon: each.icon ?? null,
      iconLocked: each.iconLocked ?? null,
      hidden: each.hidden,
      rate: each.rate ?? null,
      firstSeenAt: now,
    }
  })
  const rated = listed.some((each) => each.rate !== undefined)

  const statements = [
    db
      .insert(achievementSets)
      .values({
        id: setId,
        provider,
        providerSetId,
        title: defined?.title ?? null,
        count: listed.length,
        definedAt: now,
        changedAt: changed ? now : null,
        ratesAt: rated ? now : null,
        triedAt: now,
        failed: false,
      })
      .onConflictDoUpdate({
        target: achievementSets.id,
        set: {
          title: defined?.title ?? sql`${achievementSets.title}`,
          count: listed.length,
          definedAt: now,
          ...(changed ? { changedAt: now } : {}),
          ...(rated ? { ratesAt: now } : {}),
          triedAt: now,
          failed: false,
        },
      }),
    ...chunks(rows).map((chunk) =>
      db
        .insert(achievements)
        .values(chunk)
        .onConflictDoUpdate({
          target: [achievements.setId, achievements.achievementId],
          set: {
            position: sql`excluded.position`,
            name: sql`excluded.name`,
            // A description given only with an account's progress stays.
            description: sql`coalesce(excluded.description, ${achievements.description})`,
            translations: sql`excluded.translations`,
            icon: sql`excluded.icon`,
            iconLocked: sql`excluded.icon_locked`,
            hidden: sql`excluded.hidden`,
            // One the provider no longer gives a share for is not known.
            rate: sql`excluded.rate`,
          },
        }),
    ),
    ...chunks([...before].filter((id) => !listedIds.has(id))).map((gone) =>
      db
        .delete(achievements)
        .where(and(eq(achievements.setId, setId), inArray(achievements.achievementId, gone))),
    ),
  ]
  await inOne(db, statements)
  return { count: listed.length, changed }
}

/** The provider did not answer for a set's definitions: asked again after a while. */
export const noteDefinitionsFailed = (
  db: Db,
  provider: AchievementProvider,
  providerSetId: string,
  now: number,
) =>
  db
    .insert(achievementSets)
    .values({
      id: setIdOf(provider, providerSetId),
      provider,
      providerSetId,
      triedAt: now,
      failed: true,
    })
    .onConflictDoUpdate({ target: achievementSets.id, set: { triedAt: now, failed: true } })

/**
 * The provider was asked about a game with none and counts none still, or
 * did not say: counted again after a while. Nothing else about it changes.
 */
export const noteCounted = (
  db: Db,
  provider: AchievementProvider,
  providerSetId: string,
  now: number,
) =>
  db
    .update(achievementSets)
    .set({ triedAt: now })
    .where(eq(achievementSets.id, setIdOf(provider, providerSetId)))

/**
 * Descriptions the provider gave with an account's progress, for any
 * achievement its definitions gave none. One that already has a
 * description keeps it.
 */
export const fillDescriptions = async (
  db: Db,
  setId: string,
  descriptions: Map<string, string>,
) => {
  const missing = await db
    .select({ id: achievements.achievementId })
    .from(achievements)
    .where(and(eq(achievements.setId, setId), sql`${achievements.description} is null`))
  const filled = missing.flatMap(({ id }) => {
    const description = descriptions.get(id)
    return description ? [[id, description] as const] : []
  })
  if (filled.length === 0) return
  const statements = chunks(filled).map((chunk) =>
    db
      .update(achievements)
      .set({
        description: sql`case ${achievements.achievementId} ${sql.join(
          chunk.map(([id, description]) => sql`when ${id} then ${description}`),
          sql` `,
        )} end`,
      })
      .where(
        and(
          eq(achievements.setId, setId),
          inArray(
            achievements.achievementId,
            chunk.map(([id]) => id),
          ),
        ),
      ),
  )
  await inOne(db, statements)
}

/** The ids of a set's achievements as last read. */
export const definedIds = async (db: Executor, setId: string): Promise<Set<string>> =>
  new Set(
    (
      await db
        .select({ id: achievements.achievementId })
        .from(achievements)
        .where(eq(achievements.setId, setId))
    ).map((row) => row.id),
  )

/**
 * An account's progress through a set, as the provider gave it just now: the
 * unlocks replace the last read's whole, so reading twice changes nothing.
 * An unlock of an achievement the set does not define is not kept.
 */
export const saveProgress = async (
  db: Db,
  userId: string,
  setId: string,
  read: {
    externalId: string
    copyId: string
    playedAt: number | null
    unlocks: readonly Unlock[]
    defined: Set<string>
  },
  now: number,
) => {
  const unlocks = [
    ...new Map(
      read.unlocks.filter((each) => read.defined.has(each.id)).map((each) => [each.id, each]),
    ).values(),
  ]
  const statements = [
    db
      .insert(achievementProgress)
      .values({
        userId,
        setId,
        externalId: read.externalId,
        copyId: read.copyId,
        readAt: now,
        playedAt: read.playedAt,
        triedAt: now,
        problem: null,
      })
      .onConflictDoUpdate({
        target: [achievementProgress.userId, achievementProgress.setId],
        set: {
          externalId: read.externalId,
          copyId: read.copyId,
          readAt: now,
          playedAt: read.playedAt,
          triedAt: now,
          problem: null,
        },
      }),
    db
      .delete(achievementUnlocks)
      .where(and(eq(achievementUnlocks.userId, userId), eq(achievementUnlocks.setId, setId))),
    ...chunks(unlocks).map((chunk) =>
      db.insert(achievementUnlocks).values(
        chunk.map((each) => ({
          userId,
          setId,
          achievementId: each.id,
          unlockedAt: each.at ?? null,
        })),
      ),
    ),
  ]
  await inOne(db, statements)
}

/**
 * The provider counts as many unlocks of a set as the account's last read
 * found: the same ones, since an unlock is not taken back. Read again just
 * now, without asking for them one by one.
 */
export const progressUnchanged = (
  db: Db,
  userId: string,
  setId: string,
  read: { externalId: string; copyId: string; playedAt: number | null },
  now: number,
) =>
  db
    .update(achievementProgress)
    .set({ copyId: read.copyId, readAt: now, playedAt: read.playedAt, triedAt: now, problem: null })
    .where(
      and(
        eq(achievementProgress.userId, userId),
        eq(achievementProgress.setId, setId),
        eq(achievementProgress.externalId, read.externalId),
      ),
    )

/** A read of an account's progress that did not work. What the last good read found stays. */
export const noteProgressFailed = (
  db: Db,
  userId: string,
  setId: string,
  { externalId, copyId, problem }: { externalId: string; copyId: string; problem: ProgressProblem },
  now: number,
) =>
  db
    .insert(achievementProgress)
    .values({ userId, setId, externalId, copyId, readAt: null, triedAt: now, problem })
    .onConflictDoUpdate({
      target: [achievementProgress.userId, achievementProgress.setId],
      set: { copyId, triedAt: now, problem },
    })

/**
 * Progress read for any other account at the provider than this one, gone:
 * this one was linked in its place, so those unlocks are not its own.
 */
export const forgetOtherProgress = (
  db: Executor,
  userId: string,
  provider: AchievementProvider,
  externalId: string,
) =>
  db
    .delete(achievementProgress)
    .where(
      and(
        eq(achievementProgress.userId, userId),
        like(achievementProgress.setId, `${provider}:%`),
        ne(achievementProgress.externalId, externalId),
      ),
    )

/**
 * The sets of the games on these copies, with their achievements and the
 * account's progress, as a game's page shows them, in the visitor's
 * language. A set is a game's when the provider put that copy on the shelf
 * (`source_items`), or when its progress was read for the copy and kept
 * after the account disconnected. Progress read for another account at the
 * provider than the one linked now is never shown.
 */
export const readSetsOf = async (
  db: Executor,
  userId: string,
  /** The copies asked about, or every copy the account has. */
  copyIds: readonly string[] | 'all',
  language: AchievementLanguage,
): Promise<Map<string, AchievementSetView[]>> => {
  const byCopy = new Map<string, AchievementSetView[]>()
  if (copyIds !== 'all' && copyIds.length === 0) return byCopy
  const ofItems =
    copyIds === 'all' ? isNotNull(sourceItems.copyId) : inArray(sourceItems.copyId, [...copyIds])
  const ofProgress =
    copyIds === 'all' ? undefined : inArray(achievementProgress.copyId, [...copyIds])
  const [items, progress, links] = await Promise.all([
    db
      .select({
        source: sourceItems.source,
        storeId: sourceItems.storeId,
        title: sourceItems.title,
        copyId: sourceItems.copyId,
      })
      .from(sourceItems)
      .where(and(eq(sourceItems.userId, userId), ofItems)),
    db
      .select()
      .from(achievementProgress)
      .where(and(eq(achievementProgress.userId, userId), ofProgress)),
    db
      .select({ source: platformLinks.source, externalId: platformLinks.externalId })
      .from(platformLinks)
      .where(eq(platformLinks.userId, userId)),
  ])
  const linked = new Map(links.map((link) => [link.source as string, link.externalId]))

  /** Each set a copy has, with the title its source gave it. */
  const wanted = new Map<
    string,
    { copyId: string; provider: AchievementProvider; storeId: string; title?: string }
  >()
  for (const item of items) {
    if (!isAchievementProvider(item.source) || !item.copyId) continue
    wanted.set(setIdOf(item.source, item.storeId), {
      copyId: item.copyId,
      provider: item.source,
      storeId: item.storeId,
      title: item.title,
    })
  }
  const progressOf = new Map<string, ProgressRow>()
  for (const row of progress) {
    const provider = row.setId.slice(0, row.setId.indexOf(':'))
    if (!isAchievementProvider(provider)) continue
    const linkedAs = linked.get(provider)
    // Another account at the provider is linked now: this progress was someone else's list.
    if (linkedAs !== undefined && linkedAs !== row.externalId) continue
    progressOf.set(row.setId, row)
    if (!wanted.has(row.setId)) {
      wanted.set(row.setId, {
        copyId: row.copyId,
        provider,
        storeId: row.setId.slice(provider.length + 1),
      })
    }
  }
  if (wanted.size === 0) return byCopy

  const setIds = [...wanted.keys()]
  const providers = [...new Set([...wanted.values()].map((each) => each.provider))]
  const [sets, defined, unlocked, ...latest] = await Promise.all([
    db.select().from(achievementSets).where(inArray(achievementSets.id, setIds)),
    db
      .select()
      .from(achievements)
      .where(inArray(achievements.setId, setIds))
      .orderBy(achievements.setId, achievements.position),
    db
      .select()
      .from(achievementUnlocks)
      .where(and(eq(achievementUnlocks.userId, userId), inArray(achievementUnlocks.setId, setIds))),
    // The account's latest read at each provider: when that one found it private, so would
    // the others, which a sync stops asking.
    ...providers.map((provider) =>
      db
        .select({ problem: achievementProgress.problem })
        .from(achievementProgress)
        .where(
          and(
            eq(achievementProgress.userId, userId),
            like(achievementProgress.setId, `${provider}:%`),
          ),
        )
        .orderBy(desc(achievementProgress.triedAt))
        .limit(1),
    ),
  ])
  const hidden = new Set(providers.filter((_, at) => latest[at]?.[0]?.problem === 'private'))
  const setOf = new Map(sets.map((set) => [set.id, set]))
  const definedIn = new Map<string, (typeof defined)[number][]>()
  for (const row of defined) definedIn.set(row.setId, [...(definedIn.get(row.setId) ?? []), row])
  const unlocks = new Map(unlocked.map((row) => [`${row.setId}\u0000${row.achievementId}`, row]))

  for (const [setId, { copyId, provider, storeId, title }] of wanted) {
    const set = setOf.get(setId)
    const read = progressOf.get(setId)
    const view: AchievementSetView = {
      provider,
      setId: storeId,
      title: set?.title ?? title ?? storeId,
      state: 'pending',
      achievements: [],
    }
    if (read && !linked.has(provider)) view.snapshot = true
    if (set?.ratesAt) view.ratesAt = set.ratesAt
    if (set?.count === 0) view.state = 'none'
    else if (read?.readAt) {
      view.state = 'ready'
      view.readAt = read.readAt
      if (read.problem) view.problem = read.problem
      view.achievements = (definedIn.get(setId) ?? []).map((row): AchievementView => {
        const said = language === 'en' ? undefined : row.translations?.[language]
        const unlock = unlocks.get(`${setId}\u0000${row.achievementId}`)
        const description = said?.description ?? row.description
        const achievement: AchievementView = {
          id: row.achievementId,
          name: said?.name ?? row.name,
          hidden: row.hidden,
          // Added to the set after the read: the read could not say.
          state: unlock ? 'unlocked' : row.firstSeenAt > read.readAt! ? 'unknown' : 'locked',
        }
        if (description) achievement.description = description
        if (language !== 'en' && !said) achievement.inEnglish = true
        if (row.icon) achievement.icon = row.icon
        if (row.iconLocked) achievement.iconLocked = row.iconLocked
        if (row.rate !== null) achievement.rate = row.rate
        if (unlock?.unlockedAt) achievement.unlockedAt = unlock.unlockedAt
        return achievement
      })
    } else if (read?.problem === 'private' || (hidden.has(provider) && !read?.readAt))
      view.state = 'private'
    // Nothing read yet, and the provider did not answer the last time it was asked.
    else if (read?.problem === 'unreachable' || (set?.failed && set.count === null))
      view.state = 'failed'
    byCopy.set(copyId, [...(byCopy.get(copyId) ?? []), view])
  }
  return byCopy
}

/** The copies of these entries, by entry, in the order they were made. */
export const copiesOf = async (
  db: Executor,
  entryIds: readonly string[],
): Promise<Map<string, string[]>> => {
  const byEntry = new Map<string, string[]>()
  if (entryIds.length === 0) return byEntry
  const rows = await db
    .select({ id: copies.id, entryId: copies.entryId })
    .from(copies)
    .where(inArray(copies.entryId, [...entryIds]))
    .orderBy(copies.createdAt)
  for (const row of rows) byEntry.set(row.entryId, [...(byEntry.get(row.entryId) ?? []), row.id])
  return byEntry
}

/** How far a provider's achievements are read for an account, for its card. */
export const countAchievements = (apps: readonly App[], externalId: string): AchievementCounts => {
  let known = 0
  let hidden = 0
  for (const app of apps) {
    const theirs = app.progress?.externalId === externalId ? app.progress : undefined
    if (app.set?.count === 0 || theirs?.readAt) known += 1
    else if (theirs?.problem === 'private') hidden += 1
  }
  return { games: apps.length, known, private: hidden }
}
