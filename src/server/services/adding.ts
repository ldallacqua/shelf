import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { LineageStep } from '@/domain/igdb/game'
import type { IgdbSearchHit } from '@/domain/igdb/schema'
import { foldSearchHits, type SearchResult } from '@/domain/igdb/search'
import {
  addInput,
  MAX_SEARCH,
  MIN_SEARCH,
  type Added,
  type AddedGame,
  type AddInput,
  type Answer,
  type Candidate,
  type Grouping,
  type Habits,
  type OnShelf,
  type PlatformLabel,
  type Refusal,
  type Rematched,
  type SearchAnswer,
} from '@/domain/library/adding'
import {
  confidenceOf,
  MAX_ADDITIONS,
  MAX_ALTERNATIVES,
  MAX_LINE_LENGTH,
  MAX_MATCH_LINES,
  parseLine,
  rankForLine,
  resolvePlatform,
  type LineMatch,
  type MatchAnswer,
  type PastedLine,
} from '@/domain/library/bulk'
import { proposeGrouping } from '@/domain/library/family'
import type { Format } from '@/domain/library/values'
import type { Platform } from '@/domain/platforms/platforms'
import type { Account } from '@/server/auth/account'
import { database, type Db } from '@/server/db/client'
import { copies, entries, entryVersions, games } from '@/server/db/schema'
import { igdb } from '@/server/igdb'
import type { IgdbApi } from '@/server/igdb/api'
import { readCoverArt } from '@/server/igdb/cover-art'
import { forAccount, refusalFor } from '@/server/services/for-account'
import { spend } from '@/server/services/fair-use'
import {
  createRecords,
  type FetchedRecords,
  type Records,
  type RecordsDeps,
} from '@/server/services/igdb-records'
import {
  addFromIgdb,
  findEntryIdBySlug,
  LibraryError,
  readLinkedMembers,
  readVersion,
  rematchEntry,
  removeEntry,
  undoJoin,
  type Placement,
  type RematchInto,
} from '@/server/library/store'

/**
 * Adding games (spec 4) to one library, the signed-in account's own:
 * searching IGDB, proposing where a game goes, and storing it. Nothing a
 * visitor can reach gets this far: every function below that is exported
 * for routes checks the account first, so a visitor cannot spend the IGDB
 * allowance either, and an account spends it only so fast (`fair-use.ts`).
 */

const label = (platform: Platform): PlatformLabel => ({
  id: platform.igdbId,
  key: platform.key,
  name: platform.name,
  short: platform.short,
})

export type AddingDeps = RecordsDeps

/**
 * The work itself, with its database and IGDB given, so tests can give
 * their own. What it returns is asked for one library at a time.
 */
export const createAdding = (deps: AddingDeps) => {
  // One per server, for every library: it keeps IGDB's list of platforms.
  const records = createRecords(deps)
  return (libraryId: string) => forLibrary(libraryId, { db: deps.db, api: deps.igdb, records })
}

type LibraryDeps = { db: Db; api: IgdbApi; records: Records }

