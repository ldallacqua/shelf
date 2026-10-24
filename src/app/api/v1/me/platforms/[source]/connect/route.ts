import { failure } from '@/server/api/respond'
import { startNintendoLink, startSteamLink } from '@/server/sync/connect'

/**
 * `GET /api/v1/me/platforms/{source}/connect?locale=`: off to the source's
 * own sign-in. Steam's comes back to `…/return`; Nintendo's gives a link to
 * paste on the account page (`…/link`). PlayStation and Xbox link in their
 * own way when they are built.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/connect'>,
) {
  const { source } = await context.params
  if (source === 'steam') return startSteamLink(request)
  if (source === 'nintendo') return startNintendoLink(request)
  return failure(404, 'not-found', 'That platform cannot be linked here.')
}
