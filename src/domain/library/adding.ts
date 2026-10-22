import { z } from 'zod'

import type { FamilyLink } from '@/domain/igdb/game'
import type { SearchResult } from '@/domain/igdb/search'
import { formats, statuses, type Format, type Relation } from '@/domain/library/values'

/**
 * Adding a game (spec 4): what the search answers, how a game relates to
 * what is already on the shelf, and what adding one takes.
 */

/** The entry a result already is, under any of its versions: "In library", which opens it. */
export type OnShelf = { slug: string; title: string }

export type Candidate = SearchResult & { onShelf?: OnShelf }

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
  /** My answer to the proposal: fold it in, or keep it apart. Absent: the default. */
  grouping: z.enum(['join', 'separate']).optional(),
})

export type AddInput = z.infer<typeof addInput>

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

export const refusalReasons = [
  'not-signed-in',
  'invalid',
  'not-found',
  'conflict',
  'not-kept',
  'igdb',
  'too-many',
  'failed',
] as const

/** Why an account's request was not carried out, in words the interface has a sentence for. */
export type Refusal = { ok: false; reason: (typeof refusalReasons)[number] }

export type Answer<T> = { ok: true; value: T } | Refusal