const forLibrary = (libraryId: string, { db, api, records }: LibraryDeps) => {
  const { allPlatforms, namesOf, fetchRecords } = records
  /** Each linked IGDB record's entry, and each entry's address and title, in this library. */
  const shelfIndex = async () => {
    const [linked, primaries] = await Promise.all([
      readLinkedMembers(db, libraryId),
      db
        .select({ entryId: entryVersions.entryId, slug: games.slug, title: games.title })
        .from(entryVersions)
        .innerJoin(games, eq(games.id, entryVersions.gameId))
        .where(and(eq(entryVersions.relation, 'primary'), eq(entryVersions.userId, libraryId))),
    ])
    const entries = new Map(
      primaries.map((row) => [row.entryId, { slug: row.slug, title: row.title }]),
    )
    const byIgdbId = new Map(linked.map((member) => [member.igdbId, member.entryId]))
    return { linked, entries, byIgdbId }
  }

  const habits = async (): Promise<Habits> => {
    const rows = await db
      .select({ platformId: copies.platformId, format: copies.format })
      .from(copies)
      .innerJoin(entries, eq(entries.id, copies.entryId))
      .where(eq(entries.userId, libraryId))
      .orderBy(copies.createdAt, sql`${copies}.rowid`)
    const counts = new Map<number, number>()
    const formats: Record<number, Format> = {}
    for (const row of rows) {
      counts.set(row.platformId, (counts.get(row.platformId) ?? 0) + 1)
      formats[row.platformId] = row.format
    }
    const order = [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id)
    return { order, formats }
  }

  /** A result, marked with the entry it already is when I have it, under any version. */
  const markOnShelf =
    ({ byIgdbId, entries }: Awaited<ReturnType<typeof shelfIndex>>) =>
    (result: SearchResult): Candidate => {
      const entryId = [result.igdbId, ...result.ports]
        .map((id) => byIgdbId.get(id))
        .find((id) => id !== undefined)
      const onShelf = entryId ? entries.get(entryId) : undefined
      return onShelf ? { ...result, onShelf } : result
    }

  const labelsFor = (all: ReadonlyMap<number, Platform>, ids: Iterable<number>) =>
    [...new Set(ids)].flatMap((id) => {
      const platform = all.get(id)
      return platform ? [label(platform)] : []
    })

  /** Results as I type (spec 4.1): editions hidden, ports folded, and what I already have marked. */
  const search = async (text: string): Promise<SearchAnswer> => {
    const results = foldSearchHits(await api.search(text, 30))
    const [index, all, mine] = await Promise.all([shelfIndex(), allPlatforms(), habits()])
    return {
      results: results.map(markOnShelf(index)),
      platforms: labelsFor(
        all,
        results.flatMap((result) => [...result.platforms, ...result.alsoOn]),
      ),
      habits: mine,
    }
  }

  /**
   * A pasted list (spec 4.2): each line's match, how sure it is, and the
   * alternatives. Exact titles are asked ten to a request; a line with none
   * is searched on its own, the way typing it would be.
   */
  const match = async (lines: readonly PastedLine[]): Promise<MatchAnswer> => {
    const [exact, index, all, mine] = await Promise.all([
      api.findByTitles(lines.map((line) => line.title)),
      shelfIndex(),
      allPlatforms(),
      habits(),
    ])
    const labels = [...all.values()].map(label)
    const onShelf = markOnShelf(index)
    const matched = await Promise.all(
      lines.map(async (line, at): Promise<LineMatch> => {
        const same = exact[at] ?? []
        const hits: IgdbSearchHit[] = same.length > 0 ? same : await api.search(line.title, 20)
        const platformId = line.platform ? resolvePlatform(line.platform, labels)?.id : undefined
        const candidates = rankForLine(
          line,
          foldSearchHits(hits, 20).map(onShelf),
          platformId,
        ).slice(0, MAX_ALTERNATIVES)
        return {
          ...line,
          ...(platformId === undefined ? {} : { platformId }),
          confidence: confidenceOf(line, candidates[0]),
          candidates,
        }
      }),
    )
    return {
      lines: matched,
      platforms: labelsFor(
        all,
        matched.flatMap((line) => [
          ...(line.platformId === undefined ? [] : [line.platformId]),
          ...line.candidates.flatMap((candidate) => [...candidate.platforms, ...candidate.alsoOn]),
        ]),
      ),
      habits: mine,
    }
  }

  /** The record, its family chain, and where ADR 001 says it goes. */
  const place = async (igdbId: number) => {
    const [record] = await api.games([igdbId])
    if (!record) throw new LibraryError('not-found', 'IGDB has no game with that id')
    const lineage: LineageStep[] = (await api.lineages([record])).get(igdbId) ?? []
    const index = await shelfIndex()
    const proposal = proposeGrouping({ igdbId, lineage }, index.linked)
    return { record, lineage, proposal, index }
  }

  const ownedPlatforms = async (entryId: string): Promise<number[]> =>
    (
      await db
        .select({ platformId: copies.platformId })
        .from(copies)
        .where(eq(copies.entryId, entryId))
    ).map((row) => row.platformId)

  /** Where a game would go: what the form says before Add (spec 4.1, the "related" line). */
  const grouping = async (igdbId: number): Promise<Grouping> => {
    const { proposal, index } = await place(igdbId)
    const entryOf = (entryId: string): OnShelf =>
      index.entries.get(entryId) ?? { slug: '', title: '' }
    if (proposal.action === 'new') return { action: 'new' }
    if (proposal.action === 'already')
      return { action: 'already', entry: entryOf(proposal.entryId) }
    return {
      action: proposal.action,
      entry: { ...entryOf(proposal.entryId), platforms: await ownedPlatforms(proposal.entryId) },
      relation: proposal.relation,
      because: proposal.because,
      ask: proposal.ask,
    }
  }

  /** Stores one game, from what was fetched, where ADR 001 puts it among what is on the shelf now. */
  const store = async (input: AddInput, fetched: FetchedRecords): Promise<AddedGame> => {
    const data = fetched.data.get(input.igdbId)
    if (!data) throw new LibraryError('not-found', 'IGDB has no game with that id')
    const lineage = fetched.lineages.get(input.igdbId) ?? []
    const index = await shelfIndex()
    const proposal = proposeGrouping({ igdbId: input.igdbId, lineage }, index.linked)
    const { all } = fetched

    const platformIds = new Set([...data.platforms, ...input.copies.map((copy) => copy.platformId)])
    const platforms = [...platformIds].flatMap((id) => all.get(id) ?? [])
    if (input.copies.some((copy) => !all.has(copy.platformId))) {
      throw new LibraryError('invalid', 'A copy is on a platform IGDB does not know')
    }
    const names = namesOf(data, fetched.names)
    const art = fetched.art.get(input.igdbId)

    const wanted = input.copies.map((copy) => ({
      platformId: copy.platformId,
      format: copy.format,
    }))
    let placement: Placement
    if (proposal.action === 'already') {
      // Mine already: what is new is only the copies I did not have.
      const owned = await db
        .select({ platformId: copies.platformId, format: copies.format })
        .from(copies)
        .where(eq(copies.entryId, proposal.entryId))
      const have = new Set(owned.map((copy) => `${copy.platformId}:${copy.format}`))
      placement = {
        kind: 'join',
        entryId: proposal.entryId,
        copies: wanted.filter((copy) => !have.has(`${copy.platformId}:${copy.format}`)),
      }
    } else if (
      (proposal.action === 'join' && input.grouping !== 'separate') ||
      (proposal.action === 'separate' && input.grouping === 'join')
    ) {
      placement = {
        kind: 'join',
        entryId: proposal.entryId,
        version: proposal.relation === 'primary' ? 'other' : proposal.relation,
        copies: wanted,
      }
    } else {
      placement = {
        kind: 'entry',
        entry: {
          status: input.status,
          copies: wanted,
          ...(input.status === 'wishlist' && input.wanted?.length ? { wanted: input.wanted } : {}),
          ...(input.rating === undefined ? {} : { rating: input.rating }),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.completedOn ? { completedOn: input.completedOn } : {}),
        },
      }
    }

    const added = await addFromIgdb(
      db,
      libraryId,
      { data, lineage, ...(art ? { art } : {}), names, platforms },
      placement,
    )
    const entry =
      placement.kind === 'entry'
        ? { slug: data.slug, title: data.title }
        : index.entries.get(added.entryId)
    return {
      slug: entry?.slug ?? data.slug,
      title: entry?.title ?? data.title,
      version: await readVersion(db, libraryId),
      undo: added,
    }
  }

  const add = async (input: AddInput): Promise<AddedGame> =>
    store(input, await fetchRecords([input.igdbId]))

  /**
   * Many games (spec 4.2), from a reviewed list. IGDB is asked once for all
   * of them; each is then stored on its own, in order, so a game can fold
   * into one added a line before it, and one that fails leaves the rest.
   */
  const addMany = async (
    inputs: readonly AddInput[],
  ): Promise<{ results: Answer<AddedGame>[]; version: number }> => {
    const fetched = await fetchRecords(inputs.map((input) => input.igdbId))
    const results: Answer<AddedGame>[] = []
    for (const input of inputs) {
      try {
        results.push({ ok: true, value: await store(input, fetched) })
      } catch (error) {
        results.push(refusalFor(error))
      }
    }
    return { results, version: await readVersion(db, libraryId) }
  }

  const undoOne = async (added: Added) => {
    if (added.newEntry) await removeEntry(db, libraryId, added.entryId)
    else await undoJoin(db, libraryId, added)
  }

  /** Undo (spec 4.1): the game and everything added with it. */
  const undo = async (added: Added): Promise<number> => {
    await undoOne(added)
    return readVersion(db, libraryId)
  }

  /**
   * Undo for a list: last added first, so a game folded into one added
   * before it comes out of it first. One removed since is passed over.
   */
  const undoMany = async (list: readonly Added[]): Promise<number> => {
    for (const added of [...list].reverse()) {
      try {
        await undoOne(added)
      } catch (error) {
        if (!(error instanceof LibraryError && error.code === 'not-found')) throw error
      }
    }
    return readVersion(db, libraryId)
  }

  /**
   * A game on my shelf that is not the game it was taken for (spec 4.5,
   * "Not this game"), made the one I pick: where ADR 001 puts that game
   * among the rest of my shelf, as a sync would have put it, leaving out
   * the entry it was.
   */
  const rematch = async (idOrSlug: string, igdbId: number): Promise<Rematched> => {
    const entryId = /^[0-9a-f-]{36}$/.test(idOrSlug)
      ? idOrSlug
      : await findEntryIdBySlug(db, libraryId, idOrSlug)
    if (!entryId) throw new LibraryError('not-found', 'That game is not in the library')
    const fetched = await fetchRecords([igdbId])
    const data = fetched.data.get(igdbId)
    if (!data) throw new LibraryError('not-found', 'IGDB has no game with that id')
    const lineage = fetched.lineages.get(igdbId) ?? []
    // The entry's own records are the wrong game's: they draw nothing to them.
    const others = (await readLinkedMembers(db, libraryId)).filter(
      (member) => member.entryId !== entryId,
    )
    const proposal = proposeGrouping({ igdbId, lineage }, others)
    const into: RematchInto | undefined =
      proposal.action === 'already'
        ? { entryId: proposal.entryId }
        : proposal.action === 'join'
          ? {
              entryId: proposal.entryId,
              version: proposal.relation === 'primary' ? 'other' : proposal.relation,
            }
          : undefined
    const art = fetched.art.get(igdbId)
    const done = await rematchEntry(
      db,
      libraryId,
      entryId,
      {
        data,
        lineage,
        ...(art ? { art } : {}),
        names: namesOf(data, fetched.names),
        platforms: data.platforms.flatMap((id) => fetched.all.get(id) ?? []),
      },
      into,
    )
    const shown = (await shelfIndex()).entries.get(done.entryId)
    return {
      version: await readVersion(db, libraryId),
      entryId: done.entryId,
      slug: shown?.slug ?? data.slug,
      title: shown?.title ?? data.title,
      merged: done.merged,
    }
  }

  return { search, match, grouping, add, addMany, undo, undoMany, rematch }
}

