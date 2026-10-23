import 'server-only'

import { randomBytes } from 'node:crypto'

import { steamSignInAddress } from '@/domain/sync/steam'
import { routing, type Locale } from '@/i18n/routing'
import { checkAccount } from '@/server/auth/account'
import { mocksRequested, onVercel } from '@/server/env'
import { mockSteamAnswer } from '@/server/mocks/steam-answer'
import { linkMine } from '@/server/services/sync'
import { SourceError } from '@/server/sync/source-error'
import { steam } from '@/server/sync/steam'

/**
 * "Sign in through Steam" (ADR 003): Steam's own page vouches for the
 * account there, and Shelf never sees a Steam password. The round trip is
 * tied to the browser that started it by a random value in a cookie, and to
 * the signed-in account by its session, so another site cannot link a
 * Steam account to someone's shelf.
 */

export const LINK_STATE_COOKIE = 'shelf_link_state'
const COOKIE_PATH = '/api/v1/me/platforms'
const STATE = /^[A-Za-z0-9_-]{32}$/

const localeOf = (value: string | null): Locale =>
  routing.locales.find((locale) => locale === value) ?? routing.defaultLocale

const cookie = (value: string, maxAge: number) =>
  [
    `${LINK_STATE_COOKIE}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(onVercel() ? ['Secure'] : []),
  ].join('; ')

/** The address Steam sends the browser back to: exactly this, which Steam signs. */
const returnAddress = (origin: string, state: string, locale: Locale) =>
  `${origin}/api/v1/me/platforms/steam/return?state=${state}&locale=${locale}`

const go = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const each of cookies) headers.append('Set-Cookie', each)
  return new Response(null, { status: 303, headers })
}

const accountPage = (origin: string, locale: Locale, outcome: 'linked' | 'failed') =>
  `${origin}/${locale}/account?steam=${outcome}#platforms`

/** Off to Steam's sign-in page, for a signed-in account; anyone else, to sign in first. */
export const startSteamLink = async (request: Request): Promise<Response> => {
  const address = new URL(request.url)
  const locale = localeOf(address.searchParams.get('locale'))
  const { account } = await checkAccount(request.headers)
  if (!account) {
    const from = encodeURIComponent(`/${locale}/account`)
    return go(`${address.origin}/${locale}/sign-in?from=${from}`)
  }
  const state = randomBytes(24).toString('base64url')
  const returnTo = returnAddress(address.origin, state, locale)
  // While the test doubles answer, Steam's page is skipped: its answer comes straight back.
  const next =
    mocksRequested() && !onVercel()
      ? `${returnTo}&${mockSteamAnswer(returnTo).toString()}`
      : steamSignInAddress(returnTo, address.origin)
  return go(next, [cookie(state, 10 * 60)])
}

/** Back from Steam: the answer checked with Steam, then the link saved, then the account page. */
export const finishSteamLink = async (request: Request): Promise<Response> => {
  const address = new URL(request.url)
  const locale = localeOf(address.searchParams.get('locale'))
  const state = address.searchParams.get('state') ?? ''
  const expected = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${LINK_STATE_COOKIE}=`))
    ?.slice(LINK_STATE_COOKIE.length + 1)
  const cleared = cookie('', 0)
  const failed = () => go(accountPage(address.origin, locale, 'failed'), [cleared])

  if (!STATE.test(state) || state !== expected) return failed()
  let steamId: string | undefined
  try {
    steamId = await steam().verifySignIn(
      address.searchParams,
      returnAddress(address.origin, state, locale),
    )
  } catch (error) {
    if (!(error instanceof SourceError)) throw error
  }
  if (!steamId) return failed()
  const name = await steam()
    .playerName(steamId)
    .catch(() => undefined)
  const saved = await linkMine('steam', steamId, name)
  if (!saved.ok) {
    if (saved.reason === 'not-signed-in') {
      const from = encodeURIComponent(`/${locale}/account`)
      return go(`${address.origin}/${locale}/sign-in?from=${from}`, [cleared])
    }
    return failed()
  }
  return go(accountPage(address.origin, locale, 'linked'), [cleared])
}
