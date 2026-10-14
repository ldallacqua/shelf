'use server'

import { updateTag } from 'next/cache'

import {
  removeShelfForOwner,
  saveShelfForOwner,
  SHELVES_TAG,
  type ShelfWrite,
} from '@/server/services/shelves'

/**
 * Saving and removing smart shelves, for the interface. Both check who is
 * asking inside the service: a server action can be called by anyone who
 * finds its address.
 */

export async function saveShelfAction(input: unknown): Promise<ShelfWrite> {
  const result = await saveShelfForOwner(input)
  // The owner sees the change on the next page they open.
  if (result.ok) updateTag(SHELVES_TAG)
  return result
}

export async function removeShelfAction(slug: unknown): Promise<ShelfWrite> {
  const result = await removeShelfForOwner(slug)
  if (result.ok) updateTag(SHELVES_TAG)
  return result
}
