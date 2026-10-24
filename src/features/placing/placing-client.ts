'use client'

import type { Answer } from '@/domain/library/adding'
import type { Changed } from '@/domain/library/editing'
import type { Placing, Standing } from '@/domain/library/placing'
import type { Status } from '@/domain/library/values'
import { editClient } from '@/features/game-detail/edit-client'
import { callApi } from '@/features/owner/call-api'

/**
 * The page for placing a sync's games, talking to the API (spec 4.5). One
 * game's status or rating is the editor's own write; many games given one
 * status are one write, so the library changes once.
 */

export const readUnsorted = (signal?: AbortSignal): Promise<Answer<Placing>> =>
  callApi<Placing>('GET', '/api/v1/me/unsorted', undefined, signal)

export const placeGame = (entryId: string, status: Status): Promise<Answer<Changed>> =>
  editClient.update(entryId, { status })

export const placeGames = (entries: readonly string[], status: Status): Promise<Answer<Changed>> =>
  callApi<Changed>('PATCH', '/api/v1/entries', { entries, status })

/** Out of a hundred, as stored; null takes it away. */
export const rateGame = (entryId: string, rating: number | null): Promise<Answer<Changed>> =>
  editClient.update(entryId, { rating })

/** How many of my games stand in each status, without the games. */
export const readTally = (signal?: AbortSignal): Promise<Answer<Standing>> =>
  callApi<Standing>('GET', '/api/v1/me/tally', undefined, signal)
