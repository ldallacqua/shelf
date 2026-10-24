import type { SyncSource } from '@/domain/library/values'
import type { Decision, ItemState, StoreKind } from '@/domain/sync/items'

/**
 * An account's link to a source as the account page shows it, and what one
 * step of a sync answers. The page draws from these and nothing else.
 */

/**
 * Why a source's list could not be read:
 * - `private`: the account there hides its games (Steam: "Game details" is not public).
 * - `unreachable`: the source did not answer, or answered with an error.
 * - `unset`: this server has no key for the source.
 * - `signed-out`: the source ended the session its sign-in gave (Nintendo's lasts about
 *   two years, or until the person removes Shelf there): sign in again.
 */
export const linkProblems = ['private', 'unreachable', 'unset', 'signed-out'] as const
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
  /** What the store says it is; null until asked. */
  kind: StoreKind | null
  /** Its game on my shelf, for a link to it. */
  onShelf?: { slug: string; title: string }
  /**
   * For a game a source saw me play: the game Shelf takes it for, which
   * waits for me to confirm it and say how I own it.
   */
  match?: ItemMatch
}

/** The game an item was matched to, as the lists show it: its cover is an address on IGDB's servers. */
export type ItemMatch = { igdbId: number; title: string; year: number | null; cover: string | null }

/**
 * How pasting the link from Nintendo's "Select this account" button went:
 * - `linked`: the account is linked, or signed in again.
 * - `not-the-link`: what was pasted is not that button's link.
 * - `another-sign-in`: the link is from another sign-in than this browser's last: sign in again.
 * - `code-refused`: Nintendo refused the link's code, good once, for a few minutes: sign in again.
 * - `unset`: this server cannot keep Nintendo's session (it has no key to seal it with).
 * - `unreachable`: Nintendo did not answer.
 */
export const nintendoLinkOutcomes = [
  'linked',
  'not-the-link',
  'another-sign-in',
  'code-refused',
  'unset',
  'unreachable',
] as const
export type NintendoLinkOutcome = (typeof nintendoLinkOutcomes)[number]

/** Which of an account's items a list shows. */
export const itemLists = ['needs-you', 'hidden', 'not-seen'] as const
export type ItemList = (typeof itemLists)[number]

/** Most items a list sends at once. */
export const MAX_LISTED = 500
