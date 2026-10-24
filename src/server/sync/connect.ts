import 'server-only'

import { randomBytes } from 'node:crypto'

import { z } from 'zod'

import { isLinkPage, type LinkPage, type NintendoLinkOutcome } from '@/domain/sync/link'
import { codeFromLink, MAX_PASTED_LINK, NINTENDO_REDIRECT } from '@/domain/sync/nintendo'
import { steamSignInAddress } from '@/domain/sync/steam'
import { routing, type Locale } from '@/i18n/routing'
import { apiNintendoLinked } from '@/server/api/platforms'
import { bodyOf, refused } from '@/server/api/writes'
import { checkAccount } from '@/server/auth/account'
import { mocksRequested, onVercel } from '@/server/env'
import { MOCK_NINTENDO } from '@/server/mocks/owner'
import { mockSteamAnswer } from '@/server/mocks/steam-answer'
import { linkMine } from '@/server/services/sync'
import { newRoundTrip, nintendo, signInAddressFor, type RoundTrip } from '@/server/sync/nintendo'
import { canSeal } from '@/server/sync/sealed'
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

/** The page linking began on, as the address names it: the account page unless it says otherwise. */
const pageOf = (value: string | null): LinkPage => (isLinkPage(value) ? value : 'account')

/**
 * The address Steam sends the browser back to: exactly this, which Steam
 * signs, so the page to come back to cannot be changed on the way.
 */
const returnAddress = (origin: string, state: string, locale: Locale, page: LinkPage) =>
  `${origin}/api/v1/me/platforms/steam/return?state=${state}&locale=${locale}${
    page === 'account' ? '' : `&back=${page}`
  }`

const go = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' })
  for (const each of cookies) headers.append('Set-Cookie', each)
  return new Response(null, { status: 303, headers })
}

/** Where the browser lands with how linking went: back on the page it began on. */
const pageAfter = (origin: string, locale: Locale, page: LinkPage, outcome: 'linked' | 'failed') =>
  page === 'start'
    ? `${origin}/${locale}/account/start?steam=${outcome}`
    : `${origin}/${locale}/account?steam=${outcome}#platforms`

/** Signing in to Shelf first, then back to the page linking began on. */
const signInFirst = (origin: string, locale: Locale, page: LinkPage) => {
  const from = encodeURIComponent(`/${locale}/account${page === 'start' ? '/start' : ''}`)
  return `${origin}/${locale}/sign-in?from=${from}`
}

/** Off to Steam's sign-in page, for a signed-in account; anyone else, to sign in first. */
export const startSteamLink = async (request: Request): Promise<Response> => {
  const address = new URL(request.url)
  const locale = localeOf(address.searchParams.get('locale'))
  const page = pageOf(address.searchParams.get('back'))
  const { account } = await checkAccount(request.headers)
  if (!account) return go(signInFirst(address.origin, locale, page))
  const state = randomBytes(24).toString('base64url')
  const returnTo = returnAddress(address.origin, state, locale, page)
  // While the test doubles answer, Steam's page is skipped: its answer comes straight back.
  const next =
    mocksRequested() && !onVercel()
      ? `${returnTo}&${mockSteamAnswer(returnTo).toString()}`
      : steamSignInAddress(returnTo, address.origin)
  return go(next, [cookie(state, 10 * 60)])
}

/** Back from Steam: the answer checked with Steam, then the link saved, then the page it began on. */
export const finishSteamLink = async (request: Request): Promise<Response> => {
  const address = new URL(request.url)
  const locale = localeOf(address.searchParams.get('locale'))
  const page = pageOf(address.searchParams.get('back'))
  const state = address.searchParams.get('state') ?? ''
  const expected = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${LINK_STATE_COOKIE}=`))
    ?.slice(LINK_STATE_COOKIE.length + 1)
  const cleared = cookie('', 0)
  const failed = () => go(pageAfter(address.origin, locale, page, 'failed'), [cleared])

  if (!STATE.test(state) || state !== expected) return failed()
  let steamId: string | undefined
  try {
    steamId = await steam().verifySignIn(
      address.searchParams,
      returnAddress(address.origin, state, locale, page),
    )
  } catch (error) {
    if (!(error instanceof SourceError)) throw error
  }
  if (!steamId) return failed()
  const name = await steam()
    .playerName(steamId)
    .catch(() => undefined)
  const saved = await linkMine('steam', { externalId: steamId, ...(name ? { name } : {}) })
  if (!saved.ok) {
    if (saved.reason === 'not-signed-in') {
      return go(signInFirst(address.origin, locale, page), [cleared])
    }
    return failed()
  }
  return go(pageAfter(address.origin, locale, page, 'linked'), [cleared])
}

/*
 * Signing in on Nintendo's page (ADR 003, "Built: Nintendo"). Nintendo's page
 * sends its answer to an address only the Nintendo Store app opens, so it
 * never comes back here by itself: the person copies the link from the
 * page's "Select this account" button and pastes it into the account page.
 * The round trip's state and secret wait in a cookie this browser alone
 * sends back, so a link copied from someone else's sign-in links nothing.
 */

export const NINTENDO_TRIP_COOKIE = 'shelf_nintendo_trip'
const NINTENDO_PATH = '/api/v1/me/platforms/nintendo'
/** Time enough to sign in on Nintendo's page, copy the link and come back. */
const TRIP_SECONDS = 15 * 60
const TRIP = /^([\w-]{48})\.([\w-]{43})$/

const tripCookie = (value: string, maxAge: number) =>
  [
    `${NINTENDO_TRIP_COOKIE}=${value}`,
    `Path=${NINTENDO_PATH}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(onVercel() ? ['Secure'] : []),
  ].join('; ')

