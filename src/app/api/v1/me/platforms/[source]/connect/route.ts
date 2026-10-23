import { failure } from '@/server/api/respond'
import { startSteamLink } from '@/server/sync/connect'

/**
 * `GET /api/v1/me/platforms/{source}/connect?locale=`: off to the source's
 * own sign-in. Only Steam has one; the others link in their own way when
 * they are built.
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/connect'>,
) {
  const { source } = await context.params
  if (source !== 'steam') return failure(404, 'not-found', 'That platform cannot be linked here.')
  return startSteamLink(request)
}
