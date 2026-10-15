import { answerGame, apiGamePage } from '@/server/api/library'
import { answer, failure } from '@/server/api/respond'
import { getGamePage, getLibrary } from '@/server/services/library'

/** `GET /api/v1/games/{slug}`: one game, with everything its page shows a visitor. */
export async function GET(_request: Request, context: RouteContext<'/api/v1/games/[slug]'>) {
  const { slug } = await context.params
  const [library, page] = await Promise.all([getLibrary(), getGamePage(slug)])
  if (!page) return failure(404, 'not-found', `There is no game called ${slug}`)
  return answer(apiGamePage, answerGame(library, page))
}
