'use server'

import { updateTag } from 'next/cache'

import { addMyGame, groupingFor, searchToAdd, undoMyAdd } from '@/server/services/adding'
import { libraryTag } from '@/server/services/library'
import { addSteamGame, readSteamLink } from '@/server/services/steam-adding'

/**
 * Adding games, for the interface, each to the signed-in account's own
 * library. Each checks who is asking inside the service: a server action
 * can be called by anyone who finds its address.
 */

export async function searchGamesAction(text: unknown) {
  return searchToAdd(text)
}

export async function groupingAction(igdbId: unknown) {
  return groupingFor(igdbId)
}

export async function addGameAction(input: unknown) {
  const result = await addMyGame(input)
  // The account sees the game at once, on this page and the next.
  if (result.ok) updateTag(libraryTag(result.libraryId))
  return result
}

export async function steamLinkAction(appId: unknown) {
  return readSteamLink(appId)
}

export async function addSteamGameAction(input: unknown) {
  const result = await addSteamGame(input)
  if (result.ok) updateTag(libraryTag(result.libraryId))
  return result
}

export async function undoAddAction(added: unknown) {
  const result = await undoMyAdd(added)
  if (result.ok) updateTag(libraryTag(result.libraryId))
  return result
}
