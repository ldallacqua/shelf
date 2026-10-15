import { answerLibrary, libraryAnswer, libraryParams, needsKeywords } from '@/server/api/library'
import { answer, paramsOf } from '@/server/api/respond'
import { getLibrary, getLibraryKeywords } from '@/server/services/library'

/** `GET /api/v1/library?q&sort&group&seed&limit&cursor&lang`: the library, filtered, sorted and grouped. */
export async function GET(request: Request) {
  const params = libraryParams.parse(paramsOf(request))
  const [library, keywords] = await Promise.all([
    getLibrary(),
    needsKeywords(params.q) ? getLibraryKeywords() : undefined,
  ])
  return answer(libraryAnswer, answerLibrary(library, params, keywords))
}
