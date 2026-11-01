import 'server-only'

import { and, eq, sql } from 'drizzle-orm'
import { revalidateTag } from 'next/cache'

import {
  addSteamInput,
  type AddedGame,
  type AddSteamInput,
  type Candidate,
  type Habits,
  type OnShelf,
  type Refusal,
  type SteamLinkAnswer,
} from '@/domain/library/adding'
import {
  isAdultOnSteam,
  isStoreGame,
  steamAppId,
  toSteamGame,
  wordsOf,
  type SteamGameData,
} from '@/domain/steam/store-game'
import type { Format } from '@/domain/library/values'
import type { Account } from '@/server/auth/account'
import { database, type Db } from '@/server/db/client'
import { copies, entries, entryVersions, games } from '@/server/db/schema'
import { igdb } from '@/server/igdb'
import type { IgdbApi } from '@/server/igdb/api'
import { readCoverArt } from '@/server/igdb/cover-art'
import {
  addFromSteam,
  findSteamGame,
  LibraryError,
  readVersion,
  refreshSteamGame,
  type Placement,
} from '@/server/library/store'
import { spend } from '@/server/services/fair-use'
import { forModerator } from '@/server/services/for-account'
import { createRecords } from '@/server/services/igdb-records'
import { libraryTag } from '@/server/services/tags'
import { steam, type Steam } from '@/server/sync/steam'

/**
 * A game IGDB does not have, added from its Steam page (ADR 006). Only a
 * moderator gets this far, because what they add goes in the catalog every
 * shelf shares. What goes in is always read from Steam here, on the server;
 * the browser says which app and, at most, what to call it.
 */

export type SteamAddingDeps = {
  db: Db
  igdb: IgdbApi
  steam: Pick<Steam, 'storeGame'>
  readArt: (imageId: string) => Promise<Awaited<ReturnType<typeof readCoverArt>>>
}

export const createSteamAdding = (deps: SteamAddingDeps) => {
  const { allPlatforms } = createRecords(deps)
  return (libraryId: string) => forLibrary(libraryId, deps, allPlatforms)
}

