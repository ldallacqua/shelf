import 'server-only'

import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Who may use the admin page: whoever has its password (`ADMIN_PASSWORD`). Typed once into the
 * page, it becomes a cookie for twelve hours: the time it runs out, signed with the password, so
 * nothing is stored, and a new password ends every cookie. A script, or the server continuing a
 * run, sends the password itself as a bearer token.
 */

export const ADMIN_COOKIE = 'shelf_admin'

/** How long the page stays open after the password is typed. */
export const ADMIN_SESSION_MS = 12 * 60 * 60_000

const digest = (value: string) => createHash('sha256').update(value).digest()

/** Compared by their digests, so neither the time taken nor a length gives the password away. */
export const samePassword = (given: string, expected: string): boolean =>
  timingSafeEqual(digest(given), digest(expected))

const signature = (password: string, expires: number): string =>
  createHmac('sha256', password).update(`shelf-admin:${expires}`).digest('base64url')

/** The cookie's value for a password typed at `now`: when it runs out, and its signature. */
export const adminToken = (password: string, now: number): string => {
  const expires = now + ADMIN_SESSION_MS
  return `${expires}.${signature(password, expires)}`
}

/** Whether a cookie's value was signed with this password and hasn't run out. */
export const validToken = (token: string, password: string, now: number): boolean => {
  const [time, signed] = token.split('.')
  const expires = Number(time)
  if (!signed || !Number.isSafeInteger(expires) || expires <= now) return false
  return samePassword(signed, signature(password, expires))
}

const cookieIn = (header: string | null, name: string): string | undefined => {
  for (const part of header?.split(';') ?? []) {
    const at = part.indexOf('=')
    if (at <= 0 || part.slice(0, at).trim() !== name) continue
    try {
      return decodeURIComponent(part.slice(at + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Whether a request comes from whoever has the password. Nobody, while there is none. */
export const isAdmin = (request: Request, password: string | undefined, now: number): boolean => {
  if (!password) return false
  const bearer = request.headers.get('authorization')
  if (bearer?.startsWith('Bearer ')) return samePassword(bearer.slice('Bearer '.length), password)
  const token = cookieIn(request.headers.get('cookie'), ADMIN_COOKIE)
  return token ? validToken(token, password, now) : false
}

const NO_STORE = { 'Cache-Control': 'no-store' }

/** An answer of the admin page's, kept nowhere. */
export const adminAnswer = (body: unknown, status = 200, headers: HeadersInit = {}): Response =>
  Response.json(body, {
    status,
    headers: { ...NO_STORE, ...Object.fromEntries(new Headers(headers)) },
  })

/**
 * The answer refusing a request to the admin page's routes, or nothing when it may go on: "off"
 * while this server has no password, "locked" to anyone without it.
 */
export const adminRefusal = (
  request: Request,
  password: string | undefined,
  now: number,
): Response | undefined => {
  if (!password) return adminAnswer({ error: 'off' }, 404)
  if (!isAdmin(request, password, now)) return adminAnswer({ error: 'locked' }, 401)
  return undefined
}
