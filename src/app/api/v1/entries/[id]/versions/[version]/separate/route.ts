import { apiSeparated, written } from '@/server/api/writes'
import { separateMine } from '@/server/services/editing'

/**
 * `POST /api/v1/entries/{id}/versions/{version}/separate`: one of a game's
 * versions made a game of its own (spec 7.6), unsorted, with the copies that
 * name it and the hours stores report for it. `{id}` is the entry's id or the
 * address of any of its versions; `{version}` the version's `gameId`. The
 * owner only.
 */
export async function POST(
  _request: Request,
  context: RouteContext<'/api/v1/entries/[id]/versions/[version]/separate'>,
) {
  const { id, version } = await context.params
  return written(apiSeparated, await separateMine(id, version))
}
