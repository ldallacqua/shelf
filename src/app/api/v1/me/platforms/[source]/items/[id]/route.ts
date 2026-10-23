import { apiAnswered } from '@/server/api/platforms'
import { bodyOf, written } from '@/server/api/writes'
import { answerMine } from '@/server/services/sync'

/**
 * `POST /api/v1/me/platforms/{source}/items/{id}`: my answer about a game
 * the source listed, carried out at once: `{ kind: 'pick', igdbId }`,
 * `{ kind: 'dismiss', as: 'not_a_game' | 'not_mine' }`, or `{ kind: 'again' }`.
 */
export async function POST(
  request: Request,
  context: RouteContext<'/api/v1/me/platforms/[source]/items/[id]'>,
) {
  const { source, id } = await context.params
  return written(apiAnswered, await answerMine(source, id, await bodyOf(request)))
}
