import { apiSyncStep } from '@/server/api/platforms'
import { bodyOf, written } from '@/server/api/writes'
import { syncMine } from '@/server/services/sync'

/** Twenty games go on the shelf a step: well inside a minute. */
export const maxDuration = 60

/**
 * `POST /api/v1/me/platforms/{source}/sync`: one step of a sync, `{ read }`
 * to ask the source for its list first. The page asks again while
 * `remaining` is above 0.
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/sync'>,
) {
  const { source } = await context.params
  return written(apiSyncStep, await syncMine(source, await bodyOf(request)))
}
