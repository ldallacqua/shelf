import { statuses, type Status } from '@/domain/library/values'

import { MAX_CONTENDERS, MIN_CONTENDERS, type Duel } from './bracket'

/**
 * What the duel remembers on this device, for one account (spec 3.14): which statuses its games
 * are drawn from, the games chosen for the next duel, and the duel under way or just finished, so a
 * reload, a look at a game's page or Back returns to the same place. Read back from storage, which
 * is never trusted to be well formed.
 */
export type DuelMemory = {
  /** The statuses the games to choose from have. */
  from: Status[]
  /** The games chosen for the next duel, by address, in the order they were chosen. */
  chosen: string[]
  duel?: Duel
}

/** What is waiting to be played (as the trophy page's backlog counts it): the first choice. */
export const WAITING: readonly Status[] = ['backlog', 'someday']

/** The statuses a game to play next may have: never one finished, or not yet placed. */
export const duelStatuses = [
  'backlog',
  'someday',
  'wishlist',
  'playing',
  'dropped',
] as const satisfies readonly Status[]

const isStatus = (value: unknown): value is Status =>
  typeof value === 'string' && (statuses as readonly string[]).includes(value)

const isSlugList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((each) => typeof each === 'string' && each.length > 0)

const fresh = (): DuelMemory => ({ from: [...WAITING], chosen: [] })

/** What was stored, read back; anything this version cannot read is forgotten. */
export function parseDuelMemory(stored: unknown): DuelMemory {
  if (typeof stored !== 'string') return fresh()
  let value: unknown
  try {
    value = JSON.parse(stored)
  } catch {
    return fresh()
  }
  if (typeof value !== 'object' || value === null) return fresh()
  const { from, chosen, duel } = value as { from?: unknown; chosen?: unknown; duel?: unknown }
  const statusesFrom = Array.isArray(from)
    ? [...new Set(from.filter(isStatus))].filter((status) =>
        (duelStatuses as readonly string[]).includes(status),
      )
    : []
  const memory: DuelMemory = {
    from: statusesFrom.length > 0 ? statusesFrom : [...WAITING],
    chosen: isSlugList(chosen) ? [...new Set(chosen)].slice(0, MAX_CONTENDERS) : [],
  }
  if (typeof duel !== 'object' || duel === null) return memory
  const { contenders, picks } = duel as { contenders?: unknown; picks?: unknown }
  if (
    isSlugList(contenders) &&
    isSlugList(picks) &&
    new Set(contenders).size === contenders.length &&
    contenders.length >= MIN_CONTENDERS &&
    contenders.length <= MAX_CONTENDERS &&
    picks.length < contenders.length &&
    picks.every((slug) => contenders.includes(slug))
  ) {
    memory.duel = { contenders, picks }
  }
  return memory
}

export const writeDuelMemory = (memory: DuelMemory): string => JSON.stringify(memory)

/**
 * The duel kept, if every game in it is still on the shelf (a game taken off it meanwhile ends
 * the duel: its place can't be played); otherwise none, and the games still there, to start again
 * with. A game whose status changed stays in: the duel was drawn from what was waiting then.
 */
export function stillStanding(
  duel: Duel,
  known: ReadonlySet<string>,
): { duel: Duel } | { left: string[] } {
  const left = duel.contenders.filter((slug) => known.has(slug))
  return left.length === duel.contenders.length ? { duel } : { left }
}
