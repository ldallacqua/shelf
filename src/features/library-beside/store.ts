'use client'

import { useSyncExternalStore } from 'react'

import type { Grouping } from '@/domain/library/group'
import type { Library } from '@/domain/library/library'
import type { Sort } from '@/domain/library/sort'
import type { ShelfInfo } from '@/features/library/shelf-address'

/**
 * What the list of my library beside a game's page (ADR 009, phase 2) is
 * told, and what it tells the page. A game's address is the game's alone
 * (phase 1), so the list cannot read the library's arrangement from it:
 * the library hands it over as it opens a game, as it hands over the drawn
 * page (`hand-off.tsx`). Opened any other way, the page says which shelf it
 * is on and the list starts from how this device last arranged a library.
 *
 * Kept in the browser only: nothing here is ever read on the server.
 */

/** How the library stood when a game was opened from it. */
export type Arrangement = {
  group: Grouping
  sort: Sort
  seed: string
  /** The library's filter, as text. */
  q: string
  /** The smart shelf it was opened from, while the shelf's filter is as it was saved. */
  shelfName?: string
}

/** The library's hand-over, with each game opened from it. */
export type HandedOver = {
  handle: string
  shelf: ShelfInfo
  version: number
  /** The whole library, once it had arrived: the list draws from it at once. */
  library?: Library
  arrangement: Arrangement
  /** One more with each hand-over: the list starts again from the library's arrangement. */
  id: number
}

/** The shelf a game's page is on, as the page knows it. */
export type KnownShelf = { shelf: ShelfInfo; version: number }

/** One game in the list's order: what Previous and Next need to say and open it. */
export type Step = { slug: string; title: string }

/** What the list tells the page: its games in order, and how it opens one. */
export type ListOrder = {
  handle: string
  games: readonly Step[]
  /** Opens a game as the list does, drawn at once; `replace` for a step, which adds no history. */
  open: (slug: string, options?: { replace?: boolean }) => void
}

let handed: HandedOver | undefined
let known: KnownShelf | undefined
let order: ListOrder | undefined
let handOvers = 0
const listeners = new Set<() => void>()

const changed = () => {
  for (const listener of [...listeners]) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** The library is opening one of its games: the list beside it follows this. */
export const handOverList = (handOver: Omit<HandedOver, 'id'>): void => {
  handOvers += 1
  handed = { ...handOver, id: handOvers }
  changed()
}

/** The page says which shelf it is on. Nothing changes if it says what is already known. */
export const knowShelf = (next: KnownShelf): void => {
  if (
    known &&
    known.version === next.version &&
    known.shelf.handle === next.shelf.handle &&
    known.shelf.name === next.shelf.name &&
    sameFiles(known.shelf, next.shelf)
  ) {
    return
  }
  known = next
  changed()
}

const sameFiles = (a: ShelfInfo, b: ShelfInfo) =>
  a.files.kind === b.files.kind &&
  (a.files.kind === 'mine' || (b.files.kind === 'public' && a.files.key === b.files.key))

/** The list's order, for the page's Previous and Next; nothing once the list is gone. */
export const publishOrder = (next: ListOrder | undefined): void => {
  if (next === order) return
  order = next
  changed()
}

/** Withdraws the list's order, if it is still this one. */
export const withdrawOrder = (mine: ListOrder): void => {
  if (order === mine) publishOrder(undefined)
}

const none = () => undefined

/** The library's last hand-over, if it was for this shelf. */
export const useHandedOver = (handle: string | undefined): HandedOver | undefined =>
  useSyncExternalStore(
    subscribe,
    () => (handle !== undefined && handed?.handle === handle ? handed : undefined),
    none,
  )

/** The shelf as its page last said, if it is this one. */
export const useKnownShelf = (handle: string | undefined): KnownShelf | undefined =>
  useSyncExternalStore(
    subscribe,
    () => (handle !== undefined && known?.shelf.handle === handle ? known : undefined),
    none,
  )

/** The list's order, if the list beside this shelf's games has one. */
export const useListOrder = (handle: string | undefined): ListOrder | undefined =>
  useSyncExternalStore(
    subscribe,
    () => (handle !== undefined && order?.handle === handle ? order : undefined),
    none,
  )

/**
 * The games before and after this one, in the list's order. A game the list
 * no longer shows (the search leaves it out) has neither.
 */
export const stepsOf = (
  games: readonly Step[] | undefined,
  slug: string,
): { previous?: Step; next?: Step } => {
  const at = games?.findIndex((game) => game.slug === slug) ?? -1
  if (!games || at < 0) return {}
  return { previous: games[at - 1], next: games[at + 1] }
}

/** For tests: forgets everything. */
export const forgetAll = (): void => {
  handed = undefined
  known = undefined
  order = undefined
  changed()
}
