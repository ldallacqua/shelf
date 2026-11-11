import { describe, expect, it } from 'vitest'

import {
  ADMIN_COOKIE,
  ADMIN_SESSION_MS,
  adminRefusal,
  adminToken,
  isAdmin,
  samePassword,
  validToken,
} from './auth'

const PASSWORD = 'a-made-up-admin-password-for-tests'
const NOW = Date.UTC(2026, 10, 10)

const request = (headers: Record<string, string> = {}) =>
  new Request('https://shelf.test/api/admin', { headers })

describe('the admin password', () => {
  it('opens the page for twelve hours, and no longer', () => {
    const token = adminToken(PASSWORD, NOW)
    expect(validToken(token, PASSWORD, NOW + 1)).toBe(true)
    expect(validToken(token, PASSWORD, NOW + ADMIN_SESSION_MS - 1)).toBe(true)
    expect(validToken(token, PASSWORD, NOW + ADMIN_SESSION_MS)).toBe(false)
  })

  it('refuses a cookie made with another password, or changed by hand', () => {
    const token = adminToken(PASSWORD, NOW)
    expect(validToken(token, `${PASSWORD}-new`, NOW)).toBe(false)
    const [time, signed] = token.split('.')
    expect(validToken(`${Number(time) + 1}.${signed}`, PASSWORD, NOW)).toBe(false)
    expect(validToken('nonsense', PASSWORD, NOW)).toBe(false)
  })

  it('lets in the cookie, or the password as a bearer token', () => {
    const cookie = `other=1; ${ADMIN_COOKIE}=${encodeURIComponent(adminToken(PASSWORD, NOW))}`
    expect(isAdmin(request({ cookie }), PASSWORD, NOW)).toBe(true)
    expect(isAdmin(request({ authorization: `Bearer ${PASSWORD}` }), PASSWORD, NOW)).toBe(true)
    expect(isAdmin(request({ authorization: 'Bearer guess' }), PASSWORD, NOW)).toBe(false)
    expect(isAdmin(request({ cookie: `${ADMIN_COOKIE}=%E0%A4%A` }), PASSWORD, NOW)).toBe(false)
    expect(isAdmin(request(), PASSWORD, NOW)).toBe(false)
  })

  it('lets nobody in while the server has no password', async () => {
    const asking = request({ authorization: 'Bearer ' })
    expect(isAdmin(asking, undefined, NOW)).toBe(false)
    const off = adminRefusal(asking, undefined, NOW)
    expect(off?.status).toBe(404)
    expect(await off?.json()).toEqual({ error: 'off' })
    expect(adminRefusal(request(), PASSWORD, NOW)?.status).toBe(401)
    expect(
      adminRefusal(request({ authorization: `Bearer ${PASSWORD}` }), PASSWORD, NOW),
    ).toBeUndefined()
  })

  it('compares without giving the length away', () => {
    expect(samePassword(PASSWORD, PASSWORD)).toBe(true)
    expect(samePassword('short', PASSWORD)).toBe(false)
  })
})
