import { failure } from '@/server/api/respond'
import { checkAccount } from '@/server/auth/account'
import { readMyLibrary } from '@/server/services/library'

/**
 * `GET /api/v1/me/tags`: the tags in the signed-in account's own library,
 * most worn first, which the tag field offers as one types. Kept by nothing.
 */
export async function GET(request: Request) {
  const { account } = await checkAccount(request.headers)
  if (!account) return failure(401, 'not-signed-in', 'Sign in first.')
  const library = await readMyLibrary(account.id)
  const worn = new Map<number, number>()
  for (const game of library.games) {
    for (const tag of game.tags) worn.set(tag, (worn.get(tag) ?? 0) + 1)
  }
  const tags = library.names.tag
    .map((tag, position) => ({ name: tag.name, count: worn.get(position) ?? 0 }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return Response.json({ tags }, { headers: { 'Cache-Control': 'private, no-store' } })
}
