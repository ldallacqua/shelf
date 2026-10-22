import { z } from 'zod'

import { MAX_QUERY_LENGTH } from '@/domain/library/view'
import { answerFacets, facetsAnswer, needsKeywords, publicLibrary } from '@/server/api/library'
import { answer, paramsOf } from '@/server/api/respond'
import { getLibrary, getLibraryKeywords } from '@/server/services/library'

const params = z.object({ q: z.string().max(MAX_QUERY_LENGTH).catch('').default('') })

/**
 * `GET /api/v1/u/{handle}/facets?q`: every value a filter can take on a
 * public shelf, with how many games each would match.
 */
export async function GET(request: Request, context: RouteContext<'/api/v1/u/[handle]/facets'>) {
  const found = await publicLibrary((await context.params).handle)
  if (found instanceof Response) return found
  const { q } = params.parse(paramsOf(request))
  const [library, keywords] = await Promise.all([
    getLibrary(found.id),
    needsKeywords(q) ? getLibraryKeywords(found.id) : undefined,
  ])
  return answer(facetsAnswer, answerFacets(library, q, keywords))
}
