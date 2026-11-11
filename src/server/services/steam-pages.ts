import 'server-only'

import { createHash } from 'node:crypto'

import { after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { and, asc, count, eq, inArray, isNotNull, isNull, like, lt, or, sql } from 'drizzle-orm'

import type { Palette } from '@/domain/color/palette'
import type { GameImage } from '@/domain/igdb/game'
import type { Description } from '@/domain/steam/description'
import { isStoreGame, toSteamPage, type StoreGame } from '@/domain/steam/store-game'
import { database, type Db } from '@/server/db/client'
import { entryVersions, games, type StoredSteamPage } from '@/server/db/schema'
import { readCoverArt } from '@/server/igdb/cover-art'
import { bumpVersion, type CoverArt } from '@/server/library/store'
import { NEW_REVIEWS_COUNT, readSteamReviews, steamAppsOf } from '@/server/services/steam-reviews'
import { libraryTag } from '@/server/services/tags'
import { steam, type Steam } from '@/server/sync/steam'

/**
 * A game IGDB has, as its page on Steam's store shows it (ADR 010): the cover every shelf draws,
 * and the description, summary, screenshots and art its own page shows before IGDB's. Read when a game is
 * added and once a day after, a hundred apps to a request, never because someone opened a page.
 * A game IGDB doesn't have was read whole from the store already (ADR 006), and isn't read here.
 */

/** More games than the catalog holds today: the time each reading may take is what holds it back. */
export const PAGES_COUNT = 5_000

/** Games never read yet, read right after one is added. */
export const NEW_PAGES_COUNT = 100

/** How long the daily reading may take, beside IGDB's refresh and Steam's reviews in one call. */
export const PAGES_BUDGET_MS = 120_000

/** How long the reading after an add may take. */
const NEW_PAGES_BUDGET_MS = 30_000

/** Apps to one question to the store, as `storeGames` asks them. */
const APPS_PER_QUESTION = 100

/** Covers read for their colors at once. */
const ART_AT_ONCE = 8

/** How many ids one statement names: well under SQLite's limit on a statement's values. */
const IDS_PER_QUERY = 200

const chunks = <T>(items: readonly T[], size = IDS_PER_QUERY): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, at) =>
    items.slice(at * size, (at + 1) * size),
  )

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export type PagesRead = {
  /** Games whose store page was read. */
  checked: number
  /** Of those, the ones whose cover or page now shows something else. */
  changed: number
  /** The libraries that hold a changed game: their shelves and pages are out of date. */
  libraries: string[]
}

export type SteamPagesDeps = {
  db: Db
  storeGames: Steam['storeGames']
  readArt: (imageId: string) => Promise<CoverArt | undefined>
  /** The clock the time allowed is measured on; the tests' own. */
  clock?: () => number
}

type Held = {
  id: string
  apps: string[]
  steamCover: GameImage | null
  steamBanner: GameImage | null
  steamColors: Palette | null
  steamThumbhash: string | null
  steamPage: StoredSteamPage | null
}

type Change = {
  id: string
  steamCover: GameImage | null
  steamBanner: GameImage | null
  steamColors: Palette | null
  steamThumbhash: string | null
  steamPage: StoredSteamPage | null
  steamDescription: Description | null
}

/** A short fingerprint of a description: a change to it is a change to the page. */
const fingerprint = (description: Description): string =>
  createHash('sha256').update(JSON.stringify(description)).digest('base64url').slice(0, 16)

/**
 * What is kept of a page apart from its cover, banner and description, which have columns of their
 * own: the description by its fingerprint.
 */
const pageOf = (item: StoreGame): StoredSteamPage => {
  const { cover: _cover, banner: _banner, description, ...page } = toSteamPage(item)
  return description ? { ...page, described: fingerprint(description) } : page
}

/** The game's page among its apps': the first the store shows that is a game, not a DLC or a soundtrack. */
const pickPage = (apps: readonly string[], found: ReadonlyMap<string, StoreGame>) =>
  apps.map((app) => found.get(app)).find((item) => item !== undefined && isStoreGame(item))

