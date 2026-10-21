import {
  apiListMatch,
  apiPastedLines,
  bodyOf,
  ownerRead,
  refused,
  toApiMatch,
} from '@/server/api/writes'
import { matchForOwner } from '@/server/services/adding'

/**
 * `POST /api/v1/igdb/match`: a pasted list's lines, each matched against
 * IGDB, as the "Paste a list" tab shows them (spec 4.2). Twenty lines a
 * request; the tab sends ten at a time, to show its progress. The owner only.
 */
export async function POST(request: Request) {
  const parsed = apiPastedLines.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  const result = await matchForOwner(parsed.data.lines)
  return ownerRead(apiListMatch, result.ok ? { ok: true, value: toApiMatch(result.value) } : result)
}
