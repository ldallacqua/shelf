import { createHash, timingSafeEqual } from 'node:crypto'

import { revalidateTag } from 'next/cache'

import { cronSecret } from '@/server/env'
import { syncDaily } from '@/server/services/sync'
import { libraryTag } from '@/server/services/tags'

/** A sync of many libraries can take minutes; Vercel's free plan allows five. */
export const maxDuration = 300

/** Compared by their digests, so neither the time taken nor a length gives the secret away. */
const sameSecret = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest(),
  )

/**
 * The daily sync (ADR 003), which Vercel calls once a day (`vercel.json`),
 * with `CRON_SECRET` as its bearer token. Anyone else is refused: a sync
 * reads every linked account's source and spends the IGDB allowance every
 * account shares.
 */
export async function GET(request: Request) {
  const secret = cronSecret()
  const given = request.headers.get('authorization') ?? ''
  if (!secret || !sameSecret(given, `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed' }, { status: 401 })
  }
  const { synced, libraries } = await syncDaily()
  for (const libraryId of libraries) revalidateTag(libraryTag(libraryId), { expire: 0 })
  return Response.json({ synced, libraries: libraries.length })
}
