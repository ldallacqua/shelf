import { apiShelf, publicLibrary, toApiShelf } from '@/server/api/library'
import { answer, failure } from '@/server/api/respond'
import { getShelf } from '@/server/services/shelves'

/** `GET /api/v1/u/{handle}/shelves/{slug}`: one smart shelf of a public shelf. Its games are its `/library` with its query. */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/u/[handle]/shelves/[slug]'>,
) {
  const { handle, slug } = await context.params
  const found = await publicLibrary(handle)
  if (found instanceof Response) return found
  const shelf = await getShelf(found.id, slug)
  if (!shelf) return failure(404, 'not-found', `There is no shelf called ${slug}`)
  return answer(apiShelf, toApiShelf(found.handle)(shelf))
}
