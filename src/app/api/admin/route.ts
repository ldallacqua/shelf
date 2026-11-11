import { connection } from 'next/server'

import type { AdminAccess } from '@/domain/admin/jobs'
import { admin } from '@/server/admin/admin'
import { adminAnswer, isAdmin } from '@/server/admin/auth'
import { adminPassword } from '@/server/env'

/**
 * Whether this browser may open the admin page, and if so, what it shows: the facts beside each
 * job, and the latest runs. Locked or off is a plain answer, not a refusal: the page asks first.
 */
export async function GET(request: Request) {
  // Asked at every visit, never built ahead: built without a password, it answered "off" for good.
  await connection()
  const password = adminPassword()
  const access: AdminAccess = !password
    ? { access: 'off' }
    : !isAdmin(request, password, Date.now())
      ? { access: 'locked' }
      : { access: 'open', ...(await admin().state()) }
  return adminAnswer(access)
}
