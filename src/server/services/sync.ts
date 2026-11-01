import 'server-only'

import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { foldSearchHits } from '@/domain/igdb/search'
import type { Refusal } from '@/domain/library/adding'
import { proposeGrouping } from '@/domain/library/family'
import { isFormat, type Format, type SyncSource } from '@/domain/library/values'
import {
  firstStatus,
  isOwnedFormat,
  stateOf,
  type Reported,
  type StoreKindOf,
} from '@/domain/sync/items'
import { chooseByStoreId } from '@/domain/sync/ladder'
import {
  itemLists,
  type ItemList,
  type ItemMatch,
  type ItemView,
  type SyncStep,
} from '@/domain/sync/link'
import { copyPlatform, isSyncSource, platformsFor, SOURCES } from '@/domain/sync/sources'
import { gameOfMode, matchByTitle, spellingsOf, strippedTitle } from '@/domain/sync/titles'
import type { Account } from '@/server/auth/account'
import { imageUrl } from '@/domain/igdb/images'
import { database, type Db } from '@/server/db/client'
import { copies, entryVersions, games } from '@/server/db/schema'
import { igdb } from '@/server/igdb'
import type { IgdbApi } from '@/server/igdb/api'
import { IgdbError } from '@/server/igdb/client'
import { readCoverArt } from '@/server/igdb/cover-art'
import { readOwnerPlay } from '@/server/library/read'
import {
  addFromSource,
  addStoredFromSource,
  feedCopies,
  LibraryError,
  readLinkedMembers,
  readVersion,
  type Placement,
} from '@/server/library/store'
import { spend, TooManyError } from '@/server/services/fair-use'
import { forAccount } from '@/server/services/for-account'
import { createRecords, type Records, type RecordsDeps } from '@/server/services/igdb-records'
import {
  confirmItems,
  decideItem,
  dueLinks,
  forgetLink,
  itemsOfApps,
  listedTitles,
  listItems,
  noteRead,
  noteSynced,
  readItem,
  readLink,
  readLinks,
  recordReport,
  saveKinds,
  saveLink,
  saveResolutions,
  setDaily,
  unclassified,
  unmatched,
  viewOf,
  waitingToAdd,
  type Item,
  type Link,
  type Linked,
  type Resolved,
} from '@/server/sync/memory'
import { nintendo, type Nintendo } from '@/server/sync/nintendo'
import { isAchievementProvider } from '@/domain/achievements/achievements'
import { achievementsFor } from '@/server/services/achievements'
import { achievementsTag } from '@/server/services/tags'
import { open, seal } from '@/server/sync/sealed'
import { SourceError } from '@/server/sync/source-error'
import { steam, type Steam } from '@/server/sync/steam'

/**
 * Syncing a library from a store or console (ADR 003). One step reads the
 * source when asked, matches what it lists up the ladder, puts matched games
 * on the shelf twenty at a time, and brings their hours up to date; the page
 * asks for steps until nothing is left. What a source can tell is in
 * `domain/sync/sources.ts`, how to ask it in its adapter; everything below
 * is the same for every source.
 */

/** The account at a source, as the sync reads it: its id there, and its sign-in's secret, opened. */
type SourceAccount = { externalId: string; secret?: string }

/** What the sync asks of a source. */
type Adapter = {
  /** Everything it lists for the account there; undefined when the account hides it. */
  list: (account: SourceAccount) => Promise<Reported[] | undefined>
  /** Only these of what it lists for the account; one it does not list is left out. */
  some?: (externalId: string, storeIds: readonly string[]) => Promise<Reported[] | undefined>
  /** The account's name there, for the page. */
  name?: (externalId: string) => Promise<string | undefined>
  /** What its store says each item is; one it could not ask about is left out. */
  kinds?: (
    items: readonly { storeId: string; title: string }[],
  ) => Promise<Map<string, StoreKindOf>>
}

/** Games put on the shelf by one step: a few IGDB requests, and a step well inside a function's time. */
export const ADD_PER_STEP = 20
/** Titles asked of IGDB in one step, ten to a request. */
const TITLES_PER_STEP = 60
/** Items the store is asked about in one step: a library as large as fair use lets in at once. */
const KINDS_PER_STEP = 2_000
/** A title IGDB did not know is asked about again after this long: IGDB grows. */
const TITLE_AGAIN_MS = 7 * 24 * 60 * 60 * 1000
/** "Sync now" twice inside this reads the source once. */
const READ_AGAIN_MS = 60 * 1000

