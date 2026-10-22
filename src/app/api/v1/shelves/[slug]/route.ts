import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { bodyOf, refused } from '@/server/api/writes'
import { currentAccount } from '@/server/auth/account'
import {
  getShelf,
  removeMyShelf,
  saveMyShelf,
  shelvesTag,
  type ShelfWrite,
} from '@/server/services/shelves'

/**
 * Writing smart shelves through the API, in the signed-in account's own
 * library. Reading them is `GET /api/v1/u/{handle}/shelves`.
 */

export const apiShelfInput = z
  .object({
    name: z.string().min(1).max(60),
    query: z.string().max(1000).default(''),
    sort: z.string().max(20).default('title'),
    group: z.string().max(20).default('platform'),
  })
  .meta({ id: 'ShelfInput' })

const done = (result: ShelfWrite, status = 200): Response => {
  if (!result.ok) return refused(result)
  revalidateTag(shelvesTag(result.libraryId), { expire: 0 })
  return Response.json(
    { slug: result.slug },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * `PUT /api/v1/shelves/{slug}`: saves a smart shelf in your library,
 * changing the one at that address or, if there is none, adding one named
 * as asked (its own address comes from its name).
 */
export async function PUT(request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  const account = await currentAccount()
  if (!account) return refused({ ok: false, reason: 'not-signed-in' })
  const parsed = apiShelfInput.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const exists = Boolean(await getShelf(account.id, slug))
  return done(
    await saveMyShelf({ ...parsed.data, ...(exists ? { slug } : {}) }, account),
    exists ? 200 : 201,
  )
}

/** `DELETE /api/v1/shelves/{slug}`: removes a smart shelf from your library. */
export async function DELETE(_request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  return done(await removeMyShelf(slug))
}
