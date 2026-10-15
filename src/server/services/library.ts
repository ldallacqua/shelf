import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import type { Library } from '@/domain/library/library'
import { encodeKeywords, encodeLibrary } from '@/domain/library/snapshot'
import { sortByTitle } from '@/domain/library/sort'
import { database } from '@/server/db/client'
import type { GameKeywords } from '@/domain/query/evaluate'
import { readKeywords, readLibrary } from '@/server/library/read'
import { readVersion } from '@/server/library/store'

/**
 * Reading the library. Every read here is cached and tagged `library`; every
 * write ends by expiring that tag, so a cached answer never outlives the
 * library it describes.
 */

/** The tag on everything that depends on the library's contents. */
export const LIBRARY_TAG = 'library'

/** The library's version: a counter raised by every write. */
export const getLibraryVersion = async (): Promise<number> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  return readVersion(database())
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

/** The whole library, for pages rendered on the server. */
export const getLibrary = async (): Promise<Library> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  return inTitleOrder(await readLibrary(database()))
}

/**
 * The library file as text, ready to send: what the browser fetches once and
 * then filters and sorts on the device.
 */
export const getLibrarySnapshot = async (): Promise<{ version: number; json: string }> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  const library = inTitleOrder(await readLibrary(database()))
  return { version: library.version, json: JSON.stringify(encodeLibrary(library)) }
}

/** Where the current library file lives. The address changes when the library does. */
export const snapshotPath = (version: number): string => `/api/v1/library/snapshot/${version}`

/** The keywords file as text, for the library's current version. */
export const getKeywordsFile = async (): Promise<{ version: number; json: string }> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  const db = database()
  const [version, keywords] = await Promise.all([readVersion(db), readKeywords(db)])
  return { version, json: JSON.stringify(encodeKeywords(version, keywords)) }
}

/** Every game's keywords, for a first screen whose filter asks about one. */
export const getLibraryKeywords = async (): Promise<GameKeywords> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  return readKeywords(database())
}

/** Where the current keywords file lives. */
export const keywordsPath = (version: number): string => `/api/v1/library/keywords/${version}`
