import { apiChanged, apiCopyPatch, bodyOf, refused, written } from '@/server/api/writes'
import { removeCopyForOwner, setFormatForOwner } from '@/server/services/editing'

/** One copy of a game: switched between physical and digital, or removed. The owner only. */

export async function PATCH(
  request: Request,
  context: RouteContext<'/api/v1/entries/[id]/copies/[copy]'>,
) {
  const { id, copy } = await context.params
  const parsed = apiCopyPatch.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(apiChanged, await setFormatForOwner(id, copy, parsed.data.format))
}

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/v1/entries/[id]/copies/[copy]'>,
) {
  const { id, copy } = await context.params
  return written(apiChanged, await removeCopyForOwner(id, copy))
}
