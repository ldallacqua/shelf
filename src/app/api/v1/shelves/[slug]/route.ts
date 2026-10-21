import { revalidateTag } from 'next/cache'
import { z } from 'zod'

import { apiShelf, toApiShelf } from '@/server/api/library'
import { answer, failure } from '@/server/api/respond'
import { bodyOf, refused } from '@/server/api/writes'
import {
  getShelf,
  removeShelfForOwner,
  saveShelfForOwner,
  SHELVES_TAG,
  type ShelfWrite,
} from '@/server/services/shelves'

/** `GET /api/v1/shelves/{slug}`: one smart shelf. Its games are `GET /library` with its query. */
export async function GET(_request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  const shelf = await getShelf(slug)
  if (!shelf) return failure(404, 'not-found', `There is no shelf called ${slug}`)
  return answer(apiShelf, toApiShelf(shelf))
}

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
  revalidateTag(SHELVES_TAG, { expire: 0 })
  return Response.json(
    { slug: result.slug },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * `PUT /api/v1/shelves/{slug}`: saves a smart shelf, changing the one at that
 * address or, if there is none, adding one named as asked (its own address
 * comes from its name). The owner only.
 */
export async function PUT(request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  const parsed = apiShelfInput.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const exists = Boolean(await getShelf(slug))
  return done(
    await saveShelfForOwner({ ...parsed.data, ...(exists ? { slug } : {}) }),
    exists ? 200 : 201,
  )
}

/** `DELETE /api/v1/shelves/{slug}`: removes a smart shelf. The owner only. */
export async function DELETE(_request: Request, context: RouteContext<'/api/v1/shelves/[slug]'>) {
  const { slug } = await context.params
  return done(await removeShelfForOwner(slug))
}
