import 'server-only'

import { and, eq } from 'drizzle-orm'
import { cacheLife, cacheTag, revalidateTag } from 'next/cache'
import { z } from 'zod'

import {
  achievementLanguages,
  isAchievementLanguage,
  isAchievementProvider,
  setIdOf,
  type AchievementLanguage,
  type AchievementProvider,
  type AchievementStep,
  type DefinedSet,
  type GameAchievements,
  type ProgressAnswer,
  type ProgressTotal,
} from '@/domain/achievements/achievements'
import { dueWork, isDue, readOrder } from '@/domain/achievements/due'
import type { AchievementGame } from '@/domain/achievements/progress'
import type { Refusal } from '@/domain/library/adding'
import {
  achievementWall,
  unlocksOf,
  type AchievementOptions,
  type AchievementWall,
  type GameUnlocks,
} from '@/domain/library/trophy-achievements'
import { database, type Db } from '@/server/db/client'
import { entries, entryVersions, games } from '@/server/db/schema'
import { LibraryError } from '@/server/library/store'
import { spend } from '@/server/services/fair-use'
import { forAccount } from '@/server/services/for-account'
import { getLibrary, readMyLibrary } from '@/server/services/library'
import { achievementsTag, libraryTag } from '@/server/services/tags'
import {
  copiesOf,
  countAchievements,
  definedIds,
  fillDescriptions,
  knownOf,
  noteDefinitionsFailed,
  noteProgressFailed,
  progressUnchanged,
  readSetsOf,
  saveDefinitions,
  saveProgress,
  shelvedApps,
  type App,
} from '@/server/sync/achievements'
import { readLink } from '@/server/sync/memory'
import { SourceError } from '@/server/sync/source-error'
import { steam, TOTALS_PER_REQUEST, type Steam } from '@/server/sync/steam'

/**
 * Achievements (issue 72): reading them from a provider in steps, and
 * answering a game's page and a library's totals with them. A step reads
 * the games due, the latest played first, for a quarter of a minute; the
 * account page asks for steps until none is due, and the daily sync does
 * the same after each link's own sync. The provider first counts each
 * game's achievements and the account's unlocks, a hundred games a
 * question; a game is asked about on its own only for what that count
 * cannot tell: definitions not read yet, and unlocks that changed. A game
 * the provider fails on waits an hour and leaves the others' answers in
 * place.
 */

/** What is asked of a provider. */
type AchievementSource = {
  /**
   * A game's achievements in one language, with each one's share of the
   * provider's players, or nothing when it has none.
   */
  definitions: (game: string, language: AchievementLanguage) => Promise<DefinedSet | undefined>
  /**
   * How many achievements each of these games has, and how many the account
   * unlocked, by game. Undefined when the provider counted none of them, as
   * it does for an account that keeps its achievements private.
   */
  totals: (
    account: string,
    games: readonly string[],
  ) => Promise<Map<string, ProgressTotal> | undefined>
  progress: (account: string, game: string) => Promise<ProgressAnswer>
}

/**
 * How long a step goes on reading, checked before each few games: well
 * inside a function's minute, and often enough for the account page to show
 * how far it has got.
 */
export const STEP_MS = 15_000
/** Games read at the same time, so a provider is not asked too much at once. */
const AT_ONCE = 8

/** The site's languages besides English, whose definitions are read beside it. */
const TRANSLATED = achievementLanguages.filter((language) => language !== 'en')

export type AchievementsDeps = {
  db: Db
  steam: Steam
  /** How long a step goes on reading: tests make it short. */
  stepMs?: number
}

type Outcome = 'read' | 'none' | 'private' | 'unreachable'

/**
 * What the provider's count said of a step's next games: their totals; none
 * counted (`blank`), as for an account that keeps its achievements private;
 * or no answer (`failed`). Short of totals, each game is asked about on its own.
 */
type Counted = Map<string, ProgressTotal> | 'blank' | 'failed'

export const createAchievements = (deps: AchievementsDeps) => {
  const sources: Record<AchievementProvider, AchievementSource> = {
    steam: {
      definitions: (game, language) => deps.steam.gameAchievements(game, language),
      totals: (account, games) => deps.steam.achievementTotals(account, games),
      progress: (account, game) => deps.steam.playerAchievements(account, game),
    },
  }
  const stepMs = deps.stepMs ?? STEP_MS
  return (libraryId: string) => forLibrary(libraryId, deps.db, sources, stepMs)
}

