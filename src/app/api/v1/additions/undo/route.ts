import { apiChanged, apiUndoAdditions, bodyOf, refused, written } from '@/server/api/writes'
import { undoManyOfMine } from '@/server/services/adding'

/**
 * `POST /api/v1/additions/undo`: takes back what POST /additions added,
 * each game and everything added with it, last first. The owner only.
 */
export async function POST(request: Request) {
  const parsed = apiUndoAdditions.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const result = await undoManyOfMine(parsed.data.undo)
  return written(apiChanged, result.ok ? { ...result, value: { version: result.value } } : result)
}
