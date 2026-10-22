import { failure } from '@/server/api/respond'
import { checkAccount } from '@/server/auth/account'
import { readMyGamePage } from '@/server/services/library'

/**
 * `GET /api/v1/me/games/{slug}`: a game's facts in the signed-in account's
 * own library, for its private shelf: what a public library's
 * `/libraries/{key}/games/…` file holds, read fresh and kept by nothing.
 */
export async function GET(request: Request, context: RouteContext<'/api/v1/me/games/[slug]'>) {
  const { account } = await checkAccount(request.headers)
  if (!account) return failure(401, 'not-signed-in', 'Sign in first.')
  const { slug } = await context.params
  const page = await readMyGamePage(account.id, slug)
  if (!page) return failure(404, 'not-found', `There is no game called ${slug} in your library.`)
  return Response.json(page.facts, { headers: { 'Cache-Control': 'private, no-store' } })
}
