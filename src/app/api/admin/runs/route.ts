import { after } from 'next/server'
import { z } from 'zod'

import { adminJobs } from '@/domain/admin/jobs'
import { admin, continueRun } from '@/server/admin/admin'
import { adminAnswer, adminRefusal } from '@/server/admin/auth'
import { adminPassword } from '@/server/env'

/** The first step runs after the answer, in this request's time. */
export const maxDuration = 300

const asked = z.object({ job: z.enum(adminJobs) })

/** Starts a job: it answers at once with the run, and works on in steps. */
export async function POST(request: Request) {
  const refused = adminRefusal(request, adminPassword(), Date.now())
  if (refused) return refused
  const parsed = asked.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success) return adminAnswer({ error: 'invalid' }, 400)
  const run = await admin().start(parsed.data.job)
  const origin = new URL(request.url).origin
  after(() => continueRun(run.id, origin))
  return adminAnswer(run, 201)
}
