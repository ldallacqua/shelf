import { failure } from '@/server/api/respond'
import { checkAccount } from '@/server/auth/account'
import { database } from '@/server/db/client'
import { readShelves } from '@/server/library/store'

/**
 * `GET /api/v1/me/shelves`: the smart shelves of the signed-in account's own
 * library, for its private shelf's pages. Kept by nothing.
 */
export async function GET(request: Request) {
  const { account } = await checkAccount(request.headers)
  if (!account) return failure(401, 'not-signed-in', 'Sign in first.')
  return Response.json(
    { shelves: await readShelves(database(), account.id) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
