import {
  apiChanged,
  apiGamePatch,
  apiOwnerGame,
  apiRemoved,
  bodyOf,
  ownerRead,
  refused,
  toApiOwnerGame,
  toEditPatch,
  written,
} from '@/server/api/writes'
import { myGame, patchMine, removeMine } from '@/server/services/editing'

/**
 * A game, as its owner keeps it. `{id}` is the entry's id, or the address of
 * any of its versions. The owner only, for all three.
 */

/** `GET /api/v1/entries/{id}`: the game with what only its owner sees: ids, private notes, versions. */
export async function GET(_request: Request, context: RouteContext<'/api/v1/entries/[id]'>) {
  const { id } = await context.params
  const game = await myGame(id)
  return ownerRead(apiOwnerGame, game.ok ? { ok: true, value: toApiOwnerGame(game.value) } : game)
}

/** `PATCH /api/v1/entries/{id}`: changes what is mine about a game, in one step. */
export async function PATCH(request: Request, context: RouteContext<'/api/v1/entries/[id]'>) {
  const { id } = await context.params
  const parsed = apiGamePatch.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(apiChanged, await patchMine(id, toEditPatch(parsed.data)))
}

/** `DELETE /api/v1/entries/{id}`: removes it, with everything added with it. Kept a day for Undo. */
export async function DELETE(_request: Request, context: RouteContext<'/api/v1/entries/[id]'>) {
  const { id } = await context.params
  return written(apiRemoved, await removeMine(id))
}
