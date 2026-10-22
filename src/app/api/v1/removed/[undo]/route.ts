import { apiRestored, written } from '@/server/api/writes'
import { restoreMine } from '@/server/services/editing'

/**
 * `POST /api/v1/removed/{undo}`: puts a removed game back exactly as it was,
 * within a day of removing it. `{undo}` is what the removal answered with.
 * The owner only.
 */
export async function POST(_request: Request, context: RouteContext<'/api/v1/removed/[undo]'>) {
  const { undo } = await context.params
  return written(apiRestored, await restoreMine(undo))
}
