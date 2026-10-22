import { publicLibrary, shelvesAnswer, toApiShelf } from '@/server/api/library'
import { answer } from '@/server/api/respond'
import { getShelves } from '@/server/services/shelves'

/**
 * `GET /api/v1/u/{handle}/shelves`: a public shelf's smart shelves, in
 * order. Each one's games are its `/library` with its query.
 */
export async function GET(_request: Request, context: RouteContext<'/api/v1/u/[handle]/shelves'>) {
  const found = await publicLibrary((await context.params).handle)
  if (found instanceof Response) return found
  const shelves = await getShelves(found.id)
  return answer(shelvesAnswer, { shelves: shelves.map(toApiShelf(found.handle)) })
}
