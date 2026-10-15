import { failure } from '@/server/api/respond'
import { gameFactsPath, getGamePage, getLibraryVersion } from '@/server/services/library'

/**
 * A game's facts: what its page shows beyond the library file (summary,
 * screenshots, key art, releases). The game opened over the shelf fetches
 * them. Like the library file, the address contains the library's version,
 * so what it answers never changes and is cached for a year; any other
 * version is sent on to the current one.
 */
export async function GET(
  _request: Request,
  context: RouteContext<'/api/v1/library/games/[version]/[slug]'>,
) {
  const { version, slug } = await context.params
  const current = await getLibraryVersion()
  if (version !== String(current)) {
    return new Response(null, {
      status: 307,
      headers: { Location: gameFactsPath(current, slug), 'Cache-Control': 'no-store' },
    })
  }

  const page = await getGamePage(slug)
  if (!page) return failure(404, 'not-found', `There is no game called ${slug}`)

  return Response.json(page.facts, {
    headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
  })
}
