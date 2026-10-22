import { answerGame, apiGamePage, publicLibrary } from '@/server/api/library'
import { answer, failure } from '@/server/api/respond'
import { getGamePage, getLibrary } from '@/server/services/library'

/** `GET /api/v1/u/{handle}/games/{slug}`: one game on a public shelf, with everything its page shows a visitor. */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/u/[handle]/games/[slug]'>,
) {
  const { handle, slug } = await context.params
  const found = await publicLibrary(handle)
  if (found instanceof Response) return found
  const [library, page] = await Promise.all([getLibrary(found.id), getGamePage(found.id, slug)])
  if (!page) return failure(404, 'not-found', `There is no game called ${slug}`)
  return answer(apiGamePage, answerGame(library, page))
}
