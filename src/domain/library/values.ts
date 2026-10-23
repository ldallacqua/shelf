/**
 * The small fixed vocabularies of a library. Each list is the single source:
 * the database's CHECK constraints, the Zod schemas and the interface's
 * labels are all built from these.
 */

/**
 * Where a game stands with me. The order is the order shelves appear in.
 * `unsorted` is a game a sync brought in that I have not placed yet: not my
 * backlog until I say so. It comes last, so the data files' numbers for the
 * others stay as they were.
 */
export const statuses = [
  'playing',
  'backlog',
  'completed',
  'dropped',
  'wishlist',
  'unsorted',
] as const
export type Status = (typeof statuses)[number]

/** How a copy is owned. */
export const formats = ['physical', 'digital'] as const
export type Format = (typeof formats)[number]

/**
 * What a linked IGDB record is to its entry. Exactly one is `primary`: it
 * supplies the title, the cover and everything filters read.
 */
export const relations = [
  'primary',
  'edition',
  'port',
  'remaster',
  'expanded',
  'remake',
  'other',
] as const
export type Relation = (typeof relations)[number]

/** What kind of release an IGDB record is, in our words. */
export const kinds = [
  'main',
  'remake',
  'remaster',
  'expanded',
  'port',
  'bundle',
  'expansion',
  'other',
] as const
export type Kind = (typeof kinds)[number]

/**
 * The stores and consoles a library can be synced from (ADR 003). All four
 * are here from the first, so the database's checks need no change as each
 * one is built; `domain/sync/sources.ts` says which are ready.
 */
export const syncSources = ['steam', 'playstation', 'xbox', 'nintendo'] as const
export type SyncSource = (typeof syncSources)[number]

/** Where a playtime figure came from: typed by me, or reported by a source. */
export const playTimeSources = ['manual', ...syncSources] as const
export type PlayTimeSource = (typeof playTimeSources)[number]

export const isStatus = (value: unknown): value is Status =>
  typeof value === 'string' && (statuses as readonly string[]).includes(value)

export const isFormat = (value: unknown): value is Format =>
  typeof value === 'string' && (formats as readonly string[]).includes(value)

/** A calendar day with no time of day, as `YYYY-MM-DD`. */
export type Day = string

const DAY = /^\d{4}-\d{2}-\d{2}$/

export const isDay = (value: unknown): value is Day => {
  if (typeof value !== 'string' || !DAY.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

/** The UTC calendar day of a moment given in milliseconds. */
export const dayOf = (ms: number): Day => new Date(ms).toISOString().slice(0, 10)

/** A rating is a whole number from 0 to 100. The interface shows it out of ten. */
export const isRating = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100
