import type { AchievementWall } from '@/domain/library/trophy-achievements'

import type { Which } from './wall-address'

/**
 * The trophy page's achievements in one's own library, private games among
 * them (issue 68), worked out on the server: the browser is sent the figures,
 * never every unlock. Nothing when they cannot be read, and the wall stands
 * without them.
 */
export const loadMyAchievements = async (
  which: Which,
  locale: string,
): Promise<AchievementWall | undefined> => {
  const query = new URLSearchParams({ locale })
  if (which.scope !== undefined) query.set('year', String(which.scope))
  if (which.q) query.set('q', which.q)
  if (which.rarity) query.set('rarity', which.rarity)
  try {
    const response = await fetch(`/api/v1/me/trophies/achievements?${query}`, {
      cache: 'no-store',
    })
    return response.ok ? ((await response.json()) as AchievementWall) : undefined
  } catch {
    return undefined
  }
}