export type SyncDeps = RecordsDeps & { steam: Steam; nintendo: Nintendo }

export const createSync = (deps: SyncDeps) => {
  // One per server, for every library: it keeps IGDB's list of platforms.
  const records = createRecords(deps)
  const adapters: Partial<Record<SyncSource, Adapter>> = {
    steam: {
      list: ({ externalId }) => deps.steam.ownedGames(externalId),
      some: (externalId, storeIds) => deps.steam.ownedGames(externalId, storeIds),
      name: (id) => deps.steam.playerName(id),
      kinds: (items) => deps.steam.appKinds(items),
    },
    nintendo: {
      list: ({ secret }) => {
        if (!secret)
          throw new SourceError('signed-out', 'There is no Nintendo session to read with.')
        return deps.nintendo.playHistory(secret)
      },
    },
  }
  return (libraryId: string) =>
    forLibrary(libraryId, { db: deps.db, api: deps.igdb, records, adapters })
}

type LibraryDeps = {
  db: Db
  api: IgdbApi
  records: Records
  adapters: Partial<Record<SyncSource, Adapter>>
}

/** Asked before games are put on the shelf, with how many; throws to refuse. */
export type Allowance = (games: number) => Promise<void>

const forLibrary = (libraryId: string, { db, api, records, adapters }: LibraryDeps) => {
  const linkOf = async (source: SyncSource): Promise<Link> => {
    const link = await readLink(db, libraryId, source)
    if (!link) throw new LibraryError('not-found', `This shelf is not linked to ${source}`)
    return link
  }

  /** The source's list, remembered; the link says how it went. */
  const read = async (link: Link, now: number): Promise<Link> => {
    const adapter = adapters[link.source]
    if (!adapter) throw new LibraryError('invalid', `${link.source} cannot be synced yet`)
    try {
      // A secret this server cannot open (another key, another link) is a sign-in to make again.
      const secret = link.secret ? open(link.secret, libraryId, link.source) : undefined
      if (link.secret && secret === undefined) {
        throw new SourceError('signed-out', 'The sealed session does not open here.')
      }
      const listed = await adapter.list({
        externalId: link.externalId,
        ...(secret ? { secret } : {}),
      })
      if (!listed) {
        await noteRead(db, libraryId, link.source, { problem: 'private' })
      } else {
        const name = await adapter.name?.(link.externalId).catch(() => undefined)
        await recordReport(db, libraryId, link.source, SOURCES[link.source].evidence, listed, now)
        await noteRead(db, libraryId, link.source, { at: now, ...(name ? { name } : {}) })
      }
    } catch (error) {
      if (!(error instanceof SourceError)) throw error
      await noteRead(db, libraryId, link.source, { problem: error.problem })
    }
    return linkOf(link.source)
  }

  /**
   * Before the ladder: what the store says each new item is. A demo, software
   * or a video is left out as "not a game"; a part is matched by its game.
   * When the store does not answer, the ladder goes on without it, and the
   * next read of the list asks again.
   */
  const classify = async (source: SyncSource, now: number) => {
    const ask = adapters[source]?.kinds
    if (!ask) return
    const items = await unclassified(db, libraryId, source, KINDS_PER_STEP)
    if (items.length === 0) return
    const kinds = await ask(items).catch((error: unknown) => {
      if (error instanceof SourceError) return new Map<string, StoreKindOf>()
      throw error
    })
    // A mode the store names no game for joins the game I have under the title it starts
    // with; with none, the ladder takes it as a game of its own.
    const orphans = items.filter((item) => {
      const said = kinds.get(item.storeId)
      return said?.kind === 'part' && !said.parentStoreId
    })
    if (orphans.length > 0) {
      const listed = await listedTitles(db, libraryId, source)
      for (const item of orphans) {
        const game = gameOfMode(item.title, listed)
        kinds.set(item.storeId, game ? { kind: 'part', parentStoreId: game } : { kind: 'game' })
      }
    }
    await saveKinds(db, libraryId, items, kinds, now)
  }

  /**
   * The ladder's second and third rungs (ADR 003, decision 1) over items no
   * rung has matched. Store ids are asked for every such item when the list
   * was just read, as IGDB adds them; titles for the next few not asked about
   * this week. A matched game the source owns becomes a copy; a played one
   * waits for my answer. Returns how many titles are left to ask about.
   * `only`: these items, and no other.
   */
  const resolve = async (
    source: SyncSource,
    allStoreIds: boolean,
    now: number,
    only?: ReadonlySet<string>,
  ) => {
    const facts = SOURCES[source]
    const decision = facts.evidence === 'owned' ? 'copy' : 'pending'
    const resolved: Resolved[] = []
    const take = (item: Item, igdbId: number, by: Resolved['by']) =>
      resolved.push({ id: item.id, igdbId, by, decision })

    let left = (await unmatched(db, libraryId, source, 10_000)).filter(
      (item) => !only || only.has(item.id),
    )
    const due = (item: Item) =>
      item.titleTriedAt === null || now - item.titleTriedAt > TITLE_AGAIN_MS
    const batch = left.filter(due).slice(0, TITLES_PER_STEP)

    const byStore = allStoreIds ? left : batch.filter((item) => item.titleTriedAt === null)
    // A part is its game's: a multiplayer mode's hours belong on the game's copy.
    const storeIdOf = (item: Item) =>
      item.kind === 'part' && item.parentStoreId ? item.parentStoreId : item.storeId
    if (facts.store && byStore.length > 0) {
      const found = await api.byStoreIds(facts.store, byStore.map(storeIdOf))
      for (const item of byStore) {
        const igdbId = chooseByStoreId(found.get(storeIdOf(item)) ?? [])
        if (igdbId !== undefined) take(item, igdbId, 'store_id')
      }
    }

    const matched = new Set(resolved.map((item) => item.id))
    const titled = batch.filter((item) => !matched.has(item.id))
    const tried: string[] = []
    if (titled.length > 0) {
      const query = (item: Item) => ({
        title: item.title,
        platforms: platformsFor(source, item.platformId),
        ...(item.year ? { year: item.year } : {}),
      })
      // IGDB's games named any way each title may be spelled, one list a title.
      const named = async (titles: readonly string[]) => {
        const spellings = titles.map(spellingsOf)
        const found = await api.findByTitles(spellings.flat())
        let at = 0
        return spellings.map((each) => each.flatMap(() => found[at++] ?? []))
      }
      const exact = await named(titled.map((item) => item.title))
      const again: Item[] = []
      const missed: Item[] = []
      titled.forEach((item, at) => {
        const match = matchByTitle(query(item), foldSearchHits(exact[at] ?? [], 20))
        if (match) take(item, match.igdbId, 'title')
        else if (strippedTitle(item.title) !== item.title.trim()) again.push(item)
        else missed.push(item)
      })
      // Asked again without the marks and edition words, for those the title as written did not find.
      const stripped =
        again.length > 0 ? await named(again.map((item) => strippedTitle(item.title))) : []
      again.forEach((item, at) => {
        const match = matchByTitle(query(item), foldSearchHits(stripped[at] ?? [], 20))
        if (match) take(item, match.igdbId, 'title')
        else missed.push(item)
      })
      // And by its words, for a name IGDB punctuates otherwise: "Xtreme 3 Scarlet" is its
      // "Xtreme 3: Scarlet". The rung still takes only the same words in the same order.
      const worded =
        missed.length > 0
          ? await api.findByWords(missed.map((item) => strippedTitle(item.title)))
          : []
      missed.forEach((item, at) => {
        const match = matchByTitle(query(item), foldSearchHits(worded[at] ?? [], 20))
        if (match) take(item, match.igdbId, 'title')
        else tried.push(item.id)
      })
    }
    await saveResolutions(db, resolved, tried, now)

    const done = new Set([...resolved.map((item) => item.id), ...tried])
    left = left.filter((item) => !done.has(item.id))
    return left.filter(due).length
  }

  /**
   * The ladder's first look, at what no rung of IGDB's can find: a game in the catalog because a
   * moderator read it from Steam (ADR 006), recognized by its app. On my shelf it gets the copy
   * and keeps everything I set, a wishlist status too, as a game from IGDB does; if not, it starts
   * as any game a sync adds. An item I answered is left as I answered it, which is `unmatched`'s
   * own rule. Before the other rungs, so a title can't take it for another game.
   */
  const recognize = async (
    source: SyncSource,
    now: number,
    only?: ReadonlySet<string>,
  ): Promise<number> => {
    const facts = SOURCES[source]
    if (facts.store !== 'steam' || !facts.format) return 0
    const format = facts.format
    const items = (await unmatched(db, libraryId, source, 10_000)).filter(
      (item) => !only || only.has(item.id),
    )
    if (items.length === 0) return 0
    const held = await db
      .select({ id: games.id, appId: games.steamAppId, platforms: games.platforms })
      .from(games)
      .where(isNotNull(games.steamAppId))
    const byApp = new Map(held.map((game) => [game.appId, game]))
    let added = 0
    for (const item of items) {
      const game = byApp.get(item.storeId)
      if (!game) continue
      const platformId = copyPlatform(source, item.platformId, game.platforms)
      if (platformId === undefined) continue
      const [mine] = await db
        .select({ entryId: entryVersions.entryId })
        .from(entryVersions)
        .where(and(eq(entryVersions.gameId, game.id), eq(entryVersions.userId, libraryId)))
        .limit(1)
      const copy = { platformId, format }
      const placement: Placement = mine
        ? {
            kind: 'join',
            entryId: mine.entryId,
            copies: (await hasCopy(mine.entryId, platformId, format)) ? [] : [copy],
          }
        : {
            kind: 'entry',
            entry: {
              status: firstStatus(
                item.lastPlayedAt ? { lastPlayedAt: item.lastPlayedAt } : {},
                now,
              ),
              copies: [copy],
            },
          }
      await addStoredFromSource(
        db,
        libraryId,
        game.id,
        placement,
        {
          source,
          itemIds: [item.id],
          platformId,
          format,
          items: { decision: 'copy', resolvedBy: 'store_id' },
        },
        now,
      )
      added += 1
    }
    return added
  }

  /** Whether the entry already has a copy on that platform, in that format. */
  const hasCopy = async (entryId: string, platformId: number, format: string) =>
    (
      await db
        .select({ id: copies.id })
        .from(copies)
        .where(
          and(
            eq(copies.entryId, entryId),
            eq(copies.platformId, platformId),
            eq(copies.format, format as 'physical' | 'digital'),
          ),
        )
        .limit(1)
    ).length > 0

  /**
   * Matched games onto the shelf, at most `limit` (ADR 003, decision 2): a
   * game already there under any version gets the copy, never a second
   * entry, and keeps everything I set; a new one starts unsorted, or as
   * playing if the source saw me play it in the last two weeks. Items
   * naming the same record feed one copy, on the platform the record is on
   * of those the item's console plays (`copyPlatform`).
   */
  const addSome = async (
    source: SyncSource,
    limit: number,
    now: number,
    allow?: Allowance,
    only?: ReadonlySet<string>,
  ) => {
    const facts = SOURCES[source]
    const groups = new Map<number, Item[]>()
    for (const item of await waitingToAdd(db, libraryId, source)) {
      if (only && !only.has(item.id)) continue
      groups.set(item.igdbId!, [...(groups.get(item.igdbId!) ?? []), item])
    }
    const chosen = [...groups].slice(0, limit)
    if (chosen.length === 0) return { added: 0, remaining: 0 }
    await allow?.(chosen.length)
    const fetched = await records.fetchRecords(chosen.map(([igdbId]) => igdbId))

    let added = 0
    for (const [igdbId, items] of chosen) {
      const data = fetched.data.get(igdbId)
      const first = items[0]!
      const platformId = data ? copyPlatform(source, first.platformId, data.platforms) : undefined
      const format = first.format && isOwnedFormat(first.format) ? first.format : facts.format
      if (!data || platformId === undefined || format === undefined) {
        // IGDB no longer has the record: the items go back to me.
        for (const item of items) {
          await decideItem(db, libraryId, item.id, { decision: 'pending' }, now)
        }
        continue
      }
      const lineage = fetched.lineages.get(igdbId) ?? []
      const proposal = proposeGrouping({ igdbId, lineage }, await readLinkedMembers(db, libraryId))
      const copy = { platformId, format }
      let placement: Placement
      if (proposal.action === 'already' || proposal.action === 'join') {
        const copiesToAdd = (await hasCopy(proposal.entryId, platformId, format)) ? [] : [copy]
        placement =
          proposal.action === 'already'
            ? { kind: 'join', entryId: proposal.entryId, copies: copiesToAdd }
            : {
                kind: 'join',
                entryId: proposal.entryId,
                version: proposal.relation === 'primary' ? 'other' : proposal.relation,
                copies: copiesToAdd,
              }
      } else {
        // Nothing related on the shelf, or only a game this one remakes: a game of its own.
        const played = Math.max(0, ...items.map((item) => item.lastPlayedAt ?? 0))
        placement = {
          kind: 'entry',
          entry: {
            status: firstStatus(played ? { lastPlayedAt: played } : {}, now),
            copies: [copy],
          },
        }
      }
      const art = fetched.art.get(igdbId)
      const platformIds = new Set([...data.platforms, platformId])
      await addFromSource(
        db,
        libraryId,
        {
          data,
          lineage,
          ...(art ? { art } : {}),
          names: records.namesOf(data, fetched.names),
          platforms: [...platformIds].flatMap((id) => fetched.all.get(id) ?? []),
        },
        placement,
        { source, itemIds: items.map((item) => item.id), platformId, format },
        now,
      )
      added += 1
    }
    return { added, remaining: groups.size - chosen.length }
  }

  /**
   * One step of a sync. `read`: ask the source for its list first, unless it
   * answered a moment ago. The page asks again while `remaining` is above 0.
   */
  const step = async (
    source: SyncSource,
    { read: wanted = false, allow }: { read?: boolean; allow?: Allowance } = {},
    now = Date.now(),
  ): Promise<SyncStep> => {
    let link = await linkOf(source)
    const fresh =
      wanted && (link.readAt === null || link.problem !== null || now - link.readAt > READ_AGAIN_MS)
    if (fresh) {
      link = await read(link, now)
      // Only after a read, which is all that brings new items: a store that is
      // down then costs one wait a sync, not one a step.
      await classify(source, now)
    }
    const recognized = await recognize(source, now)
    const titlesLeft = await resolve(source, fresh, now)
    const { added: fromIgdb, remaining } = await addSome(source, ADD_PER_STEP, now, allow)
    const added = recognized + fromIgdb
    await feedCopies(db, libraryId, source, now)
    const left = titlesLeft + remaining
    if (left === 0 && link.problem === null && link.readAt !== null) {
      await noteSynced(db, libraryId, source, now)
    }
    return {
      link: await viewOf(db, await linkOf(source)),
      added,
      remaining: left,
      version: await readVersion(db, libraryId),
    }
  }

  /**
   * A few games asked about by themselves, the whole list left unread (the owner, 1 Nov 2026: "So
   * aquele jogo [...] Não precisa syncar tudo"). What the source says of them goes as in a step; an
   * app it does not list for me changes nothing, and nothing says the source was read just now.
   */
  const someGames = async (
    source: SyncSource,
    storeIds: readonly string[],
    allow?: Allowance,
    now = Date.now(),
  ) => {
    const link = await readLink(db, libraryId, source)
    const some = adapters[source]?.some
    if (!link || !some || storeIds.length === 0) return
    const listed = await some(link.externalId, storeIds)
    if (!listed || listed.length === 0) return
    await recordReport(db, libraryId, source, SOURCES[source].evidence, listed, now)
    await classify(source, now)
    const items = await itemsOfApps(
      db,
      libraryId,
      source,
      listed.map((item) => item.storeId),
    )
    const only = new Set(items.map((item) => item.id))
    await recognize(source, now, only)
    await resolve(source, true, now, only)
    await addSome(source, ADD_PER_STEP, now, allow, only)
    await feedCopies(db, libraryId, source, now)
  }

  /** The game on my shelf a copy is part of, for the lists. */
  const shelvedAs = async (copyIds: readonly string[]) => {
    if (copyIds.length === 0) return new Map<string, { slug: string; title: string }>()
    const rows = await db
      .select({ copyId: copies.id, slug: games.slug, title: games.title })
      .from(copies)
      .innerJoin(entryVersions, eq(entryVersions.entryId, copies.entryId))
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .where(and(inArray(copies.id, [...copyIds]), eq(entryVersions.relation, 'primary')))
    return new Map(rows.map((row) => [row.copyId, { slug: row.slug, title: row.title }]))
  }

  const toView = (item: Item, onShelf?: { slug: string; title: string }): ItemView => ({
    id: item.id,
    title: item.title,
    storeId: item.storeId,
    minutes: item.minutes,
    lastPlayedAt: item.lastPlayedAt,
    lastSeenAt: item.lastSeenAt,
    state: stateOf(item),
    decision: item.decision,
    kind: item.kind,
    ...(onShelf ? { onShelf } : {}),
  })

  /**
   * The games items waiting for me were matched to, as the lists show them.
   * IGDB not answering leaves them without: the rows then ask as unmatched ones do.
   */
  const matchesOf = async (items: readonly Item[]): Promise<Map<number, ItemMatch>> => {
    const ids = [
      ...new Set(
        items.flatMap((item) =>
          item.decision === 'pending' && item.igdbId !== null ? [item.igdbId] : [],
        ),
      ),
    ]
    if (ids.length === 0) return new Map()
    const found = await api.games(ids).catch(() => [])
    return new Map(
      found.map((game) => [
        game.id,
        {
          igdbId: game.id,
          title: game.name,
          year: game.first_release_date
            ? new Date(game.first_release_date * 1000).getUTCFullYear()
            : null,
          cover: game.cover?.image_id ? imageUrl(game.cover.image_id, 'cover_big') : null,
        },
      ]),
    )
  }

  const list = async (source: SyncSource, which: ItemList): Promise<ItemView[]> => {
    const items = await listItems(db, await linkOf(source), which)
    const shelved = await shelvedAs(items.flatMap((item) => (item.copyId ? [item.copyId] : [])))
    const matches = which === 'needs-you' ? await matchesOf(items) : new Map<number, ItemMatch>()
    return items.map((item) => {
      const view = toView(item, item.copyId ? shelved.get(item.copyId) : undefined)
      const match = item.igdbId === null ? undefined : matches.get(item.igdbId)
      return match ? { ...view, match } : view
    })
  }

  /**
   * My answer about one item, carried out at once: a game picked for it goes
   * on the shelf now; "not a game" and "not mine" are never asked again;
   * "ask again" undoes either, and puts back a game I removed. For a game a
   * source saw me play, a copy needs to know how I own it: a game picked
   * without saying waits for me to confirm it with a cartridge or a download.
   */
  const answer = async (
    source: SyncSource,
    itemId: string,
    choice: Answer,
    allow?: Allowance,
    now = Date.now(),
  ): Promise<{ item: ItemView; version: number }> => {
    const item = await readItem(db, libraryId, itemId)
    if (!item || item.source !== source) {
      throw new LibraryError('not-found', 'That item is not this shelf’s')
    }
    if (item.copyId) throw new LibraryError('conflict', 'That game is on the shelf already')
    const owned = SOURCES[item.source].evidence === 'owned'
    if (choice.kind === 'pick') {
      const sure = owned || choice.format !== undefined
      await decideItem(
        db,
        libraryId,
        item.id,
        {
          decision: sure ? 'copy' : 'pending',
          igdbId: choice.igdbId,
          ...(choice.format ? { format: choice.format } : {}),
        },
        now,
      )
    } else if (choice.kind === 'confirm') {
      if (item.igdbId === null || item.decision !== 'pending') {
        throw new LibraryError('conflict', 'That item has no game waiting to be confirmed')
      }
      await decideItem(db, libraryId, item.id, { decision: 'copy', format: choice.format }, now)
    } else if (choice.kind === 'dismiss') {
      await decideItem(db, libraryId, item.id, { decision: choice.as }, now)
    } else {
      await decideItem(
        db,
        libraryId,
        item.id,
        { decision: owned && item.igdbId !== null ? 'copy' : 'pending' },
        now,
      )
    }
    await addSome(item.source, 1, now, allow, new Set([item.id]))
    const after = (await readItem(db, libraryId, item.id))!
    const shelved = after.copyId ? (await shelvedAs([after.copyId])).get(after.copyId) : undefined
    return { item: toView(after, shelved), version: await readVersion(db, libraryId) }
  }

  /**
   * One answer for many games a source saw me play, matched and waiting for
   * me: "all of these are downloads" (ADR 003). Each is confirmed with that
   * format, then a step puts the first of them on the shelf; the page asks
   * for more steps while some remain, as after a read.
   */
  const confirmMany = async (
    source: SyncSource,
    itemIds: readonly string[],
    format: Format,
    allow?: Allowance,
    now = Date.now(),
  ): Promise<SyncStep> => {
    await linkOf(source)
    await confirmItems(db, libraryId, source, itemIds, format, now)
    return step(source, allow ? { allow } : {}, now)
  }

  const links = async () =>
    Promise.all((await readLinks(db, libraryId)).map((link) => viewOf(db, link)))

  return { step, games: someGames, list, answer, confirmMany, links, linkOf }
}

