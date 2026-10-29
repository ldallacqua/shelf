import type { Palette } from '@/domain/color/palette'
import type { AchievementWall } from '@/domain/library/trophy-achievements'
import type { TrophyWall } from '@/domain/library/trophies'

/**
 * What a trophy page's card says when its address is shared (issue 68's
 * shareable statistics): of all time, or a year's recap. It is seen in
 * other apps, where no device's choice about adult games reaches, so it is
 * always drawn without them.
 */
export type TrophyCard = {
  /** The year it recaps; of all time without one. */
  scope?: number
  finished: number
  /** Whole hours: across the shelf, or on the year's finishes. */
  hours: number
  /** The genre with the most games finished, when one has any. */
  genre?: string
  /** Out of 100. */
  averageRating?: number
  /** Unlocked, of all time or in the year, when any game's achievements are known. */
  unlocked?: number
  perfect?: number
  /** The latest finished, newest first, as their covers. */
  covers: { title: string; cover?: string; colors?: Palette }[]
}

/** How many covers a card shows. */
export const CARD_COVERS = 4

/** The card of a wall worked out for all time or for one year, and its achievements. */
export const trophyCardOf = (wall: TrophyWall, achievements: AchievementWall): TrophyCard => {
  // A wall with adult games has its figures without them as `hidden`, and so do its achievements.
  const stats = wall.hidden ?? wall.stats
  const unlocks = wall.hidden ? achievements.hidden : achievements.stats
  const covers = wall.years
    .flatMap(({ year, trophies }) => (year === undefined ? [] : trophies))
    .filter((trophy) => !trophy.adult)
    .slice(0, CARD_COVERS)
    .map(({ title, cover, colors }) => ({ title, cover, colors }))
  return {
    ...(stats.scope === undefined ? {} : { scope: stats.scope }),
    finished: stats.finished,
    hours: stats.hours,
    ...(stats.genres[0] && stats.genres[0].finished > 0 ? { genre: stats.genres[0].name } : {}),
    ...(stats.averageRating === undefined ? {} : { averageRating: stats.averageRating }),
    ...(unlocks ? { unlocked: unlocks.unlocked, perfect: unlocks.perfect } : {}),
    covers,
  }
}
