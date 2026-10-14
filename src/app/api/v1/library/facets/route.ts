import { z } from 'zod'

import { MAX_QUERY_LENGTH } from '@/domain/library/view'
import { answerFacets, facetsAnswer, needsKeywords } from '@/server/api/library'
import { answer, paramsOf } from '@/server/api/respond'
import { getLibrary, getLibraryKeywords } from '@/server/services/library'

const params = z.object({ q: z.string().max(MAX_QUERY_LENGTH).catch('').default('') })

/** `GET /api/v1/library/facets?q`: every value a filter can take, with how many games each would match. */
export async function GET(request: Request) {
  const { q } = params.parse(paramsOf(request))
  const [library, keywords] = await Promise.all([
    getLibrary(),
    needsKeywords(q) ? getLibraryKeywords() : undefined,
  ])
  return answer(facetsAnswer, answerFacets(library, q, keywords))
}
