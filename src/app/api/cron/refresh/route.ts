import { createHash, timingSafeEqual } from 'node:crypto'

import { revalidateTag } from 'next/cache'

import { cronSecret } from '@/server/env'
import { refreshOldest } from '@/server/services/refresh'
import { readSteamPages } from '@/server/services/steam-pages'
import { readSteamReviews } from '@/server/services/steam-reviews'
import { libraryTag } from '@/server/services/tags'

/** The owner's whole shelf is asked about each day besides the hundred: time for a large one. */
export const maxDuration = 300

/** Compared by their digests, so neither the time taken nor a length gives the secret away. */
const sameSecret = (given: string, expected: string): boolean =>
  timingSafeEqual(
    createHash('sha256').update(given).digest(),
    createHash('sha256').update(expected).digest(),
  )

/**
 * The daily refresh (architecture, section 8), which Vercel calls once a day
 * (`vercel.json`), with `CRON_SECRET` as its bearer token. Anyone else is
 * refused: the refresh spends the IGDB allowance every account shares.
 */
export async function GET(request: Request) {
  const secret = cronSecret()
  const given = request.headers.get('authorization') ?? ''
  if (!secret || !sameSecret(given, `Bearer ${secret}`)) {
    return Response.json({ error: 'Not allowed' }, { status: 401 })
  }
  const { checked, changed, libraries } = await refreshOldest()
  // Steam failing costs a day's scores, and never the refresh of IGDB's records beside it.
  const reviews = await readSteamReviews().catch(() => undefined)
  // Its store pages too (ADR 010): covers and screenshots, within the time they are allowed.
  const pages = await readSteamPages().catch(() => undefined)
  const stale = new Set([...libraries, ...(reviews?.libraries ?? []), ...(pages?.libraries ?? [])])
  for (const libraryId of stale) revalidateTag(libraryTag(libraryId), { expire: 0 })
  return Response.json({
    checked,
    changed,
    libraries: stale.size,
    steamReviews: reviews ? { checked: reviews.checked, changed: reviews.changed } : null,
    steamPages: pages ? { checked: pages.checked, changed: pages.changed } : null,
  })
}
