import { apiGameAchievements } from '@/server/api/achievements'
import { ownerRead } from '@/server/api/writes'
import { languageOf, myGameAchievements } from '@/server/services/achievements'

/**
 * `GET /api/v1/me/achievements/{slug}?locale=`: a game's achievements in
 * the signed-in account's own library, its private games among them (issue
 * 72). Read fresh and kept by no one, so a sync just finished shows.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/me/achievements/[slug]'>,
) {
  const { slug } = await context.params
  const language = languageOf(new URL(request.url).searchParams.get('locale'))
  return ownerRead(apiGameAchievements, await myGameAchievements(slug, language))
}
