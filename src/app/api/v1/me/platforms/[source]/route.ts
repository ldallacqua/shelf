import { apiLink } from '@/server/api/platforms'
import { bodyOf, ownerRead, refused } from '@/server/api/writes'
import { setMyDaily, unlinkMine } from '@/server/services/sync'

type Context = RouteContext<'/api/v1/me/platforms/[source]'>

/** `PATCH /api/v1/me/platforms/{source}`: `{ daily }`, whether it syncs again once a day. */
export async function PATCH(request: Request, context: Context) {
  const { source } = await context.params
  return ownerRead(apiLink, await setMyDaily(source, await bodyOf(request)))
}

/**
 * `DELETE /api/v1/me/platforms/{source}`: the link, and what the source
 * listed, forgotten. The games it put on the shelf stay, with their hours.
 */
export async function DELETE(_request: Request, context: Context) {
  const { source } = await context.params
  const result = await unlinkMine(source)
  if (!result.ok) return refused(result)
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
}
