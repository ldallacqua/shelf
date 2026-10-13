import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'

import type { Library } from '@/domain/library/library'
import { encodeLibrary } from '@/domain/library/snapshot'
import { database } from '@/server/db/client'
import { readLibrary } from '@/server/library/read'
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

/** The whole library, for pages rendered on the server. */
export const getLibrary = async (): Promise<Library> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  return readLibrary(database())
}

/**
 * The library file as text, ready to send: what the browser fetches once and
 * then filters and sorts on the device.
 */
export const getLibrarySnapshot = async (): Promise<{ version: number; json: string }> => {
  'use cache'
  cacheTag(LIBRARY_TAG)
  cacheLife('max')
  const library = await readLibrary(database())
  return { version: library.version, json: JSON.stringify(encodeLibrary(library)) }
}

/** Where the current library file lives. The address changes when the library does. */
export const snapshotPath = (version: number): string => `/api/v1/library/snapshot/${version}`