export type Answer =
  /** This game; and, for a game a source saw me play, how I own it, or nothing yet. */
  | { kind: 'pick'; igdbId: number; format?: Format }
  /** The game Shelf matched is the one, and I own it this way. */
  | { kind: 'confirm'; format: Format }
  | { kind: 'dismiss'; as: 'not_a_game' | 'not_mine' }
  | { kind: 'again' }

/* For routes: the signed-in account, on its own library, this server's IGDB and sources. */

let shared: ReturnType<typeof createSync> | undefined
export const syncFor = (libraryId: string) =>
  (shared ??= createSync({
    db: database(),
    igdb: igdb(),
    readArt: (id) => readCoverArt(id),
    steam: steam(),
    nintendo: nintendo(),
  }))(libraryId)

const sourceParam = z.custom<SyncSource>(isSyncSource)

const ready = (source: unknown): SyncSource | undefined => {
  const parsed = sourceParam.safeParse(source)
  return parsed.success && SOURCES[parsed.data].ready ? parsed.data : undefined
}

const invalid = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

/** Every source, and this account's link to each. */
export const myPlatforms = () =>
  forAccount(async (account) => {
    const links = await syncFor(account.id).links()
    return (Object.keys(SOURCES) as SyncSource[]).map((source) => ({
      source,
      ready: SOURCES[source].ready,
      link: links.find((link) => link.source === source) ?? null,
    }))
  })

