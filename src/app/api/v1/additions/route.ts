import {
  apiAdditions,
  apiNewGames,
  bodyOf,
  refused,
  toAddInput,
  toApiAdditions,
  written,
} from '@/server/api/writes'
import { addManyForOwner } from '@/server/services/adding'

/**
 * `POST /api/v1/additions`: many games at once, from a reviewed list (spec
 * 4.2). IGDB is asked once for all of them; each is added on its own, so
 * one that fails leaves the rest. The owner only.
 */
export async function POST(request: Request) {
  const parsed = apiNewGames.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const result = await addManyForOwner(parsed.data.games.map(toAddInput))
  return written(
    apiAdditions,
    result.ok ? { ok: true, value: toApiAdditions(result.value) } : result,
  )
}
