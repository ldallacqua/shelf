import { failure } from '@/server/api/respond'
import { finishNintendoLink } from '@/server/sync/connect'

/**
 * `POST /api/v1/me/platforms/{source}/link`: `{ "link" }`, the link copied
 * from Nintendo's "Select this account" button, which a browser cannot
 * follow back here by itself. Answers `{ "outcome" }`: `linked`, or why not.
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/link'>,
) {
  const { source } = await context.params
  if (source !== 'nintendo')
    return failure(404, 'not-found', 'That platform is not linked by pasting.')
  return finishNintendoLink(request)
}
