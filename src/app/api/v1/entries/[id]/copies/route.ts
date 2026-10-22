import { apiChanged, apiNewCopy, bodyOf, refused, written } from '@/server/api/writes'
import { addMyCopy } from '@/server/services/editing'

/** `POST /api/v1/entries/{id}/copies`: one more platform and format I own it on. The owner only. */
export async function POST(request: Request, context: RouteContext<'/api/v1/entries/[id]/copies'>) {
  const { id } = await context.params
  const parsed = apiNewCopy.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(
    apiChanged,
    await addMyCopy(id, { platformId: parsed.data.platform, format: parsed.data.format }),
    201,
  )
}
