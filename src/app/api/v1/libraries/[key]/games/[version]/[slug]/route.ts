import { failure } from '@/server/api/respond'
import {
  findPublicLibraryByKey,
  gameFactsPath,
  getGamePage,
  getLibraryVersion,
} from '@/server/services/library'

/**
 * A game's facts in a public library: what its page shows beyond the
 * library file (summary, screenshots, key art, releases). The game opened
 * over the shelf fetches them. Like the library file, the address contains
 * the library's key and version, so what it answers never changes and is
 * cached for a year; any other version is sent on to the current one.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/libraries/[key]/games/[version]/[slug]'>,
) {
  const { key, version, slug } = await context.params
  const library = await findPublicLibraryByKey(key)
  if (!library) return failure(404, 'not-found', 'There is no public library at this address.')
  const current = await getLibraryVersion(library.id)
  if (version !== String(current)) {
    return new Response(null, {
      status: 307,
      headers: { Location: gameFactsPath(key, current, slug), 'Cache-Control': 'no-store' },
    })
  }

  const page = await getGamePage(library.id, slug)
  if (!page) return failure(404, 'not-found', `There is no game called ${slug}`)

  return Response.json(page.facts, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
