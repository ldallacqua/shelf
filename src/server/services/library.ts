import 'server-only'

import { eq } from 'drizzle-orm'
import { cacheLife, cacheTag } from 'next/cache'

import { buildGamePage, type GamePage } from '@/domain/library/game-page'
import type { Library } from '@/domain/library/library'
import { encodeKeywords, encodeLibrary } from '@/domain/library/snapshot'
import { sortByTitle } from '@/domain/library/sort'
import type { GameKeywords } from '@/domain/query/evaluate'
import { database } from '@/server/db/client'
import { libraries, users } from '@/server/db/schema'
import { readGameExtras, readKeywords, readLibrary } from '@/server/library/read'
import { readVersion } from '@/server/library/store'
import { handleTag, keyTag, libraryTag } from '@/server/services/tags'

/**
 * Reading libraries (ADR 004). Each account has one, addressed by its
 * handle in pages and by its key in its files. Every read here is cached
 * and tagged with its library; every write to a library ends by expiring
 * that tag, so a cached answer never outlives the library it describes.
 *
 * A private library is never read here for anyone but its account, and
 * then not cached at all: its pages are frames, and its account's browser
 * fills them from `/api/v1/me/…`.
 */

export { handleTag, libraryTag } from '@/server/services/tags'

/** A library as its pages need to know it: whose, whether anyone may see it, and its files. */
export type LibraryInfo = {
  id: string
  handle: string
  /** The account's name: "Ana's shelf". */
  name: string
  public: boolean
  /** In a public library's file addresses; never shown for a private one. */
  key: string
  version: number
}

const libraryInfo = async (where: ReturnType<typeof eq>): Promise<LibraryInfo | undefined> => {
  const [row] = await database()
    .select({
      id: users.id,
      handle: users.username,
      name: users.name,
      public: users.shelfPublic,
      key: libraries.key,
      version: libraries.version,
    })
    .from(users)
    .innerJoin(libraries, eq(libraries.userId, users.id))
    .where(where)
    .limit(1)
  return row?.handle ? { ...row, handle: row.handle } : undefined
}

/** The library at `/u/{handle}`, public or not, or nothing when no account has that handle. */
export const findLibrary = async (handle: string): Promise<LibraryInfo | undefined> => {
  'use cache'
  cacheTag(handleTag(handle))
  cacheLife('max')
  const found = await libraryInfo(eq(users.username, handle.toLowerCase()))
  if (found) cacheTag(libraryTag(found.id))
  return found
}

/** The public library whose files this key addresses, or nothing. */
export const findPublicLibraryByKey = async (key: string): Promise<LibraryInfo | undefined> => {
  'use cache'
  cacheTag(keyTag(key))
  cacheLife('max')
  const found = await libraryInfo(eq(libraries.key, key))
  if (found) cacheTag(libraryTag(found.id))
  return found?.public ? found : undefined
}

/** A library's version: a counter raised by every write to it. */
export const getLibraryVersion = async (libraryId: string): Promise<number> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  return readVersion(database(), libraryId)
}

/**
 * The library with its games in title order. The device sorts again, for its
 * own language, but sorting a list that is already in order is one pass over
 * it; from the database's order it was 55 ms of a slow phone doing nothing else.
 */
const inTitleOrder = (library: Library): Library => ({
  ...library,
  games: sortByTitle(library.games, 'en'),
})

/** A public library whole, for pages rendered on the server. */
export const getLibrary = async (libraryId: string): Promise<Library> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  return inTitleOrder(await readLibrary(database(), libraryId))
}

/** A private library whole, for its own account only, read fresh and kept nowhere. */
export const readMyLibrary = async (libraryId: string): Promise<Library> =>
  inTitleOrder(await readLibrary(database(), libraryId))

/** A library as its file's text: what the browser fetches once, then filters and sorts on the device. */
export const libraryFile = (library: Library): string => JSON.stringify(encodeLibrary(library))

/** A public library's file as text, ready to send. */
export const getLibrarySnapshot = async (
  libraryId: string,
): Promise<{ version: number; json: string }> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  const library = inTitleOrder(await readLibrary(database(), libraryId))
  return { version: library.version, json: libraryFile(library) }
}

/** Where a public library's current file lives. The address changes when the library does. */
export const snapshotPath = (key: string, version: number): string =>
  `/api/v1/libraries/${key}/snapshot/${version}`

const keywordsOf = async (libraryId: string) =>
  // One transaction, so the keywords are the version's own.
  database().transaction(async (tx) => ({
    version: await readVersion(tx, libraryId),
    keywords: await readKeywords(tx, libraryId),
  }))

/** A public library's keywords file as text, for its current version. */
export const getKeywordsFile = async (
  libraryId: string,
): Promise<{ version: number; json: string }> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  const { version, keywords } = await keywordsOf(libraryId)
  return { version, json: JSON.stringify(encodeKeywords(version, keywords)) }
}

/** A private library's keywords file, for its own account only, kept nowhere. */
export const readMyKeywordsFile = async (libraryId: string): Promise<string> => {
  const { version, keywords } = await keywordsOf(libraryId)
  return JSON.stringify(encodeKeywords(version, keywords))
}

const gamePageIn = async (
  library: Library,
  libraryId: string,
  slug: string,
): Promise<GamePage | undefined> => {
  const game = library.games.find((each) => each.slug === slug)
  if (!game) return undefined
  const extras = await readGameExtras(database(), libraryId, slug)
  return extras && buildGamePage(library, game, extras)
}

/**
 * A game's page in a public library, by its address: the game as the
 * library has it, and what only its page shows. Nothing for a slug that is
 * no game's address there. Cached by slug, like a shelf: a game page
 * Next.js did not build is first answered from data cached with the
 * route's frame, which a list of games would not keep up with.
 */
export const getGamePage = async (
  libraryId: string,
  slug: string,
): Promise<GamePage | undefined> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  return gamePageIn(await getLibrary(libraryId), libraryId, slug)
}

/** A game's page in a private library, for its own account only, kept nowhere. */
export const readMyGamePage = async (
  libraryId: string,
  slug: string,
): Promise<GamePage | undefined> => gamePageIn(await readMyLibrary(libraryId), libraryId, slug)

/**
 * Where a game's facts live for a public library's current version: what
 * the game opened over the shelf fetches. The address changes when the
 * library does.
 */
export const gameFactsPath = (key: string, version: number, slug: string): string =>
  `/api/v1/libraries/${key}/games/${version}/${encodeURIComponent(slug)}`

/** Every game's keywords in a public library, for a first screen whose filter asks about one. */
export const getLibraryKeywords = async (libraryId: string): Promise<GameKeywords> => {
  'use cache'
  cacheTag(libraryTag(libraryId))
  cacheLife('max')
  return readKeywords(database(), libraryId)
}

/** Where a public library's current keywords file lives. */
export const keywordsPath = (key: string, version: number): string =>
  `/api/v1/libraries/${key}/keywords/${version}`
