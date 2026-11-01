import { z } from 'zod'

import type { FamilyLink } from '@/domain/igdb/game'
import type { SearchResult } from '@/domain/igdb/search'
import { formats, statuses, type Format, type Relation } from '@/domain/library/values'

/**
 * Adding a game (spec 4): what the search answers, how a game relates to
 * what is already on the shelf, and what adding one takes.
 */

/** The entry a result already is, under any of its versions: "In library", which opens it. */
/** A game I have already. Archived (spec 7.4), its entry, to bring it back rather than add it again. */
export type OnShelf = { slug: string; title: string; archived?: string }

export type Candidate = SearchResult & {
  onShelf?: OnShelf
  /** Read from Steam, because IGDB does not have it (ADR 006). Its `igdbId` means nothing. */
  steam?: SteamOrigin
}

export type SteamOrigin = {
  appId: string
  /** Steam marks it as adult: "Hide adult games" takes it. */
  adult: boolean
  /** A moderator added it already: its title is theirs, and every shelf shares it. */
  known: boolean
}

/** A platform's names, for the chips and the results. */
export type PlatformLabel = { id: number; key: string; name: string; short: string }

/**
 * How I have owned games so far: the platforms I own most on, most first,
 * and the format I last chose on each. A new game's chips follow the first;
 * picking a chip starts at the second.
 */
export type Habits = { order: number[]; formats: Record<number, Format> }

export type SearchAnswer = {
  results: Candidate[]
  /** Names for every platform the results mention. */
  platforms: PlatformLabel[]
  habits: Habits
}

/**
 * Where the game goes, as ADR 001 proposes it: its own entry, or folded
 * into a related one already on the shelf. `ask` when the default needs my
 * yes (a remaster, an expanded game, a remake).
 */
export type Grouping =
  | { action: 'new' }
  | { action: 'already'; entry: OnShelf }
  | {
      action: 'join' | 'separate'
      entry: OnShelf & { platforms: number[] }
      relation: Relation
      because: FamilyLink
      ask: boolean
    }

export const MIN_SEARCH = 2
export const MAX_SEARCH = 100
export const MAX_TAGS = 20

/** One game to add, as the form sends it. Checked on the server, whoever sends it. */
export const addInput = z.object({
  igdbId: z.number().int().positive(),
  status: z.enum(statuses),
  copies: z
    .array(z.object({ platformId: z.number().int().positive(), format: z.enum(formats) }))
    .max(30),
  /** 0 to 100; the form asks out of ten. */
  rating: z.number().int().min(0).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(MAX_TAGS).optional(),
  completedOn: z.iso.date().optional(),
  /** On the wishlist, the platforms I want it on (spec 7.5). */
  wanted: z.array(z.number().int().positive()).max(20).optional(),
  /** My answer to the proposal: fold it in, or keep it apart. Absent: the default. */
  grouping: z.enum(['join', 'separate']).optional(),
})

export type AddInput = z.infer<typeof addInput>

export const MAX_STEAM_TITLE = 200

/** A game to add from Steam's store (ADR 006): the rest is read from Steam again, on the server. */
export const addSteamInput = addInput.omit({ igdbId: true, grouping: true }).extend({
  appId: z.string().regex(/^[1-9]\d{0,9}$/),
  /** What the moderator calls it, where Steam's own name is not how it is written. */
  title: z.string().trim().min(1).max(MAX_STEAM_TITLE).optional(),
})

export type AddSteamInput = z.infer<typeof addSteamInput>

/**
 * What a pasted Steam link is (ADR 006): a game to add, shown as a result like
 * any other; or why not. IGDB having it means searching is the way, so a game
 * never stands twice in the catalog.
 */
export type SteamLinkAnswer =
  | { kind: 'game'; answer: SearchAnswer }
  | { kind: 'igdb'; title: string }
  | { kind: 'not-a-game'; title: string }
  | { kind: 'not-found' }

/** Platforms a game can be owned on, my most-used first, then in shelf order. */
export const orderByHabit = (platformIds: readonly number[], habits: Habits): number[] => {
  const rank = new Map(habits.order.map((id, index) => [id, index]))
  return [...new Set(platformIds)]
    .map((id, index) => ({ id, index }))
    .sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.index - b.index,
    )
    .map(({ id }) => id)
}

/** What an add wrote, so Undo can take exactly that back. */
export type Added = {
  entryId: string
  gameId: string
  /** False when it joined an entry that was already there. */
  newEntry: boolean
  /** True when the record was linked to the entry by this add. */
  newVersion: boolean
  copyIds: string[]
}

export type AddedGame = { slug: string; title: string; version: number; undo: Added }

/**
 * A game taken for the wrong one, now the one I said: the entry it is
 * (another, when it folded into the game already on my shelf), and its
 * address and title as the shelf shows them.
 */
export type Rematched = {
  version: number
  entryId: string
  slug: string
  title: string
  /** It folded into the game already on my shelf. */
  merged: boolean
}

export const refusalReasons = [
  'not-signed-in',
  'invalid',
  'not-found',
  'conflict',
  'not-kept',
  'igdb',
  'too-many',
  'not-allowed',
  'steam',
  'failed',
] as const

/** Why an account's request was not carried out, in words the interface has a sentence for. */
export type Refusal = { ok: false; reason: (typeof refusalReasons)[number] }

export type Answer<T> = { ok: true; value: T } | Refusal
