import 'server-only'

import { cacheLife, cacheTag } from 'next/cache'
import { z } from 'zod'

import { groupings } from '@/domain/library/group'
import { MAX_SHELF_NAME, type SmartShelf } from '@/domain/library/shelves'
import { MAX_QUERY_LENGTH } from '@/domain/library/view'
import { isOwner } from '@/server/auth/owner'
import { database, databaseIsDurable } from '@/server/db/client'
import { LibraryError, readShelves, removeShelf, saveShelf } from '@/server/library/store'

/**
 * Smart shelves (spec 5.5). Anyone may read them; only the owner may save
 * or remove one. Every read is cached under its own tag, which every write
 * expires.
 */

export const SHELVES_TAG = 'shelves'

export const getShelves = async (): Promise<SmartShelf[]> => {
  'use cache'
  cacheTag(SHELVES_TAG)
  cacheLife('max')
  return readShelves(database())
}

/**
 * One shelf, cached by its slug. Not a search of `getShelves`: a shelf's page
 * is built ahead of its first visit from data cached when the site was built,
 * and a shelf saved since would not be in that copy of the list.
 */
export const getShelf = async (slug: string): Promise<SmartShelf | undefined> => {
  'use cache'
  cacheTag(SHELVES_TAG)
  cacheLife('max')
  return (await readShelves(database())).find((shelf) => shelf.slug === slug)
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
  | { ok: true; slug: string }
  | { ok: false; reason: 'not-signed-in' | 'invalid' | 'not-kept' | 'not-found' | 'failed' }

const refusal = (error: unknown): ShelfWrite => {
  if (error instanceof LibraryError) {
    return { ok: false, reason: error.code === 'not-found' ? 'not-found' : 'invalid' }
  }
  console.error('Saving a shelf failed', error)
  return { ok: false, reason: 'failed' }
}

/** Saves a shelf for the owner. Says why when it will not. */
export const saveShelfForOwner = async (input: unknown): Promise<ShelfWrite> => {
  if (!(await isOwner())) return { ok: false, reason: 'not-signed-in' }
  const parsed = shelfInput.safeParse(input)
  if (!parsed.success) return { ok: false, reason: 'invalid' }
  // A throwaway copy of the database would forget the shelf: better to say so now.
  if (!databaseIsDurable()) return { ok: false, reason: 'not-kept' }
  try {
    return { ok: true, slug: await saveShelf(database(), parsed.data) }
  } catch (error) {
    return refusal(error)
  }
}

export const removeShelfForOwner = async (slug: unknown): Promise<ShelfWrite> => {
  if (!(await isOwner())) return { ok: false, reason: 'not-signed-in' }
  if (typeof slug !== 'string' || slug.length === 0) return { ok: false, reason: 'invalid' }
  if (!databaseIsDurable()) return { ok: false, reason: 'not-kept' }
  try {
    await removeShelf(database(), slug)
    return { ok: true, slug }
  } catch (error) {
    return refusal(error)
  }
}
