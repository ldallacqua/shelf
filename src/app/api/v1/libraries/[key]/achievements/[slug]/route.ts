import { apiGameAchievements } from '@/server/api/achievements'
import { answer, failure } from '@/server/api/respond'
import { achievementsFor, languageOf } from '@/server/services/achievements'
import { findPublicLibraryByKey } from '@/server/services/library'

/**
 * `GET /api/v1/libraries/{key}/achievements/{slug}?locale=`: a game's
 * achievements in a public library (issue 72), which its page asks for as
 * it opens. A private library has no file here, and a private game is no
 * game here. A sync changes them without changing the library, so the
 * address carries no version: the edge keeps the answer a minute, as it
 * keeps the API's other reads.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/libraries/[key]/achievements/[slug]'>,
) {
  const { key, slug } = await context.params
  const library = await findPublicLibraryByKey(key)
  if (!library) return failure(404, 'not-found', 'There is no public library at this address.')
  const language = languageOf(new URL(request.url).searchParams.get('locale'))
  const found = await achievementsFor(library.id).game(slug, language)
  if (!found) return failure(404, 'not-found', `There is no game called ${slug}`)
  return answer(apiGameAchievements, found)
}