/**
 * A game with a page on Steam, as far as its record says: one IGDB has, or one read from the store
 * alone (ADR 006), whose page this reads again too, for its banner and what changed there.
 */
const onSteam = or(
  isNotNull(games.steamAppId),
  and(
    isNotNull(games.igdbId),
    or(like(games.storeIds, '%"steam"%'), like(games.storeLinks, '%"steam"%')),
  ),
)

/** Pages never read; with a time, also those last read before it. */
const unreadSince = (before: number | undefined) =>
  before === undefined
    ? isNull(games.steamPageCheckedAt)
    : before === Infinity
      ? undefined
      : or(isNull(games.steamPageCheckedAt), lt(games.steamPageCheckedAt, before))

/** How many games with a page on Steam are left to read: never read, or not since `before`. */
export const steamPagesLeft = async (db: Db, before?: number): Promise<number> => {
  const [row] = await db
    .select({ left: count() })
    .from(games)
    .where(and(onSteam, unreadSince(before)))
  return row?.left ?? 0
}

/** How many games IGDB has with a page on Steam. */
export const steamPagesKnown = async (db: Db): Promise<number> => {
  const [row] = await db.select({ known: count() }).from(games).where(onSteam)
  return row?.known ?? 0
}

export const createSteamPages =
  ({ db, storeGames, readArt, clock = Date.now }: SteamPagesDeps) =>
  async (
    count = PAGES_COUNT,
    now = Date.now(),
    only: 'all' | 'unread' = 'all',
    budgetMs = PAGES_BUDGET_MS,
    /** Only pages not read since then: a run that reads every page again, in steps. */
    before?: number,
  ): Promise<PagesRead> => {
    const deadline = clock() + budgetMs
    const rows = await db
      .select({
        id: games.id,
        steamAppId: games.steamAppId,
        storeIds: games.storeIds,
        storeLinks: games.storeLinks,
        steamCover: games.steamCover,
        steamBanner: games.steamBanner,
        steamColors: games.steamColors,
        steamThumbhash: games.steamThumbhash,
        steamPage: games.steamPage,
      })
      .from(games)
      .where(and(onSteam, unreadSince(only === 'unread' ? undefined : (before ?? Infinity))))
      // Those never read first, then the longest unread.
      .orderBy(sql`${games.steamPageCheckedAt} is not null`, asc(games.steamPageCheckedAt))
      .limit(count)
    const held: Held[] = rows
      .map((row) => ({ ...row, apps: steamAppsOf(row) }))
      .filter((game) => game.apps.length > 0)
    if (held.length === 0) return { checked: 0, changed: 0, libraries: [] }

    // A hundred apps to a question. A question that fails costs only its own games, which keep
    // what they have and are read first next time.
    const groups: Held[][] = []
    for (const game of held) {
      const last = groups.at(-1)
      const apps = last?.reduce((sum, each) => sum + each.apps.length, 0) ?? Infinity
      if (last && apps + game.apps.length <= APPS_PER_QUESTION) last.push(game)
      else groups.push([game])
    }
    const answered = new Map<string, StoreGame | undefined>()
    for (const group of groups) {
      if (clock() > deadline) break
      try {
        const found = await storeGames(group.flatMap((game) => game.apps))
        for (const game of group) answered.set(game.id, pickPage(game.apps, found))
      } catch {
        // Steam failed or answered in a new shape: these games wait for another day.
      }
    }

    // What each game shows now. A page the store no longer has leaves the game on IGDB's record.
    const changes: Change[] = []
    const needArt: { change: Change; cover: GameImage }[] = []
    const checked: string[] = []
    for (const game of held) {
      if (!answered.has(game.id)) continue
      const item = answered.get(game.id)
      const shown = item ? toSteamPage(item) : undefined
      const cover = shown?.cover ?? null
      const banner = shown?.banner ?? null
      const read = item ? pageOf(item) : null
      // A page with nothing to show is as good as none: the game stays on IGDB's record.
      const page =
        read &&
        (read.summary || read.described || read.screenshots.length > 0 || read.artworks.length > 0)
          ? read
          : null
      const description = page ? (shown?.description ?? null) : null
      const coverMoved = !same(cover, game.steamCover)
      if (!coverMoved && same(banner, game.steamBanner) && same(page, game.steamPage)) {
        checked.push(game.id)
        continue
      }
      const change: Change = {
        id: game.id,
        steamCover: cover,
        steamBanner: banner,
        steamColors: coverMoved ? null : game.steamColors,
        steamThumbhash: coverMoved ? null : game.steamThumbhash,
        steamPage: page,
        steamDescription: description,
      }
      if (cover && coverMoved) needArt.push({ change, cover })
      else {
        changes.push(change)
        checked.push(game.id)
      }
    }

    // A new cover's colors and blur, a few at a time. One the time allowed doesn't reach is read
    // next time, its game left as it was; one that can't be read keeps IGDB's colors under it.
    for (const some of chunks(needArt, ART_AT_ONCE)) {
      if (clock() > deadline) break
      const arts = await Promise.all(
        some.map(({ cover }) => readArt(cover.id).catch(() => undefined)),
      )
      some.forEach(({ change }, at) => {
        const art = arts[at]
        if (art) {
          change.steamColors = art.colors
          change.steamThumbhash = art.thumbhash
        }
        changes.push(change)
        checked.push(change.id)
      })
    }

    const libraries = await db.transaction(async (tx) => {
      for (const change of changes) {
        await tx
          .update(games)
          .set({
            steamCover: change.steamCover,
            steamBanner: change.steamBanner,
            steamColors: change.steamColors,
            steamThumbhash: change.steamThumbhash,
            steamPage: change.steamPage,
            steamDescription: change.steamDescription,
          })
          .where(eq(games.id, change.id))
      }
      for (const some of chunks(checked)) {
        await tx.update(games).set({ steamPageCheckedAt: now }).where(inArray(games.id, some))
      }
      if (changes.length === 0) return []
      const holders = new Set<string>()
      for (const some of chunks(changes.map((change) => change.id))) {
        const found = await tx
          .selectDistinct({ libraryId: entryVersions.userId })
          .from(entryVersions)
          .where(and(inArray(entryVersions.gameId, some), isNotNull(entryVersions.userId)))
        for (const row of found) if (row.libraryId) holders.add(row.libraryId)
      }
      const all = [...holders]
      for (const libraryId of all) await bumpVersion(tx, libraryId)
      return all
    })

    return { checked: checked.length, changed: changes.length, libraries }
  }

