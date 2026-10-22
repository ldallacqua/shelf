import { handleAvailable } from '@/server/services/account'

/**
 * `GET /api/v1/handles/{handle}`: whether a shelf could have this handle,
 * and if not why: `short`, `long`, `shape`, `reserved` or `taken`. The
 * sign-up form asks as it is typed. Handles are public, so saying one is
 * taken tells nothing a shelf's address does not.
 */
export async function GET(_request: Request, context: RouteContext<'/api/v1/handles/[handle]'>) {
  const { handle } = await context.params
  return Response.json(await handleAvailable(handle), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