/* For routes and actions: the signed-in account, on its own library, this server's IGDB. */

let shared: ReturnType<typeof createAdding> | undefined
const adding = (account: Account) =>
  (shared ??= createAdding({ db: database(), igdb: igdb(), readArt: (id) => readCoverArt(id) }))(
    account.id,
  )

const searchText = z.string().trim().min(MIN_SEARCH).max(MAX_SEARCH)
const igdbId = z.number().int().positive()

const addedShape = z.object({
  entryId: z.string().min(1),
  gameId: z.string().min(1),
  newEntry: z.boolean(),
  newVersion: z.boolean(),
  copyIds: z.array(z.string().min(1)).max(30),
})

export const searchToAdd = (text: unknown) => {
  const parsed = searchText.safeParse(text)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount(async (account) => {
    await spend(account, 'search')
    return adding(account).search(parsed.data)
  })
}

export const groupingFor = (id: unknown) => {
  const parsed = igdbId.safeParse(id)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount(async (account) => {
    await spend(account, 'search')
    return adding(account).grouping(parsed.data)
  })
}

export const addMyGame = (input: unknown) => {
  const parsed = addInput.safeParse(input)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount(async (account) => {
    await spend(account, 'add')
    return adding(account).add(parsed.data)
  }, true)
}