/**
 * Links the account to the account at a source that the source's own
 * sign-in vouched for, keeping what the sign-in gave to read it with sealed.
 */
export const linkMine = (
  source: unknown,
  { secret, ...linked }: Omit<Linked, 'sealed'> & { secret?: string },
) => {
  const which = ready(source)
  if (!which) return invalid()
  return forAccount(
    (account) =>
      saveLink(database(), account.id, which, {
        ...linked,
        ...(secret ? { sealed: seal(secret, account.id, which) } : {}),
      }),
    true,
  )
}

const allowance =
  (account: Account): Allowance =>
  (count) =>
    spend(account, 'sync', count)

export const syncMine = (source: unknown, body: unknown) => {
  const which = ready(source)
  const parsed = z.object({ read: z.boolean().default(false) }).safeParse(body ?? {})
  if (!which || !parsed.success) return invalid()
  return forAccount(async (account) => {
    if (parsed.data.read) await spend(account, 'read')
    return syncFor(account.id).step(which, { read: parsed.data.read, allow: allowance(account) })
  }, true)
}

/** What a game synced by itself may run into. Whatever it rides on stands, and a sync catches up. */
const quietly = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (error) {
    const expected =
      error instanceof SourceError || error instanceof IgdbError || error instanceof TooManyError
    if (!expected) console.error('A game synced by itself failed', error)
  }
}

