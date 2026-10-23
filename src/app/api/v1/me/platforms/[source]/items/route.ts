import { apiSourceItems } from '@/server/api/platforms'
import { paramsOf } from '@/server/api/respond'
import { ownerRead } from '@/server/api/writes'
import { listMine } from '@/server/services/sync'

/**
 * `GET /api/v1/me/platforms/{source}/items?list=`: the games the source
 * listed that need an answer (`needs-you`), that were left off the shelf
 * (`hidden`), or that it no longer lists (`not-seen`).
 */
export async function GET(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/items'>,
) {
  const { source } = await context.params
  return ownerRead(apiSourceItems, await listMine(source, paramsOf(request).list))
}
