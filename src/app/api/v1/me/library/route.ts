import { failure } from '@/server/api/respond'
import { checkAccount } from '@/server/auth/account'
import { libraryFile, readMyLibrary } from '@/server/services/library'

/**
 * `GET /api/v1/me/library`: the signed-in account's own library file, for
 * its private shelf (ADR 004). The same shape as a public library's file,
 * read fresh, for that account only, and kept by nothing between here and
 * its browser.
 */
export async function GET(request: Request) {
  const { account } = await checkAccount(request.headers)
  if (!account) return failure(401, 'not-signed-in', 'Sign in first.')
  return new Response(libraryFile(await readMyLibrary(account.id)), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
