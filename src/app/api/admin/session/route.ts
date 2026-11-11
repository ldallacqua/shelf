import { z } from 'zod'

import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  adminAnswer,
  adminToken,
  samePassword,
} from '@/server/admin/auth'
import { adminPassword } from '@/server/env'

/** A wrong password waits this long for its answer, so guessing is slow. */
const WRONG_WAIT_MS = 600

const typed = z.object({ password: z.string().min(1).max(512) })

const cookie = (request: Request, value: string, maxAge: number) =>
  [
    `${ADMIN_COOKIE}=${encodeURIComponent(value)}`,
    // Only the admin page's routes ever see it.
    'Path=/api/admin',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(new URL(request.url).protocol === 'https:' ? ['Secure'] : []),
  ].join('; ')

/** The password typed into the admin page: right, the page opens for twelve hours. */
export async function POST(request: Request) {
  const password = adminPassword()
  // A wrong password is a plain answer, so the page logs no error for it.
  if (!password) return adminAnswer({ ok: false, error: 'off' })
  const parsed = typed.safeParse(await request.json().catch(() => undefined))
  if (!parsed.success || !samePassword(parsed.data.password, password)) {
    await new Promise((resolve) => setTimeout(resolve, WRONG_WAIT_MS))
    return adminAnswer({ ok: false, error: 'wrong' })
  }
  return adminAnswer({ ok: true }, 200, {
    'Set-Cookie': cookie(request, adminToken(password, Date.now()), ADMIN_SESSION_MS / 1000),
  })
}

/** Locks the admin page again on this browser. */
export async function DELETE(request: Request) {
  return adminAnswer({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) })
}
