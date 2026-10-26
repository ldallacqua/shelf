import type { PlayableGame } from '@/domain/library/editing'
import type { OnThisComputer } from '@/domain/library/ready'

import { call } from './tauri'

/**
 * What Ready to play reads (spec 7.7), fetched only in Shelf for Windows, on
 * one's own shelf (`use-ready.ts`). Read without Zod, which must stay out of
 * the library's first load: two lists of strings are checked by hand.
 */

const strings = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string')

/** Asks the app; undefined from an app that cannot say, one from before Ready to play. */
export const readOnThisComputer = async (): Promise<OnThisComputer | undefined> => {
  try {
    const answer = (await call('playable')) as { entries?: unknown; steam?: unknown } | null
    if (answer && strings(answer.entries) && strings(answer.steam)) {
      return { entries: answer.entries, steam: answer.steam }
    }
  } catch {
    // An app without the command refuses it.
  }
  return undefined
}

const isPlayable = (value: unknown): value is PlayableGame => {
  const game = value as Partial<PlayableGame> | null
  return typeof game?.slug === 'string' && typeof game.entryId === 'string' && strings(game.steam)
}

/** My games' entries and apps on Steam, from Shelf (`GET /api/v1/me/play`); undefined if it did not say. */
export const readMyPlayable = async (): Promise<PlayableGame[] | undefined> => {
  const response = await fetch('/api/v1/me/play', { cache: 'no-store' })
  if (!response.ok) return undefined
  const { games } = (await response.json()) as { games?: unknown }
  return Array.isArray(games) && games.every(isPlayable) ? games : undefined
}
