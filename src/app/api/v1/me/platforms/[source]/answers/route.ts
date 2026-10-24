import { apiSyncStep } from '@/server/api/platforms'
import { bodyOf, written } from '@/server/api/writes'
import { confirmManyMine } from '@/server/services/sync'

/** Twenty games go on the shelf a step: well inside a minute. */
export const maxDuration = 60

/**
 * `POST /api/v1/me/platforms/{source}/answers`: one answer for many games a
 * source saw played, matched and waiting: `{ "ids", "answer": { "kind":
 * "confirm", "format" } }`, "all of these are downloads". Answers a sync's
 * step; ask for more steps while `remaining` is above 0.
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/answers'>,
) {
  const { source } = await context.params
  return written(apiSyncStep, await confirmManyMine(source, await bodyOf(request)))
}
