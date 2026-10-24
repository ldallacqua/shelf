import { apiRematch, apiRematched, bodyOf, refused, written } from '@/server/api/writes'
import { rematchMine } from '@/server/services/adding'

/**
 * `PUT /api/v1/entries/{id}/game`: which game on IGDB this one is, when a
 * sync took it for another (spec 4.5, "Not this game"). Everything that is
 * mine about it stays; if that game is on the shelf already, this one folds
 * into it. The owner only.
 */
export async function PUT(request: Request, context: RouteContext<'/api/v1/entries/[id]/game'>) {
  const { id } = await context.params
  const parsed = apiRematch.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(apiRematched, await rematchMine(id, parsed.data))
}
