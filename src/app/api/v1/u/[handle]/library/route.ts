import {
  answerLibrary,
  libraryAnswer,
  libraryParams,
  needsKeywords,
  publicLibrary,
} from '@/server/api/library'
import { answer, paramsOf } from '@/server/api/respond'
import { getLibrary, getLibraryKeywords } from '@/server/services/library'

/**
 * `GET /api/v1/u/{handle}/library?q&sort&group&seed&limit&cursor&lang`: a
 * public shelf's library, filtered, sorted and grouped.
 */
export async function GET(request: Request, context: RouteContext<'/api/v1/u/[handle]/library'>) {
  const found = await publicLibrary((await context.params).handle)
  if (found instanceof Response) return found
  const params = libraryParams.parse(paramsOf(request))
  const [library, keywords] = await Promise.all([
    getLibrary(found.id),
    needsKeywords(params.q) ? getLibraryKeywords(found.id) : undefined,
  ])
  return answer(libraryAnswer, answerLibrary(library, params, keywords))
}
