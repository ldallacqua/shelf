import { wallAddress } from '@/features/trophies/wall-address'
import { apiAchievementWall } from '@/server/api/achievements'
import { ownerRead } from '@/server/api/writes'
import { languageOf, myAchievementWall } from '@/server/services/achievements'

/**
 * `GET /api/v1/me/trophies/achievements?locale=&year=&q=&rarity=`: the
 * trophy page's achievements in the signed-in account's own library, its
 * private games among them (issue 68), worked out here so the browser is
 * sent the figures and not every unlock. Read fresh and kept by no one.
 */
export async function GET(request: Request) {
  const query = Object.fromEntries(new URL(request.url).searchParams)
  const { scope, q, rarity } = wallAddress(query, new Date().getUTCFullYear())
  return ownerRead(
    apiAchievementWall,
    await myAchievementWall(languageOf(query.locale), { scope, q, rarity }),
  )
}
