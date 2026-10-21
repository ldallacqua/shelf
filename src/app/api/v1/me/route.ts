import { OWNER_HINT_COOKIE } from '@/server/auth/auth'
import { checkOwner } from '@/server/auth/owner'

/**
 * Who is asking: the owner, or nobody in particular. The page asks only when
 * the hint cookie says it is worth it, and draws edit controls only after a
 * yes (architecture, section 9). Never cached anywhere.
 */
export async function GET(request: Request) {
  const { owner, headers: renewed } = await checkOwner(request.headers)
  const headers = new Headers({ 'Cache-Control': 'private, no-store' })
  // A session renewed on the way keeps its cookie up to date.
  for (const cookie of renewed?.getSetCookie() ?? []) headers.append('Set-Cookie', cookie)
  if (!owner && request.headers.get('cookie')?.includes(`${OWNER_HINT_COOKIE}=`)) {
    // The hint outlived the session: stop asking.
    headers.append('Set-Cookie', `${OWNER_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`)
  }
  return Response.json(owner ? { owner: true, ...owner } : { owner: false }, { headers })
}