/**
 * A few of the account's Steam apps brought up to date by themselves, and their achievements read
 * now, for what just changed them: a game played, or one I say I got. Never fails.
 */
export const syncGames = async (account: Account, apps: readonly string[]) => {
  if (apps.length === 0 || !(await readLink(database(), account.id, 'steam'))) return
  await quietly(async () => {
    await spend(account, 'achievements')
    await syncFor(account.id).games('steam', apps, allowance(account))
  })
  await quietly(async () => {
    const read = await achievementsFor(account.id).readNow('steam', apps)
    if (read > 0) revalidateTag(achievementsTag(account.id), { expire: 0 })
  })
}

/**
 * One game of mine synced by itself, by its entry: a game off the wishlist that I may have just
 * bought (spec 7.5). A game that is not on Steam, or a shelf not linked to it, changes nothing.
 */
export const syncMyGame = (entryId: unknown) => {
  const parsed = z.string().min(1).max(100).safeParse(entryId)
  if (!parsed.success) return invalid()
  return forAccount(async (account) => {
    const db = database()
    const game = (await readOwnerPlay(db, account.id)).find((each) => each.entryId === parsed.data)
    if (game) await syncGames(account, game.steam)
    return { version: await readVersion(db, account.id) }
  }, true)
}

export const listMine = (source: unknown, which: unknown) => {
  const from = ready(source)
  const parsed = z.enum(itemLists).safeParse(which)
  if (!from || !parsed.success) return invalid()
  return forAccount((account) => syncFor(account.id).list(from, parsed.data))
}

