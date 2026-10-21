import { apiAdded, apiNewGame, bodyOf, refused, toAddInput, written } from '@/server/api/writes'
import { addGameForOwner } from '@/server/services/adding'

/** `POST /api/v1/entries`: adds a game from IGDB, as the Add sheet does. The owner only. */
export async function POST(request: Request) {
  const parsed = apiNewGame.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const result = await addGameForOwner(toAddInput(parsed.data))
  return written(
    apiAdded,
    result.ok
      ? {
          ok: true,
          value: {
            slug: result.value.slug,
            title: result.value.title,
            version: result.value.version,
          },
        }
      : result,
    201,
  )
}
