import { apiShelf, toApiShelf } from '@/server/api/library'
import { answer, failure } from '@/server/api/respond'
import { getShelf } from '@/server/services/shelves'

/** `GET /api/v1/shelves/{slug}`: one smart shelf. Its games are `GET /library` with its query. */
export async function GET(_request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  const shelf = await getShelf(slug)
  if (!shelf) return failure(404, 'not-found', `There is no shelf called ${slug}`)
  return answer(apiShelf, toApiShelf(shelf))
}
