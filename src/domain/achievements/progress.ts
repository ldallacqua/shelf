import type { AchievementSetView, AchievementView } from '@/domain/achievements/achievements'

/**
 * What achievements add up to (issue 72): a set's progress, for a game's
 * page and, game by game, for the trophy page (`trophy-achievements.ts`).
 * Every figure is worked out from the provider's latest answer, never added
 * to the last one, so reading a set twice counts it once.
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

/** A game's achievements, for the trophy page: only games a visitor may see are given. */
export type AchievementGame = {
  slug: string
  title: string
  sets: readonly AchievementSetView[]
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
