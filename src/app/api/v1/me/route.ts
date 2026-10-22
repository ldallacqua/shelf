import { failure } from '@/server/api/respond'
import { bodyOf } from '@/server/api/writes'
import { checkAccount } from '@/server/auth/account'
import { SIGNED_IN_HINT_COOKIE } from '@/server/auth/auth'
import { changeMyAccount } from '@/server/services/account'

/**
 * Who is asking: an account, or nobody in particular. The page asks only
 * when the hint cookie says it is worth it, and draws edit controls only on
 * the account's own shelf, after a yes (architecture, section 9). Never
 * cached anywhere.
 */

const PRIVATE = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const { account, headers: renewed } = await checkAccount(request.headers)
  const headers = new Headers(PRIVATE)
  // A session renewed on the way keeps its cookie up to date.
  for (const cookie of renewed?.getSetCookie() ?? []) headers.append('Set-Cookie', cookie)
  if (!account && request.headers.get('cookie')?.includes(`${SIGNED_IN_HINT_COOKIE}=`)) {
    // The hint outlived the session: stop asking.
    headers.append('Set-Cookie', `${SIGNED_IN_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
  }
  if (!account) return Response.json({ signedIn: false }, { headers })
  const { id: _, ...shown } = account
  return Response.json({ signedIn: true, ...shown }, { headers })
}

/**
 * Changes the account's own name, handle, or whether its shelf is public:
 * `{ name?, handle?, shelfPublic? }`. A taken or unfit handle answers 409
 * or 400 with why.
 */
export async function PATCH(request: Request) {
  const result = await changeMyAccount(await bodyOf(request))
  if (result.ok) {
    const { id: _, ...shown } = result.account
    return Response.json({ signedIn: true, ...shown }, { headers: PRIVATE })
  }
  if (result.reason === 'handle') {
    // The code says why: handle-taken, handle-short, handle-long, handle-shape, handle-reserved.
    return failure(
      result.problem === 'taken' ? 409 : 400,
      `handle-${result.problem}`,
      result.problem === 'taken' ? 'Another shelf has that handle.' : 'That cannot be a handle.',
    )
  }
  if (result.reason === 'not-signed-in') return failure(401, result.reason, 'Sign in first.')
  if (result.reason === 'invalid') return failure(400, result.reason, 'Nothing there to change.')
  if (result.reason === 'not-kept') {
    return failure(503, result.reason, 'This deployment keeps nothing it is given.')
  }
  return failure(500, 'failed', 'That did not work. Try again.')
}
