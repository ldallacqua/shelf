import type { SyncSource } from '@/domain/library/values'
import type { Decision, ItemState } from '@/domain/sync/items'

/**
 * An account's link to a source as the account page shows it, and what one
 * step of a sync answers. The page draws from these and nothing else.
 */

/**
 * Why a source's list could not be read:
 * - `private`: the account there hides its games (Steam: "Game details" is not public).
 * - `unreachable`: the source did not answer, or answered with an error.
 * - `unset`: this server has no key for the source.
 */
export const linkProblems = ['private', 'unreachable', 'unset'] as const
export type LinkProblem = (typeof linkProblems)[number]

export type ItemCounts = Record<ItemState, number> & {
  /** On my shelf, but no longer listed by the source. */
  notSeen: number
}

export type LinkView = {
  source: SyncSource
  externalId: string
  name: string | null
  daily: boolean
  linkedAt: number
  readAt: number | null
  syncedAt: number | null
  problem: LinkProblem | null
  counts: ItemCounts
}

/** One step of a sync. The page asks for steps until nothing is left to add. */
export type SyncStep = {
  link: LinkView
  /** Games put on the shelf by this step. */
  added: number
  /** Matched games still to add: another step is worth asking for. */
  remaining: number
  /** The library's version after this step, for the shelf to fetch. */
  version: number
}

/** A game the source listed, as the page's lists show it. */
export type ItemView = {
  id: string
  title: string
  storeId: string
  minutes: number
  lastPlayedAt: number | null
  lastSeenAt: number
  state: ItemState
  decision: Decision
  /** Its game on my shelf, for a link to it. */
  onShelf?: { slug: string; title: string }
}

/** Which of an account's items a list shows. */
export const itemLists = ['needs-you', 'hidden', 'not-seen'] as const
export type ItemList = (typeof itemLists)[number]

/** Most items a list sends at once. */
export const MAX_LISTED = 500