const tripOf = (request: Request): RoundTrip | undefined => {
  const value = request.headers
    .get('cookie')
    ?.split(/;\s*/)
    .find((part) => part.startsWith(`${NINTENDO_TRIP_COOKIE}=`))
    ?.slice(NINTENDO_TRIP_COOKIE.length + 1)
  const parts = value ? TRIP.exec(value) : null
  return parts ? { state: parts[1]!, verifier: parts[2]! } : undefined
}

/**
 * While the test doubles answer, a page of Shelf's own stands in for
 * Nintendo's: its button links to what Nintendo's would, for the made-up
 * account, so the copying and pasting can be tried here.
 */
const standIn = (trip: RoundTrip, cookies: string[]) => {
  const link = `${NINTENDO_REDIRECT}#${new URLSearchParams({
    session_token_code: MOCK_NINTENDO.code,
    state: trip.state,
    session_state: 'test-doubles-only',
  }).toString()}`
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Stand-in for Nintendo's sign-in</title>
<main><h1>Stand-in for Nintendo's sign-in</h1>
<p>The test doubles are answering (SHELF_MOCKS=1), so this page stands in for Nintendo's. Copy the button's link, as on Nintendo's page, and paste it into the account page.</p>
<p><a id="authorize-switch-approval-link" href="${link}">Select this account</a></p></main></html>`
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  for (const each of cookies) headers.append('Set-Cookie', each)
  return new Response(page, { headers })
}

/** Off to Nintendo's sign-in page, for a signed-in account; anyone else, to sign in first. */
export const startNintendoLink = async (request: Request): Promise<Response> => {
  const address = new URL(request.url)
  const locale = localeOf(address.searchParams.get('locale'))
  const { account } = await checkAccount(request.headers)
  if (!account) {
    const from = encodeURIComponent(`/${locale}/account`)
    return go(`${address.origin}/${locale}/sign-in?from=${from}`)
  }
  const trip = newRoundTrip()
  const cookies = [tripCookie(`${trip.state}.${trip.verifier}`, TRIP_SECONDS)]
  if (mocksRequested() && !onVercel()) return standIn(trip, cookies)
  return go(signInAddressFor(trip), cookies)
}

const pastedShape = z.object({ link: z.string().max(MAX_PASTED_LINK) })

/**
 * The link from Nintendo's button, pasted on the account page: checked
 * against this browser's round trip, its code exchanged for Nintendo's
 * session, and the account linked with that session sealed. The answer
 * says how it went, in words the page has a sentence for.
 */
export const finishNintendoLink = async (request: Request): Promise<Response> => {
  const { account } = await checkAccount(request.headers)
  if (!account) return refused({ ok: false, reason: 'not-signed-in' })
  const pasted = pastedShape.safeParse(await bodyOf(request))
  if (!pasted.success) return refused({ ok: false, reason: 'invalid' })

  const answer = (outcome: NintendoLinkOutcome, done = false) => {
    const headers = new Headers({ 'Cache-Control': 'private, no-store' })
    // A round trip that is over is forgotten; one that is not stays, for another paste.
    if (done) headers.append('Set-Cookie', tripCookie('', 0))
    return Response.json(apiNintendoLinked.parse({ outcome }), { headers })
  }

  const trip = tripOf(request)
  if (!trip) return answer('another-sign-in')
  const code = codeFromLink(pasted.data.link, trip.state)
  if (!code.ok) return answer(code.reason)
  if (!canSeal()) return answer('unset')
  try {
    const session = await nintendo().session(code.code, trip.verifier)
    if (!session) return answer('code-refused', true)
    const { id, nickname } = await nintendo().account(session)
    const saved = await linkMine('nintendo', {
      externalId: id,
      ...(nickname ? { name: nickname } : {}),
      secret: session,
    })
    if (!saved.ok) return refused(saved)
    return answer('linked', true)
  } catch (error) {
    if (!(error instanceof SourceError)) throw error
    return answer(error.problem === 'unset' ? 'unset' : 'unreachable')
  }
}
