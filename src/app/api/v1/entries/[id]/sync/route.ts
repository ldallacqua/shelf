import { apiChanged, written } from '@/server/api/writes'
import { syncMyGame } from '@/server/services/sync'

/**
 * `POST /api/v1/entries/{id}/sync`: one game brought up to date from Steam, its achievements with
 * it, and the rest of the library left unread. The owner only.
 */
export async function POST(_request: Request, context: RouteContext<'/api/v1/entries/[id]/sync'>) {
  const { id } = await context.params
  return written(apiChanged, await syncMyGame(id))
}
