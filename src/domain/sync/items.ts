import type { Format, Status } from '@/domain/library/values'

/**
 * A source's games as the sync remembers them (ADR 003, decision 3): one
 * item per game the source reports, what it was matched to, and what I
 * decided about it. Every decision is kept, so a later sync asks nothing it
 * has asked before.
 */

/** One game as a source reports it, before anything is matched. */
export type Reported = {
  /** The source's own id for it: a Steam app id, a PlayStation concept id. */
  storeId: string
  title: string
  /** An IGDB platform id, when the source says which. */
  platformId?: number
  year?: number
  minutes: number
  /** Milliseconds, when the source says. */
  lastPlayedAt?: number
}

/**
 * - `pending`: waiting for me: no match, or a played game's format question.
 * - `copy`: it is (or is about to be) a copy on my shelf.
 * - `not_mine`, `not_a_game`: my answer; never asked again.
 * - `removed`: I took its copy off my shelf, so a sync does not put it back.
 */
export const decisions = ['pending', 'copy', 'not_mine', 'not_a_game', 'removed'] as const
export type Decision = (typeof decisions)[number]

/**
 * What the store says an item is, asked once (null until then). The ladder
 * matches only what may be a game:
 * - `game`: a game, or anything the store does not set apart; the ladder decides.
 * - `demo`: a demo or a playtest. Playing one is not owning the game.
 * - `software`: a tool or an application.
 * - `media`: a video, a soundtrack, a guide.
 * - `part`: a mode the store lists apart from its game, as a multiplayer or a
 *   zombies mode is: the ladder matches its game, so its hours join that copy.
 * - `unknown`: the store has no page for it.
 */
export const storeKinds = ['game', 'demo', 'software', 'media', 'part', 'unknown'] as const
export type StoreKind = (typeof storeKinds)[number]

/**
 * What the store said about one item: its kind, and for a part, the store's
 * id for its game. A part the store names no game for is matched to one of
 * my items by title (`gameOfMode`), or taken as a game.
 */
export type StoreKindOf = { kind: StoreKind; parentStoreId?: string }

/** Kinds the sync leaves out by itself, as if I had answered "not a game". */
export const setAsideKinds = ['demo', 'software', 'media'] as const
export type SetAsideKind = (typeof setAsideKinds)[number]

export const isSetAside = (kind: StoreKind | null): kind is SetAsideKind =>
  (setAsideKinds as readonly (StoreKind | null)[]).includes(kind)

/** Which rung of the ladder found its game. */
export const resolutions = ['store_id', 'title', 'owner'] as const
export type Resolution = (typeof resolutions)[number]

/** A played game's copy: what my answer to "how do you own it?" makes it. */
export const itemFormats = ['physical', 'digital', 'subscription'] as const
export type ItemFormat = (typeof itemFormats)[number]

export const isOwnedFormat = (format: ItemFormat): format is Format => format !== 'subscription'

/** What the page says about an item. */
export type ItemState = 'on-shelf' | 'adding' | 'needs-you' | 'hidden'

export const stateOf = (item: { decision: Decision; copyId: string | null }): ItemState => {
  if (item.decision === 'copy') return item.copyId ? 'on-shelf' : 'adding'
  if (item.decision === 'pending') return 'needs-you'
  return 'hidden'
}

/** Played on the source this recently: the game is one I am playing. Steam's own "recent" window. */
export const RECENT_DAYS = 14

/**
 * Where a game new to my shelf starts. A sync never changes a status I set;
 * this is only the first one, for a game it adds. Owning a game says nothing
 * of where it stands with me, so it waits, unsorted, for me to place it; one
 * the source saw me play these two weeks is one I am playing.
 */
export const firstStatus = (item: Pick<Reported, 'lastPlayedAt'>, now: number): Status =>
  item.lastPlayedAt !== undefined && now - item.lastPlayedAt <= RECENT_DAYS * 24 * 60 * 60 * 1000
    ? 'playing'
    : 'unsorted'
