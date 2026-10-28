import type {
  AchievementProvider,
  AchievementSetView,
  AchievementView,
} from '@/domain/achievements/achievements'

/**
 * What achievements add up to (issue 72): a set's progress, and a library's
 * totals, for a game's page now and the trophy page later. Every figure is
 * worked out from the provider's latest answer, never added to the last
 * one, so reading a set twice counts it once.
 */

export type SetProgress = {
  earned: number
  /** Achievements in the set as last read. */
  total: number
  /** Added to the set since the account's progress was read: neither earned nor not. */
  unknown: number
  /**
   * Whole percent, rounded down so 99.5 is never 100. Only when every
   * achievement's state is known and the set has any.
   */
  percent?: number
  /** Every achievement known, and every one unlocked: never for a set with none. */
  complete: boolean
}

/** A set's progress, or nothing while it is not known. */
export const progressOf = (set: AchievementSetView): SetProgress | undefined => {
  if (set.state !== 'ready') return undefined
  const total = set.achievements.length
  let earned = 0
  let unknown = 0
  for (const achievement of set.achievements) {
    if (achievement.state === 'unlocked') earned += 1
    else if (achievement.state === 'unknown') unknown += 1
  }
  const known = total > 0 && unknown === 0
  return {
    earned,
    total,
    unknown,
    ...(known ? { percent: Math.floor((earned * 100) / total) } : {}),
    complete: known && earned === total,
  }
}

/** A game's achievements, for the totals: only games a visitor may see are given. */
export type AchievementGame = {
  slug: string
  title: string
  sets: readonly AchievementSetView[]
}

/** An unlocked achievement, with the game and set it is in. */
export type UnlockedIn = {
  slug: string
  game: string
  provider: AchievementProvider
  setId: string
  achievement: AchievementView
}

export type AchievementSummary = {
  /** Games with at least one set whose progress is known. */
  games: number
  /** Achievements unlocked, in those games' known sets. */
  unlocked: number
  /** Achievements in those sets, unlocked or not. */
  available: number
  /**
   * Games where every set that has achievements is complete, and one does.
   * Shelf's own count: Steam's "Perfect Games" has rules of its own.
   */
  perfect: number
  /** The latest unlocks with a known moment, newest first. */
  recent: UnlockedIn[]
  /** The unlocks fewest of the provider's players have, rarest first. */
  rarest: UnlockedIn[]
  /** The oldest and the newest read behind these figures. */
  readFrom?: number
  readTo?: number
}

/** A library's achievement totals, over the games given. */
export const summarize = (
  games: readonly AchievementGame[],
  { recent = 10, rarest = 10 }: { recent?: number; rarest?: number } = {},
): AchievementSummary => {
  const summary: AchievementSummary = {
    games: 0,
    unlocked: 0,
    available: 0,
    perfect: 0,
    recent: [],
    rarest: [],
  }
  const unlocks: UnlockedIn[] = []
  for (const game of games) {
    let known = false
    let perfect = true
    let anyAchievements = false
    for (const set of game.sets) {
      const progress = progressOf(set)
      if (!progress) {
        // A set not known, or with none: it cannot make the game perfect, nor stop it.
        if (set.state !== 'none') perfect = false
        continue
      }
      known = true
      summary.unlocked += progress.earned
      summary.available += progress.total
      if (progress.total > 0) anyAchievements = true
      if (progress.total > 0 && !progress.complete) perfect = false
      if (set.readAt !== undefined) {
        summary.readFrom = Math.min(summary.readFrom ?? set.readAt, set.readAt)
        summary.readTo = Math.max(summary.readTo ?? set.readAt, set.readAt)
      }
      for (const achievement of set.achievements) {
        if (achievement.state !== 'unlocked') continue
        unlocks.push({
          slug: game.slug,
          game: game.title,
          provider: set.provider,
          setId: set.setId,
          achievement,
        })
      }
    }
    if (known) summary.games += 1
    if (known && perfect && anyAchievements) summary.perfect += 1
  }
  summary.recent = unlocks
    .filter((unlock) => unlock.achievement.unlockedAt !== undefined)
    .sort((a, b) => b.achievement.unlockedAt! - a.achievement.unlockedAt!)
    .slice(0, recent)
  summary.rarest = unlocks
    .filter((unlock) => unlock.achievement.rate !== undefined)
    .sort(
      (a, b) =>
        a.achievement.rate! - b.achievement.rate! ||
        (b.achievement.unlockedAt ?? 0) - (a.achievement.unlockedAt ?? 0),
    )
    .slice(0, rarest)
  return summary
}

/** Which of a set's achievements a list shows. */
export const achievementFilters = ['all', 'unlocked', 'locked'] as const
export type AchievementFilter = (typeof achievementFilters)[number]

/** The orders a list can take: the provider's own, the latest unlocked first, the rarest first. */
export const achievementSorts = ['provider', 'recent', 'rarest'] as const
export type AchievementSort = (typeof achievementSorts)[number]

/** A set's achievements, filtered and sorted. Locked means known to be locked. */
export const arrangeAchievements = (
  achievements: readonly AchievementView[],
  filter: AchievementFilter,
  sort: AchievementSort,
): AchievementView[] => {
  const shown = achievements
    .map((achievement, at) => ({ achievement, at }))
    .filter(({ achievement }) => filter === 'all' || achievement.state === filter)
  const unlockedFirst = (a: AchievementView, b: AchievementView) =>
    Number(b.state === 'unlocked') - Number(a.state === 'unlocked')
  if (sort === 'recent') {
    // Unlocked by when, the moments not known after the known; then the rest in the provider's order.
    shown.sort(
      (a, b) =>
        unlockedFirst(a.achievement, b.achievement) ||
        (b.achievement.unlockedAt ?? -1) - (a.achievement.unlockedAt ?? -1) ||
        a.at - b.at,
    )
  } else if (sort === 'rarest') {
    shown.sort(
      (a, b) => (a.achievement.rate ?? Infinity) - (b.achievement.rate ?? Infinity) || a.at - b.at,
    )
  }
  return shown.map(({ achievement }) => achievement)
}
