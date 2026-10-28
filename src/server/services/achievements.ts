import 'server-only'

import { and, eq } from 'drizzle-orm'
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
} from '@/domain/achievements/achievements'
import { dueWork, isDue, readOrder } from '@/domain/achievements/due'
import {
  summarize,
  type AchievementGame,
  type AchievementSummary,
} from '@/domain/achievements/progress'
import type { Refusal } from '@/domain/library/adding'
import { database, type Db } from '@/server/db/client'
import { entries, entryVersions, games } from '@/server/db/schema'
import { LibraryError } from '@/server/library/store'
import { spend } from '@/server/services/fair-use'
import { forAccount } from '@/server/services/for-account'
import {
  copiesOf,
  countAchievements,
  definedIds,
  fillDescriptions,
  knownOf,
  noteDefinitionsFailed,
  noteProgressFailed,
  readSetsOf,
  saveDefinitions,
  saveProgress,
  saveRates,
  shelvedApps,
  type App,
} from '@/server/sync/achievements'
import { readLink } from '@/server/sync/memory'
import { SourceError } from '@/server/sync/source-error'
import { steam, type Steam } from '@/server/sync/steam'

/**
 * Achievements (issue 72): reading them from a provider in steps, and
 * answering a game's page and a library's totals with them. A step reads
 * the next few games due, the latest played first, a few at a time; the
 * account page asks for steps until none is due, and the daily sync does
 * the same after each link's own sync. A game the provider fails on waits
 * an hour and leaves the others' answers in place.
 */

/** What is asked of a provider. */
type AchievementSource = {
  /** A game's achievements in one language, or nothing when it has none. */
  definitions: (game: string, language: AchievementLanguage) => Promise<DefinedSet | undefined>
  progress: (account: string, game: string) => Promise<ProgressAnswer>
  /** Each achievement's share of the provider's players, by its id. */
  rates: (game: string) => Promise<Map<string, number>>
}

/** Games read in one step: a few requests each, a step well inside a function's time. */
export const READ_PER_STEP = 10
/** Games read at the same time, so a provider is not asked too much at once. */
const AT_ONCE = 4

/** The site's languages besides English, whose definitions are read beside it. */
const TRANSLATED = achievementLanguages.filter((language) => language !== 'en')

export type AchievementsDeps = { db: Db; steam: Steam }

type Outcome = 'read' | 'none' | 'private' | 'unreachable'

export const createAchievements = (deps: AchievementsDeps) => {
  const sources: Record<AchievementProvider, AchievementSource> = {
    steam: {
      definitions: (game, language) => deps.steam.achievementSchema(game, language),
      progress: (account, game) => deps.steam.playerAchievements(account, game),
      rates: (game) => deps.steam.unlockRates(game),
    },
  }
  return (libraryId: string) => forLibrary(libraryId, deps.db, sources)
}

const forLibrary = (
  libraryId: string,
  db: Db,
  sources: Record<AchievementProvider, AchievementSource>,
) => {
  /** One game's achievements, read as far as they are due. */
  const readApp = async (
    provider: AchievementProvider,
    app: App,
    externalId: string,
    now: number,
  ): Promise<Outcome> => {
    const source = sources[provider]
    const setId = setIdOf(provider, app.storeId)
    const work = dueWork(knownOf(app), externalId, now)
    let count = app.set?.count ?? null
    let definedNow = false
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
        definedNow = true
        return true
      } catch (error) {
        if (!(error instanceof SourceError)) throw error
        await noteDefinitionsFailed(db, provider, app.storeId, now)
        return false
      }
    }

    if (work.definitions && !(await define()) && count === null) return 'unreachable'
    if (count === 0) return 'none'
    if (work.rates) {
      // Rates are a nicety: without them, the list shows no rarity, and the next read tries again.
      const rates = await source.rates(app.storeId).catch((error: unknown) => {
        if (error instanceof SourceError) return undefined
        throw error
      })
      if (rates) await saveRates(db, setId, rates, now)
    }
    if (!work.progress && !changed) return 'read'

    const failed = (problem: 'private' | 'unreachable') =>
      noteProgressFailed(db, libraryId, setId, { externalId, copyId: app.copyId, problem }, now)
    let answer: ProgressAnswer
    try {
      answer = await source.progress(externalId, app.storeId)
    } catch (error) {
      if (!(error instanceof SourceError)) throw error
      await failed('unreachable')
      return 'unreachable'
    }
    if (answer.kind === 'private') {
      await failed('private')
      return 'private'
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
    await saveProgress(
      db,
      libraryId,
      setId,
      {
        externalId,
        copyId: app.copyId,
        playedAt: app.lastPlayedAt,
        unlocks: answer.unlocks,
        defined,
      },
      now,
    )
    return 'read'
  }

  const dueOf = (apps: readonly App[], externalId: string, now: number) =>
    apps.filter((app) => isDue(dueWork(knownOf(app), externalId, now)))

  /**
   * One step: the next games due, the latest played first. A provider that
   * keeps the account's achievements private ends the step, since it does
   * the same for every game.
   */
  const step = async (
    provider: AchievementProvider,
    now = Date.now(),
  ): Promise<AchievementStep> => {
    const link = await readLink(db, libraryId, provider)
    if (!link) throw new LibraryError('not-found', `This shelf is not linked to ${provider}`)
    const batch = dueOf(await shelvedApps(db, libraryId, provider), link.externalId, now)
      .sort(readOrder)
      .slice(0, READ_PER_STEP)
    let read = 0
    let problem: AchievementStep['problem'] = null
    for (let at = 0; at < batch.length && problem !== 'private'; at += AT_ONCE) {
      const outcomes = await Promise.all(
        batch.slice(at, at + AT_ONCE).map((app) => readApp(provider, app, link.externalId, now)),
      )
      for (const outcome of outcomes) {
        if (outcome === 'read' || outcome === 'none') read += 1
        else if (outcome === 'private') problem = 'private'
        else problem ??= 'unreachable'
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
   * The library's achievement totals (issue 72, for the trophy page of issue
   * 68), over the games a visitor of this kind may see: a private game's
   * achievements count only for its own account.
   */
  const summary = async (
    language: AchievementLanguage,
    { mine = false }: { mine?: boolean } = {},
  ): Promise<AchievementSummary> => {
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
    return summarize(gamesWith)
  }

  return { step, game, summary }
}

/* For routes: this server's database and Steam. */

let shared: ReturnType<typeof createAchievements> | undefined
export const achievementsFor = (libraryId: string) =>
  (shared ??= createAchievements({ db: database(), steam: steam() }))(libraryId)

const invalid = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

/** One step of reading the signed-in account's achievements at a provider. */
export const readMyAchievements = (source: unknown) => {
  if (!isAchievementProvider(source)) return invalid()
  return forAccount(async (account) => {
    await spend(account, 'achievements', READ_PER_STEP)
    return achievementsFor(account.id).step(source)
  }, true)
}

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
