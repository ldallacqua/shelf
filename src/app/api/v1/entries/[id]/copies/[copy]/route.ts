import { apiChanged, apiCopyPatch, bodyOf, refused, written } from '@/server/api/writes'
import { removeMyCopy, setMyCopyFormat, setMyCopyStores } from '@/server/services/editing'

/**
 * One copy of a game: switched between physical and digital, said where it is
 * from, or removed. The owner only.
 */

export async function PATCH(
  request: Request,
  context: RouteContext<'/api/v1/entries/[id]/copies/[copy]'>,
) {
  const { id, copy } = await context.params
  const parsed = apiCopyPatch.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const { format, stores } = parsed.data
  if (format !== undefined) {
    const changed = await setMyCopyFormat(id, copy, format)
    if (!changed.ok || stores === undefined) return written(apiChanged, changed)
  }
  return written(apiChanged, await setMyCopyStores(id, copy, stores ?? []))
}

export async function DELETE(
  _request: Request,
  context: RouteContext<'/api/v1/entries/[id]/copies/[copy]'>,
) {
  const { id, copy } = await context.params
  return written(apiChanged, await removeMyCopy(id, copy))
}