const forLibrary = (
  libraryId: string,
  { db, igdb: api, steam: store, readArt }: SteamAddingDeps,
  allPlatforms: ReturnType<typeof createRecords>['allPlatforms'],
) => {
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
    return { order: [...counts].sort((a, b) => b[1] - a[1]).map(([id]) => id), formats }
  }

  /** The entry of mine a game already stored is, if I have it. */
  const entryOf = async (
    gameId: string,
  ): Promise<{ entryId: string; onShelf: OnShelf } | undefined> => {
    const [row] = await db
      .select({
        entryId: entryVersions.entryId,
        slug: games.slug,
        title: games.title,
        archivedAt: entries.archivedAt,
      })
      .from(entryVersions)
      .innerJoin(games, eq(games.id, entryVersions.gameId))
      .innerJoin(entries, eq(entries.id, entryVersions.entryId))
      .where(and(eq(entryVersions.gameId, gameId), eq(entryVersions.userId, libraryId)))
      .limit(1)
    if (!row) return undefined
    return {
      entryId: row.entryId,
      onShelf: {
        slug: row.slug,
        title: row.title,
        ...(row.archivedAt === null ? {} : { archived: row.entryId }),
      },
    }
  }

  /** The name IGDB gives this app, when it has it: then it is searched for, never added here. */
  const onIgdb = async (appId: string): Promise<string | undefined> =>
    (await api.byStoreIds('steam', [appId])).get(appId)?.[0]?.name

  /** `touched` is given the libraries whose shelves the read changed. */
  const read = async (link: string, touched: string[] = []): Promise<SteamLinkAnswer> => {
    const item = await store.storeGame(link)
    if (!item) return { kind: 'not-found' }
    if (!isStoreGame(item)) return { kind: 'not-a-game', title: item.name ?? '' }
    const title = await onIgdb(link)
    if (title) return { kind: 'igdb', title }

    const data = toSteamGame(item)
    const [held, all, mine] = await Promise.all([findSteamGame(db, link), allPlatforms(), habits()])
    if (held) {
      // Pasting a game already added also brings it up to date with its page.
      const art =
        data.cover && data.cover.id !== held.cover?.id ? await readArt(data.cover.id) : undefined
      touched.push(
        ...(await refreshSteamGame(db, {
          data,
          ...(art ? { art } : {}),
          names: wordsOf(data),
          platforms: data.platforms.flatMap((id) => all.get(id) ?? []),
        })),
      )
    }
    const shelved = held ? await entryOf(held.id) : undefined
    const candidate: Candidate = {
      // Nothing asks IGDB about a result from Steam: `steam` says which it is.
      igdbId: 0,
      slug: '',
      title: held?.title ?? data.title,
      kind: 'main',
      platforms: data.platforms,
      alsoOn: [],
      ports: [],
      steam: { appId: link, adult: isAdultOnSteam(data), known: held !== undefined },
      ...(data.year ? { year: data.year } : {}),
      ...(data.cover ? { cover: data.cover } : {}),
      ...(shelved ? { onShelf: shelved.onShelf } : {}),
    }
    return {
      kind: 'game',
      answer: {
        results: [candidate],
        platforms: data.platforms.flatMap((id) => {
          const platform = all.get(id)
          return platform
            ? [{ id, key: platform.key, name: platform.name, short: platform.short }]
            : []
        }),
        habits: mine,
      },
    }
  }

  const placementFor = async (
    input: AddSteamInput,
    gameId: string | undefined,
  ): Promise<{ placement: Placement; shelved?: OnShelf }> => {
    const wanted = input.copies.map(({ platformId, format, stores }) => ({
      platformId,
      format,
      ...(stores ? { stores } : {}),
    }))
    const shelved = gameId ? await entryOf(gameId) : undefined
    if (shelved) {
      // Mine already: what is new is only the copies I did not have.
      const owned = await db
        .select({ platformId: copies.platformId, format: copies.format })
        .from(copies)
        .where(eq(copies.entryId, shelved.entryId))
      const have = new Set(owned.map((copy) => `${copy.platformId}:${copy.format}`))
      return {
        placement: {
          kind: 'join',
          entryId: shelved.entryId,
          copies: wanted.filter((copy) => !have.has(`${copy.platformId}:${copy.format}`)),
        },
        shelved: shelved.onShelf,
      }
    }
    return {
      placement: {
        kind: 'entry',
        entry: {
          status: input.status,
          copies: wanted,
          ...(input.status === 'wishlist' && input.wanted?.length ? { wanted: input.wanted } : {}),
          ...(input.wantedStores ? { wantedStores: input.wantedStores } : {}),
          ...(input.rating === undefined ? {} : { rating: input.rating }),
          ...(input.tags ? { tags: input.tags } : {}),
          ...(input.completedOn ? { completedOn: input.completedOn } : {}),
        },
      },
    }
  }

  const add = async (input: AddSteamInput): Promise<AddedGame> => {
    const item = await store.storeGame(input.appId)
    if (!item) throw new LibraryError('not-found', 'Steam has no page for that app')
    if (!isStoreGame(item)) throw new LibraryError('invalid', 'That app is not a game')
    if (await onIgdb(input.appId)) {
      throw new LibraryError('conflict', 'IGDB has that game: it is added by searching for it')
    }
    const data: SteamGameData = toSteamGame(item, input.title)
    if (!data.title) throw new LibraryError('invalid', 'A game needs a title')
    const all = await allPlatforms()
    if (input.copies.some((copy) => !all.has(copy.platformId))) {
      throw new LibraryError('invalid', 'A copy is on a platform IGDB does not know')
    }
    const held = await findSteamGame(db, input.appId)
    const art = !held && data.cover ? await readArt(data.cover.id) : undefined
    const { placement, shelved } = await placementFor(input, held?.id)
    const platforms = new Set([...data.platforms, ...input.copies.map((copy) => copy.platformId)])
    const added = await addFromSteam(
      db,
      libraryId,
      {
        data,
        ...(art ? { art } : {}),
        names: wordsOf(data),
        platforms: [...platforms].flatMap((id) => all.get(id) ?? []),
      },
      placement,
    )
    const [stored] = await db
      .select({ slug: games.slug, title: games.title })
      .from(games)
      .where(eq(games.id, added.gameId))
      .limit(1)
    return {
      slug: shelved?.slug ?? stored?.slug ?? '',
      title: shelved?.title ?? stored?.title ?? data.title,
      version: await readVersion(db, libraryId),
      undo: added,
    }
  }

  return { read, add }
}

/* For actions: the signed-in moderator, on their own library, this server's IGDB and Steam. */

let shared: ReturnType<typeof createSteamAdding> | undefined
const steamAdding = (account: Account) =>
  (shared ??= createSteamAdding({
    db: database(),
    igdb: igdb(),
    steam: steam(),
    readArt: (id) => readCoverArt(id),
  }))(account.id)

const refused = (): Promise<Refusal> => Promise.resolve({ ok: false, reason: 'invalid' })

export const readSteamLink = (appId: unknown) => {
  const parsed = steamAppId.safeParse(appId)
  if (!parsed.success) return refused()
  return forModerator(async (account) => {
    await spend(account, 'search')
    const touched: string[] = []
    const answer = await steamAdding(account).read(parsed.data, touched)
    for (const library of touched) revalidateTag(libraryTag(library), { expire: 0 })
    return answer
  })
}

export const addSteamGame = (input: unknown) => {
  const parsed = addSteamInput.safeParse(input)
  if (!parsed.success) return refused()
  return forModerator(async (account) => {
    await spend(account, 'add')
    return steamAdding(account).add(parsed.data)
  }, true)
}