const format = z.custom<Format>(isFormat)

const answerShape = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pick'),
    igdbId: z.number().int().positive(),
    format: format.optional(),
  }),
  z.object({ kind: z.literal('confirm'), format }),
  z.object({ kind: z.literal('dismiss'), as: z.enum(['not_a_game', 'not_mine']) }),
  z.object({ kind: z.literal('again') }),
])

export const answerMine = (source: unknown, itemId: unknown, body: unknown) => {
  const which = ready(source)
  const id = z.string().min(1).max(64).safeParse(itemId)
  const parsed = answerShape.safeParse(body)
  if (!which || !id.success || !parsed.success) return invalid()
  return forAccount(
    (account) => syncFor(account.id).answer(which, id.data, parsed.data, allowance(account)),
    true,
  )
}

/** Most items one answer confirms at once: a page of a list. */
export const CONFIRM_AT_ONCE = 200

const manyShape = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(CONFIRM_AT_ONCE),
  answer: z.object({ kind: z.literal('confirm'), format }),
})

export const confirmManyMine = (source: unknown, body: unknown) => {
  const which = ready(source)
  const parsed = manyShape.safeParse(body)
  if (!which || !parsed.success) return invalid()
  return forAccount(
    (account) =>
      syncFor(account.id).confirmMany(
        which,
        parsed.data.ids,
        parsed.data.answer.format,
        allowance(account),
      ),
    true,
  )
}

