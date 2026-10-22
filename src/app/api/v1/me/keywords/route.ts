import { failure } from '@/server/api/respond'
import { checkAccount } from '@/server/auth/account'
import { readMyKeywordsFile } from '@/server/services/library'

/** `GET /api/v1/me/keywords`: the keywords file of the signed-in account's own library, kept by nothing. */
export async function GET(request: Request) {
  const { account } = await checkAccount(request.headers)
  if (!account) return failure(401, 'not-signed-in', 'Sign in first.')
  return new Response(await readMyKeywordsFile(account.id), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  })
}
