import { apiAdded, apiNewGame, bodyOf, refused, toAddInput, written } from '@/server/api/writes'
import { addMyGame } from '@/server/services/adding'

/** `POST /api/v1/entries`: adds a game from IGDB to your library, as the Add sheet does. */
export async function POST(request: Request) {
  const parsed = apiNewGame.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const result = await addMyGame(toAddInput(parsed.data))
  return written(
    apiAdded,
    result.ok
      ? {
          ...result,
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
