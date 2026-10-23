import { failure } from '@/server/api/respond'
import { finishSteamLink } from '@/server/sync/connect'

/** `GET /api/v1/me/platforms/{source}/return`: where Steam's sign-in sends the browser back. */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/return'>,
) {
  const { source } = await context.params
  if (source !== 'steam') return failure(404, 'not-found', 'That platform cannot be linked here.')
  return finishSteamLink(request)
}
