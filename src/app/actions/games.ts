'use server'

import { updateTag } from 'next/cache'

import {
  addGameForOwner,
  groupingFor,
  searchToAdd,
  undoAddForOwner,
} from '@/server/services/adding'
import { LIBRARY_TAG } from '@/server/services/library'

/**
 * Adding games, for the interface. Each checks who is asking inside the
 * service: a server action can be called by anyone who finds its address.
 */

export async function searchGamesAction(text: unknown) {
  return searchToAdd(text)
}

export async function groupingAction(igdbId: unknown) {
  return groupingFor(igdbId)
}

export async function addGameAction(input: unknown) {
  const result = await addGameForOwner(input)
  // The owner sees the game at once, on this page and the next.
  if (result.ok) updateTag(LIBRARY_TAG)
  return result
}

export async function undoAddAction(added: unknown) {
  const result = await undoAddForOwner(added)
  if (result.ok) updateTag(LIBRARY_TAG)
  return result
}
