import { apiArchived, apiBroughtBack, written } from '@/server/api/writes'
import { archiveMine, bringBackMine } from '@/server/services/editing'

/**
 * A game archived (spec 7.4): off the shelf and out of every answer, kept
 * whole. `{id}` is the entry's id, or, to archive it, the address of any of
 * its versions. The owner only.
 */

/** `PUT /api/v1/entries/{id}/archived`: archives it. Archiving it again changes nothing. */
export async function PUT(
  _request: Request,
  context: RouteContext<'/api/v1/entries/[id]/archived'>,
) {
  const { id } = await context.params
  return written(apiArchived, await archiveMine(id))
}

/** `DELETE /api/v1/entries/{id}/archived`: brings it back, exactly as it was. */
export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/v1/entries/[id]/archived'>,
) {
  const { id } = await context.params
  return written(apiBroughtBack, await bringBackMine(id))
}