const forLibrary = (
  libraryId: string,
  db: Db,
  sources: Record<AchievementProvider, AchievementSource>,
  stepMs: number,
) => {
  /**
   * One game's achievements, read as far as they are due, with what the
   * provider's count said of the step's games.
   */
  const readApp = async (
    provider: AchievementProvider,
    app: App,
    externalId: string,
    now: number,
    counted: Counted,
  ): Promise<Outcome> => {
    const source = sources[provider]
    const setId = setIdOf(provider, app.storeId)
    const total = counted instanceof Map ? counted.get(app.storeId) : undefined
    const work = dueWork(knownOf(app), externalId, now)
    let count = app.set?.count ?? null
    /** The definitions in English, as this read gave them. */
    let definedNow: DefinedSet | undefined
    let changed = false

    const define = async (): Promise<boolean> => {
      try {
        const [english, ...others] = await Promise.all([
          source.definitions(app.storeId, 'en'),
          // Another language not answering leaves the English in its place.
          ...TRANSLATED.map((language) =>
            source.definitions(app.storeId, language).catch(() => undefined),
          ),
        ])
        const translated: Partial<Record<AchievementLanguage, DefinedSet>> = {}
        TRANSLATED.forEach((language, at) => {
          const other = others[at]
          if (other) translated[language] = other
        })
        const saved = await saveDefinitions(db, provider, app.storeId, english, translated, now)
        count = saved.count
        changed ||= saved.changed
        definedNow = english ?? { achievements: [] }
        return true
      } catch (error) {
        if (!(error instanceof SourceError)) throw error
        await noteDefinitionsFailed(db, provider, app.storeId, now)
        return false
      }
    }

    // The provider counts another number than the set has: it changed since it was read.
    const recount = total !== undefined && count !== null && total.total !== count
    if (total?.total === 0 && (work.definitions || recount)) {
      // None, as the provider counts them: nothing to ask it about the game.
      const saved = await saveDefinitions(db, provider, app.storeId, undefined, {}, now)
      count = saved.count
      changed = saved.changed
    } else if ((work.definitions || recount) && !(await define()) && count === null) {
      return 'unreachable'
    }
    if (count === 0) return 'none'
    if (!work.progress && !changed) return 'read'

    // What the provider's count tells without asking for the unlocks one by one.
    const theirs = app.progress?.externalId === externalId ? app.progress : undefined
    const read = { externalId, copyId: app.copyId, playedAt: app.lastPlayedAt }
    if (total && total.total === count) {
      if (total.unlocked === 0) {
        // None unlocked: each one is locked, and there is no moment to ask for.
        await saveProgress(db, libraryId, setId, { ...read, unlocks: [], defined: new Set() }, now)
        return 'read'
      }
      // As many as last read, of a set that did not change just now: the same ones.
      if (!changed && theirs?.readAt && total.unlocked === app.unlocked) {
        await progressUnchanged(db, libraryId, setId, read, now)
        return 'read'
      }
    }

    const failed = (problem: 'private' | 'unreachable') =>
      noteProgressFailed(db, libraryId, setId, { externalId, copyId: app.copyId, problem }, now)
    /**
     * The unlocks a count names by key, as the definitions read now name
     * them, or as the provider gives them again; nothing if it does not.
     */
    const unlockedByKey = async (keys: readonly string[]) => {
      let set = definedNow
      if (!set) {
        try {
          set = await source.definitions(app.storeId, 'en')
        } catch (error) {
          if (!(error instanceof SourceError)) throw error
          return undefined
        }
      }
      const byKey = new Map(
        (set?.achievements ?? []).flatMap((each) => (each.key ? [[each.key, each.id]] : [])),
      )
      const ids = keys.map((key) => byKey.get(key))
      return ids.every((id) => id !== undefined) ? ids.map((id) => ({ id })) : undefined
    }
    let answer: ProgressAnswer
    try {
      answer = await source.progress(externalId, app.storeId)
    } catch (error) {
      if (!(error instanceof SourceError)) throw error
      await failed('unreachable')
      return 'unreachable'
    }
    if (answer.kind === 'private') {
      // Steam counted none of the account's games, and keeps this one's from Shelf too: the
      // account's achievements are private, and every game would say so.
      if (counted === 'blank') {
        await failed('private')
        return 'private'
      }
      // Steam counts the account's games, so this answer is this game's alone: Steam says it
      // of a game the account no longer owns, and its count of one has none unlocked.
      if (counted instanceof Map && !total?.unlocked) {
        await saveProgress(db, libraryId, setId, { ...read, unlocks: [], defined: new Set() }, now)
        return 'read'
      }
      // Steam says it too of a game it keeps from anonymous eyes for its content, adult games
      // first, and its count still names the unlocked ones: read from it, without the moments.
      if (total?.keys) {
        const unlocks = await unlockedByKey(total.keys)
        if (unlocks) {
          const defined = await definedIds(db, setId)
          await saveProgress(db, libraryId, setId, { ...read, unlocks, defined }, now)
          return 'read'
        }
      }
      // Whether the account's achievements are private is not known: asked again later.
      await failed('unreachable')
      return 'unreachable'
    }
    if (answer.kind === 'none') {
      // Definitions, but no stats to read them against: the provider contradicts itself.
      await failed('unreachable')
      return 'unreachable'
    }
    let defined = await definedIds(db, setId)
    // An unlock of something the definitions lack: the set changed since they were read.
    if (!definedNow && answer.unlocks.some((unlock) => !defined.has(unlock.id))) {
      if (await define()) defined = await definedIds(db, setId)
    }
    await fillDescriptions(db, setId, answer.descriptions)
    await saveProgress(db, libraryId, setId, { ...read, unlocks: answer.unlocks, defined }, now)
    return 'read'
  }

  const dueOf = (apps: readonly App[], externalId: string, now: number) =>
    apps.filter((app) => isDue(dueWork(knownOf(app), externalId, now)))

  /**
   * One step: the games due, the latest played first, until the step's time
   * is spent; at least a few, however slow the provider is. Their totals are
   * asked for a hundred at a time, as the step comes to them. A provider
   * that keeps the account's achievements private ends the step, since it
   * does the same for every game; one that keeps a single game's from Shelf
   * does not.
   */
  const step = async (
    provider: AchievementProvider,
    now = Date.now(),
  ): Promise<AchievementStep> => {
    const source = sources[provider]
    const link = await readLink(db, libraryId, provider)
    if (!link) throw new LibraryError('not-found', `This shelf is not linked to ${provider}`)
    const due = dueOf(await shelvedApps(db, libraryId, provider), link.externalId, now).sort(
      readOrder,
    )
    const ends = Date.now() + stepMs
    let read = 0
    let problem: AchievementStep['problem'] = null
    let started = false
    const goOn = () => problem !== 'private' && (!started || Date.now() < ends)
    reading: for (let from = 0; from < due.length && goOn(); from += TOTALS_PER_REQUEST) {
      const batch = due.slice(from, from + TOTALS_PER_REQUEST)
      const counted: Counted = await source
        .totals(
          link.externalId,
          batch.map((app) => app.storeId),
        )
        .then(
          (totals) => totals ?? 'blank',
          (error: unknown) => {
            if (error instanceof SourceError) return 'failed'
            throw error
          },
        )
      for (let at = 0; at < batch.length; at += AT_ONCE) {
        if (!goOn()) break reading
        started = true
        const outcomes = await Promise.all(
          batch
            .slice(at, at + AT_ONCE)
            .map((app) => readApp(provider, app, link.externalId, now, counted)),
        )
        for (const outcome of outcomes) {
          if (outcome === 'read' || outcome === 'none') read += 1
          else if (outcome === 'private') problem = 'private'
          else problem ??= 'unreachable'
        }
      }
    }
    const apps = await shelvedApps(db, libraryId, provider)
    return {
      read,
      remaining: dueOf(apps, link.externalId, now).length,
      counts: countAchievements(apps, link.externalId),
      problem,
    }
  }

  /** The entry a game's address names, if a visitor of this kind may see it. */
  const entryAt = async (slug: string, mine: boolean): Promise<string | undefined> => {
    const [row] = await db
      .select({
        entryId: entryVersions.entryId,
        relation: entryVersions.relation,
        archivedAt: entries.archivedAt,
        isPrivate: entries.isPrivate,
      })
      .from(games)
      .innerJoin(entryVersions, eq(entryVersions.gameId, games.id))
      .innerJoin(entries, eq(entries.id, entryVersions.entryId))
      .where(and(eq(games.slug, slug), eq(entryVersions.userId, libraryId)))
      .limit(1)
    if (!row || row.relation !== 'primary' || row.archivedAt !== null) return undefined
    // A private game is no visitor's: not its achievements either (spec 11.1).
    return row.isPrivate && !mine ? undefined : row.entryId
  }

  /**
   * A game's achievements, by its address, in the visitor's language.
   * Nothing for a game that is not there, or that this visitor may not see.
   */
  const game = async (
    slug: string,
    language: AchievementLanguage,
    { mine = false }: { mine?: boolean } = {},
  ): Promise<GameAchievements | undefined> => {
    const entryId = await entryAt(slug, mine)
    if (!entryId) return undefined
    const copyIds = (await copiesOf(db, [entryId])).get(entryId) ?? []
    const byCopy = await readSetsOf(db, libraryId, copyIds, language)
    return { sets: copyIds.flatMap((id) => byCopy.get(id) ?? []) }
  }

  /**
   * Each game's unlocks, for the trophy page (issue 68), over the games a
   * visitor of this kind may see: a private game's achievements count only
   * for its own account. A game with none known is left out.
   */
  const unlocks = async (
    language: AchievementLanguage,
    { mine = false }: { mine?: boolean } = {},
  ): Promise<GameUnlocks[]> => {
    const rows = await db
      .select({
        entryId: entryVersions.entryId,
        relation: entryVersions.relation,
        slug: games.slug,
        title: games.title,
        archivedAt: entries.archivedAt,
        isPrivate: entries.isPrivate,
      })
      .from(entryVersions)
      .innerJoin(entries, eq(entries.id, entryVersions.entryId))
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(eq(entryVersions.userId, libraryId))
    const shown = rows.filter(
      (row) => row.relation === 'primary' && row.archivedAt === null && (mine || !row.isPrivate),
    )
    const [copies, byCopy] = await Promise.all([
      copiesOf(
        db,
        shown.map((row) => row.entryId),
      ),
      readSetsOf(db, libraryId, 'all', language),
    ])
    const gamesWith: AchievementGame[] = shown.flatMap((row) => {
      const sets = (copies.get(row.entryId) ?? []).flatMap((id) => byCopy.get(id) ?? [])
      return sets.length > 0 ? [{ slug: row.slug, title: row.title, sets }] : []
    })
    return gamesWith.flatMap((each) => unlocksOf(each) ?? [])
  }

  return { step, game, unlocks }
}

