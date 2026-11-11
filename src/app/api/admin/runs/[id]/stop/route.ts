import { admin } from '@/server/admin/admin'
import { adminAnswer, adminRefusal } from '@/server/admin/auth'
import { adminPassword } from '@/server/env'

/** Stops a run: the step under way finishes, and no other starts. */
export async function POST(request: Request, context: RouteContext<'/api/admin/runs/[id]/stop'>) {
  const refused = adminRefusal(request, adminPassword(), Date.now())
  if (refused) return refused
  const { id } = await context.params
  return adminAnswer({ stopped: await admin().stop(id) })
}
