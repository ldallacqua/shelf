import { apiAchievementStep } from '@/server/api/platforms'
import { ownerRead } from '@/server/api/writes'
import { readMyAchievements } from '@/server/services/achievements'

/** A step reads for a quarter of a minute, then answers: well inside a minute. */
export const maxDuration = 60

/**
 * `POST /api/v1/me/platforms/{source}/achievements`: one step of reading
 * the signed-in account's achievements there (issue 72). The page asks
 * again while `remaining` is above 0. The library itself does not change,
 * so nothing cached is expired.
 */
export async function POST(
  _request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/achievements'>,
) {
  const { source } = await context.params
  return ownerRead(apiAchievementStep, await readMyAchievements(source))
}
