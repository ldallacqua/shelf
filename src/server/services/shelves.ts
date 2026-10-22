import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { groupings } from '@/domain/library/group'
import { MAX_SHELF_NAME, type SmartShelf } from '@/domain/library/shelves'
import { MAX_QUERY_LENGTH } from '@/domain/library/view'
import { currentAccount, type Account } from '@/server/auth/account'
import { database, databaseIsDurable } from '@/server/db/client'
import { LibraryError, readShelves, removeShelf, saveShelf } from '@/server/library/store'
import { shelvesTag } from '@/server/services/tags'

/**
 * Smart shelves (spec 5.5), each library's own. Anyone may read a public
 * library's; only its account may save or remove one. Every read is cached
 * under its library's shelves tag, which every write to them expires.
 */

export { shelvesTag } from '@/server/services/tags'

/**
 * A library's shelves. The caller decides whether the reader may see them:
 * a private library's are read for its own account only, and never cached
 * where anyone else's page could be built from them.
 */
export const getShelves = async (libraryId: string): Promise<SmartShelf[]> => {
  'use cache'
  cacheTag(shelvesTag(libraryId))
  cacheLife('max')
  return readShelves(database(), libraryId)
}

/**
 * One shelf, cached by its slug. Not a search of `getShelves`: a shelf's page
 * is built ahead of its first visit from data cached when the site was built,
 * and a shelf saved since would not be in that copy of the list.
 */
export const getShelf = async (
  libraryId: string,
  slug: string,
): Promise<SmartShelf | undefined> => {
  'use cache'
  cacheTag(shelvesTag(libraryId))
  cacheLife('max')
  return (await readShelves(database(), libraryId)).find((shelf) => shelf.slug === slug)
}

/** What saving a shelf takes: a name, the filter, the sort and the grouping, and a slug to change one. */
export const shelfInput = z.object({
  slug: z.string().min(1).max(80).optional(),
  name: z.string().trim().min(1).max(MAX_SHELF_NAME),
  query: z.string().max(MAX_QUERY_LENGTH),
  sort: z.string().max(20),
  group: z.enum(groupings),
})

export type ShelfWrite =
  | { ok: true; slug: string; libraryId: string }
  | { ok: false; reason: 'not-signed-in' | 'invalid' | 'not-kept' | 'not-found' | 'failed' }

const refusal = (error: unknown): ShelfWrite => {
  if (error instanceof LibraryError) {
    return { ok: false, reason: error.code === 'not-found' ? 'not-found' : 'invalid' }
  }
  console.error('Saving a shelf failed', error)
  return { ok: false, reason: 'failed' }
}

/** Saves a shelf in the signed-in account's library. Says why when it will not. */
export const saveMyShelf = async (input: unknown, as?: Account): Promise<ShelfWrite> => {
  const account = as ?? (await currentAccount())
  if (!account) return { ok: false, reason: 'not-signed-in' }
  const parsed = shelfInput.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  // A throwaway copy of the database would forget the shelf: better to say so now.
  if (!databaseIsDurable()) return { ok: false, reason: 'not-kept' }
  try {
    const slug = await saveShelf(database(), account.id, parsed.data)
    return { ok: true, slug, libraryId: account.id }
  } catch (error) {
    return refusal(error)
  }
}

export const removeMyShelf = async (slug: unknown, as?: Account): Promise<ShelfWrite> => {
  const account = as ?? (await currentAccount())
  if (!account) return { ok: false, reason: 'not-signed-in' }
  if (typeof slug !== 'string' || slug.length === 0) return { ok: false, reason: 'invalid' }
  if (!databaseIsDurable()) return { ok: false, reason: 'not-kept' }
  try {
    await removeShelf(database(), account.id, slug)
    return { ok: true, slug, libraryId: account.id }
  } catch (error) {
    return refusal(error)
  }
}
