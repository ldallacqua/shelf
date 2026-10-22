'use server'

import { updateTag } from 'next/cache'

import { removeMyShelf, saveMyShelf, shelvesTag, type ShelfWrite } from '@/server/services/shelves'

/**
 * Saving and removing smart shelves, for the interface, in the signed-in
 * account's own library. Both check who is asking inside the service: a
 * server action can be called by anyone who finds its address.
 */

export async function saveShelfAction(input: unknown): Promise<ShelfWrite> {
  const result = await saveMyShelf(input)
  // The account sees the change on the next page it opens.
  if (result.ok) updateTag(shelvesTag(result.libraryId))
  return result
}

export async function removeShelfAction(slug: unknown): Promise<ShelfWrite> {
  const result = await removeMyShelf(slug)
  if (result.ok) updateTag(shelvesTag(result.libraryId))
  return result
}