export const undoMyAdd = (added: unknown) => {
  const parsed = addedShape.safeParse(added)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount((account) => adding(account).undo(parsed.data), true)
}

/** Lines as pasted, each naming a game. */
const pastedLines = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .max(MAX_LINE_LENGTH * 2),
  )
  .min(1)
  .max(MAX_MATCH_LINES)

export const matchMine = (lines: unknown) => {
  const parsed = pastedLines.safeParse(lines)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  // One answer a line: a line that is all brackets is searched as written.
  const pasted = parsed.data.map((text) => parseLine(text) ?? { text, title: text })
  return forAccount(async (account) => {
    await spend(account, 'match')
    return adding(account).match(pasted)
  })
}

export const addManyOfMine = (inputs: unknown) => {
  const parsed = z.array(addInput).min(1).max(MAX_ADDITIONS).safeParse(inputs)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount(async (account) => {
    await spend(account, 'add', parsed.data.length)
    return adding(account).addMany(parsed.data)
  }, true)
}

/** Which game on IGDB one of my games is. */
const rematchInput = z.tuple([z.string().min(1).max(200), z.object({ igdbId })])

/** One of my games taken for the wrong one, made the game I pick (spec 4.5). */
export const rematchMine = (id: unknown, body: unknown) => {
  const parsed = rematchInput.safeParse([id, body])
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  const [entry, { igdbId: picked }] = parsed.data
  return forAccount(async (account) => {
    await spend(account, 'add')
    return adding(account).rematch(entry, picked)
  }, true)
}

export const undoManyOfMine = (list: unknown) => {
  const parsed = z.array(addedShape).min(1).max(MAX_ADDITIONS).safeParse(list)
  if (!parsed.success) return Promise.resolve<Refusal>({ ok: false, reason: 'invalid' })
  return forAccount((account) => adding(account).undoMany(parsed.data), true)
}
