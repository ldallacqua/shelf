import { apiPlaySessions, apiPlaySessionsKept, bodyOf, refused, written } from '@/server/api/writes'
import { keepPlaySessions } from '@/server/services/play-sessions'

/**
 * `POST /api/v1/me/play/sessions`: what Shelf for Windows counted of the games it saw played
 * (ADR 005, section 12), as the app's page sends it.
 */
export async function POST(request: Request) {
  const parsed = apiPlaySessions.safeParse(await bodyOf(request))
  if (!parsed.success) return refused({ ok: false, reason: 'invalid' })
  return written(apiPlaySessionsKept, await keepPlaySessions(parsed.data.sessions))
}