export const setMyDaily = (source: unknown, body: unknown) => {
  const which = ready(source)
  const parsed = z.object({ daily: z.boolean() }).safeParse(body)
  if (!which || !parsed.success) return invalid()
  return forAccount(async (account) => {
    const sync = syncFor(account.id)
    await sync.linkOf(which)
    await setDaily(database(), account.id, which, parsed.data.daily)
    return viewOf(database(), await sync.linkOf(which))
  }, true)
}

export const unlinkMine = (source: unknown) => {
  const which = sourceParam.safeParse(source)
  if (!which.success) return invalid()
  return forAccount(
    (account) => forgetLink(database(), account.id, which.data).then(() => true),
    true,
  )
}

/** Links the daily sync looks at in one run. */
const DAILY_LINKS = 200

/**
 * The daily sync (ADR 003, decision 6), which Vercel starts once a day:
 * every link that asks for it, the longest unsynced first, step after step
 * until each is done or the run's time is spent, then its achievements
 * the same way (issue 72). What is left waits for the next day, or for
 * "Sync now". Returns the libraries whose version moved.
 */
export const syncDaily = async (budgetMs = 240_000) => {
  const started = Date.now()
  const inTime = () => Date.now() - started < budgetMs
  const changed: string[] = []
  let synced = 0
  for (const link of await dueLinks(database(), DAILY_LINKS)) {
    if (!inTime()) break
    if (!SOURCES[link.source].ready) continue
    const library = syncFor(link.userId)
    try {
      const before = await readVersion(database(), link.userId)
      let step = await library.step(link.source, { read: true })
      while (step.remaining > 0 && inTime()) step = await library.step(link.source)
      if (step.version !== before) changed.push(link.userId)
      synced += 1
      if (isAchievementProvider(link.source) && step.remaining === 0 && !step.link.problem) {
        const achievements = achievementsFor(link.userId)
        let read = await achievements.step(link.source)
        while (read.remaining > 0 && read.problem !== 'private' && inTime()) {
          read = await achievements.step(link.source)
        }
      }
    } catch (error) {
      console.error('A daily sync failed', link.source, error)
    }
  }
  return { synced, libraries: changed }
}
