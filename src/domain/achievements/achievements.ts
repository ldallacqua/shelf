import type { SyncSource } from '@/domain/library/values'

/**
 * Achievements (issue 72, ADR 003's "Built: achievements"). A provider's
 * set of them for one of its games is shared by every account
 * (`achievement_sets`, `achievements`); each account's progress through a
 * set is its own (`achievement_progress`, `achievement_unlocks`). Steam is
 * the first provider. Xbox and PlayStation join as providers of their own:
 * a set is always one provider's, for one of its games, and nothing is
 * matched across providers by name.
 */

/** The sources whose achievements Shelf reads. */
export const achievementProviders = ['steam'] as const satisfies readonly SyncSource[]
export type AchievementProvider = (typeof achievementProviders)[number]

export const isAchievementProvider = (value: unknown): value is AchievementProvider =>
  typeof value === 'string' && (achievementProviders as readonly string[]).includes(value)

/** A set's id: its provider's, and the provider's own id for the game, such as a Steam app id. */
export const setIdOf = (provider: AchievementProvider, providerSetId: string): string =>
  `${provider}:${providerSetId}`

/** The languages definitions are kept in: the site's. English is the one every provider has. */
export const achievementLanguages = ['en', 'pt-BR'] as const
export type AchievementLanguage = (typeof achievementLanguages)[number]

export const isAchievementLanguage = (value: unknown): value is AchievementLanguage =>
  typeof value === 'string' && (achievementLanguages as readonly string[]).includes(value)

/** An achievement as its provider defines it, in one language. */
export type Definition = {
  /** The provider's own id for it: Steam's API name. */
  id: string
  name: string
  /** Absent where the provider gives none. */
  description?: string
  /** Artwork, unlocked and locked, as addresses on the provider's image servers. */
  icon?: string
  iconLocked?: string
  /** Its provider keeps its details hidden until it is unlocked. */
  hidden: boolean
  /** The share of the provider's own players who unlocked it, 0 to 100: Steam's, not Shelf's. */
  rate?: number
}

/** A set's definitions, as one read of its provider gave them, in the order it lists them. */
export type DefinedSet = {
  title?: string
  achievements: Definition[]
}

/**
 * How many achievements a game has at its provider, and how many of them the
 * account unlocked, as the provider counts them for many games at once.
 */
export type ProgressTotal = { total: number; unlocked: number }

/** One achievement the account has unlocked, and when, if the provider says. */
export type Unlock = { id: string; at?: number }

/**
 * What a provider said about an account's progress through a set:
 * - `read`: its unlocks, with the provider's descriptions of the
 *   achievements it listed, for any the definitions lack.
 * - `private`: the account there keeps its achievements private.
 * - `none`: the game keeps no achievements there.
 */
export type ProgressAnswer =
  | { kind: 'read'; unlocks: Unlock[]; descriptions: Map<string, string> }
  | { kind: 'private' }
  | { kind: 'none' }

/**
 * How far an account's progress through a set is known:
 * - `ready`: read; each achievement is unlocked, locked, or unknown if it was
 *   added to the set after the read.
 * - `pending`: not read yet. The next sync reads it.
 * - `none`: the game has no achievements there.
 * - `private`: the account there keeps its achievements private.
 * - `failed`: the provider did not answer, and nothing was read before.
 */
export const setStates = ['ready', 'pending', 'none', 'private', 'failed'] as const
export type SetState = (typeof setStates)[number]

export const achievementStates = ['unlocked', 'locked', 'unknown'] as const
export type AchievementState = (typeof achievementStates)[number]

/** Why the last read of an account's progress did not work. */
export const progressProblems = ['private', 'unreachable'] as const
export type ProgressProblem = (typeof progressProblems)[number]

/** An achievement as a game's page shows it, in the visitor's language where the provider has it. */
export type AchievementView = Definition & {
  /** Its name and description are in English: the provider has none in the visitor's language. */
  inEnglish?: true
  state: AchievementState
  /** Milliseconds since 1970, when the provider gave the moment; never a made-up one. */
  unlockedAt?: number
}

/** One of a game's sets, with the account's progress through it. */
export type AchievementSetView = {
  provider: AchievementProvider
  /** The provider's id for the game: a Steam app id. */
  setId: string
  /** The game's name there. */
  title: string
  state: SetState
  /** When the account's progress was last read. */
  readAt?: number
  /** When the unlock rates were last read. */
  ratesAt?: number
  /**
   * Kept from a link that is gone: the account was disconnected from the
   * provider since, so nothing reads it again.
   */
  snapshot?: true
  /** The last read failed: what is shown is as of `readAt`. */
  problem?: ProgressProblem
  /** In the provider's order. Only for `ready`. */
  achievements: AchievementView[]
}

/** A game's achievements, a set per game it is at a provider: Steam can list a game and its mode apart. */
export type GameAchievements = { sets: AchievementSetView[] }

/**
 * How far an account's achievements at a provider are read, for its card:
 * the games on the shelf from it, those whose achievements are known (read,
 * or the game has none), and those the provider keeps private.
 */
export type AchievementCounts = { games: number; known: number; private: number }

/** One step of reading an account's achievements. The page asks again while `remaining` is above 0. */
export type AchievementStep = {
  /** Games whose achievements this step read. */
  read: number
  /** Games still to read now. */
  remaining: number
  counts: AchievementCounts
  /** The provider kept the account's achievements private, or did not answer for some. */
  problem: ProgressProblem | null
}
