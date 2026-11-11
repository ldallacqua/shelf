import { after } from 'next/server'

import { continueRun } from '@/server/admin/admin'
import { adminAnswer, adminRefusal } from '@/server/admin/auth'
import { adminPassword } from '@/server/env'

/** The step runs after the answer, in this request's time. */
export const maxDuration = 300

/**
 * A run's next step, asked for by the step before it: it answers at once, so the one asking can
 * finish, and works after.
 */
export async function POST(request: Request, context: RouteContext<'/api/admin/runs/[id]/step'>) {
  const refused = adminRefusal(request, adminPassword(), Date.now())
  if (refused) return refused
  const { id } = await context.params
  const origin = new URL(request.url).origin
  after(() => continueRun(id, origin))
  return adminAnswer({ ok: true }, 202)
}