/* For routes: this server's database and Steam. */

let shared: ReturnType<typeof createAchievements> | undefined
export const achievementsFor = (libraryId: string) =>
  (shared ??= createAchievements({ db: database(), steam: steam() }))(libraryId)

const invalid = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

/**
 * One step of reading the signed-in account's achievements at a provider.
 * A step that read any expires the trophy page's figures of them.
 */
export const readMyAchievements = (source: unknown) => {
  if (!isAchievementProvider(source)) return invalid()
  return forAccount(async (account) => {
    await spend(account, 'achievements')
    const step = await achievementsFor(account.id).step(source)
    if (step.read > 0) revalidateTag(achievementsTag(account.id), { expire: 0 })
    return step
  }, true)
}

/**
 * A public library's achievements on its trophy page (issue 68), in the
 * visitor's language. Kept until the library changes or a read of its
 * achievements does, and worked out again once a day besides, so "this
 * year" turns with the calendar. Kept where every server instance finds it,
 * as the trophy wall is (`getTrophyWall`).
 */
export const getAchievementWall = async (
  libraryId: string,
  language: AchievementLanguage,
  { scope, q, rarity }: AchievementOptions = {},
): Promise<AchievementWall> => {
  'use cache: remote'
  cacheTag(libraryTag(libraryId), achievementsTag(libraryId))
  cacheLife('days')
  const [library, unlocks] = await Promise.all([
    getLibrary(libraryId),
    achievementsFor(libraryId).unlocks(language),
  ])
  return achievementWall(library, unlocks, new Date().getUTCFullYear(), { scope, q, rarity })
}

/** The trophy page's achievements in the signed-in account's own library, private games among them. */
export const myAchievementWall = (language: AchievementLanguage, options: AchievementOptions) =>
  forAccount(async (account) => {
    const [library, unlocks] = await Promise.all([
      readMyLibrary(account.id),
      achievementsFor(account.id).unlocks(language, { mine: true }),
    ])
    return achievementWall(library, unlocks, new Date().getUTCFullYear(), options)
  })

/** The language a request asks for: one of the site's, English otherwise. */
export const languageOf = (value: unknown): AchievementLanguage =>
  isAchievementLanguage(value) ? value : 'en'

const slugParam = z.string().min(1).max(200)

/** A game's achievements in the signed-in account's own library, private games among them. */
export const myGameAchievements = (slug: unknown, language: AchievementLanguage) => {
  const parsed = slugParam.safeParse(slug)
  if (!parsed.success) return invalid()
  return forAccount(async (account) => {
    const found = await achievementsFor(account.id).game(parsed.data, language, { mine: true })
    if (!found) throw new LibraryError('not-found', `There is no game called ${parsed.data}`)
    return found
  })
}