let shared: ReturnType<typeof createSteamPages> | undefined

const reader = () =>
  (shared ??= createSteamPages({
    db: database(),
    storeGames: (apps) => steam().storeGames(apps),
    readArt: (id) => readCoverArt(id),
  }))

/** The reading for this server, against Steam itself (or its test double, under `SHELF_MOCKS`). */
export const readSteamPages = (count?: number) => reader()(count)

/** A reading started by hand (the admin page): within `budgetMs`, all again or only those never read. */
export const readSteamPagesNow = (only: 'all' | 'unread', budgetMs: number, before?: number) =>
  reader()(PAGES_COUNT, Date.now(), only, budgetMs, before)

/**
 * Once the answer to an add has gone, asks Steam about games never asked yet: their scores, and
 * their store pages, so a game just added has Steam's cover and screenshots on its next load
 * instead of tomorrow's. It never slows or fails the add: a failure leaves the game for the daily
 * run.
 */
export const askSteamAfterAdding = () => {
  try {
    after(async () => {
      const [reviews, pages] = await Promise.all([
        readSteamReviews(NEW_REVIEWS_COUNT, Date.now(), 'unasked').catch(() => undefined),
        reader()(NEW_PAGES_COUNT, Date.now(), 'unread', NEW_PAGES_BUDGET_MS).catch(() => undefined),
      ])
      const stale = new Set([...(reviews?.libraries ?? []), ...(pages?.libraries ?? [])])
      try {
        for (const libraryId of stale) revalidateTag(libraryTag(libraryId), { expire: 0 })
      } catch {
        // Their new versions stand: the next write or the daily run expires them.
      }
    })
  } catch {
    // Outside a request (a script or a test): the daily run asks instead.
  }
}
