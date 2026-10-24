import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import type { Reported } from '@/domain/sync/items'
import {
  accountOfIdToken,
  NINTENDO_ACCOUNTS,
  NINTENDO_CLIENT_ID,
  nintendoPlayHistorySchema,
  nintendoSessionSchema,
  nintendoSignInAddress,
  nintendoTokenSchema,
  nintendoUserSchema,
  reportedFromNintendo,
} from '@/domain/sync/nintendo'
import { SourceError } from '@/server/sync/source-error'

/**
 * Nintendo (ADR 003, "Built: Nintendo"): the only code that knows
 * Nintendo's addresses. Shelf signs in as the Nintendo Store app does: the
 * person signs in on Nintendo's own page, and the code it gives becomes a
 * session that lasts about two years. Each read trades that session for a
 * token good for a quarter of an hour, and asks for the play history the
 * app shows. None of it is documented by Nintendo, and it can change.
 * Nothing here writes or keeps anything; the sync decides what the answers
 * become, and the session is stored sealed (`sealed.ts`).
 */

export const NINTENDO_ACCOUNT_API = 'https://api.accounts.nintendo.com/2.0.0'
export const NINTENDO_STORE_API = 'https://app-api.znej.nintendo.com/api/v2.0'

/** Shelf says who it is, as the Store app does. */
const USER_AGENT = 'Shelf'

/**
 * One sign-in on Nintendo's page: the state that comes back with its code,
 * and the secret only Shelf knows, whose hash the page is shown. The code
 * is worth nothing without it.
 */
export type RoundTrip = { state: string; verifier: string }

export const newRoundTrip = (): RoundTrip => ({
  state: randomBytes(36).toString('base64url'),
  verifier: randomBytes(32).toString('base64url'),
})

/** Nintendo's sign-in page for this round trip. */
export const signInAddressFor = (trip: RoundTrip): string =>
  nintendoSignInAddress(trip.state, createHash('sha256').update(trip.verifier).digest('base64url'))

export type NintendoDeps = { fetch?: typeof fetch; timeoutMs?: number }

export const createNintendo = ({ fetch: given, timeoutMs = 15_000 }: NintendoDeps = {}) => {
  // Looked up at each call, not when made, so whatever wraps fetch later is used.
  const send: typeof fetch = (input, init) => (given ?? fetch)(input, init)

  /** One question, and Nintendo's answer to it. Tokens travel in its headers and are never logged. */
  const call = async (address: string, init: RequestInit, what: string) => {
    let response: Response
    try {
      response = await send(address, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...init.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new SourceError('unreachable', `Nintendo did not answer ${what}.`)
    }
    const body: unknown = await response.json().catch(() => undefined)
    return { status: response.status, body }
  }

  const unreachable = (what: string, status: number) =>
    new SourceError('unreachable', `Nintendo answered ${what} with ${status}.`)

  /**
   * The session the code from Nintendo's page is for. Undefined when Nintendo
   * refuses the code: it is good once, for a few minutes.
   */
  const session = async (code: string, verifier: string): Promise<string | undefined> => {
    const { status, body } = await call(
      `${NINTENDO_ACCOUNTS}/api/session_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: NINTENDO_CLIENT_ID,
          session_token_code: code,
          session_token_code_verifier: verifier,
        }).toString(),
      },
      'the sign-in',
    )
    if (status === 400 || status === 401) return undefined
    if (status !== 200) throw unreachable('the sign-in', status)
    const parsed = nintendoSessionSchema.safeParse(body)
    if (!parsed.success) throw new SourceError('unreachable', 'Nintendo signed in in a new shape.')
    return parsed.data.session_token
  }

  /** A token for the session, for a quarter of an hour; `signed-out` once Nintendo has ended it. */
  const token = async (sessionToken: string) => {
    const { status, body } = await call(
      `${NINTENDO_ACCOUNTS}/api/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          client_id: NINTENDO_CLIENT_ID,
          session_token: sessionToken,
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer-session-token',
        }),
      },
      'for a token',
    )
    if (status === 400 || status === 401) {
      throw new SourceError('signed-out', 'Nintendo ended the session.')
    }
    if (status !== 200) throw unreachable('for a token', status)
    const parsed = nintendoTokenSchema.safeParse(body)
    if (!parsed.success)
      throw new SourceError('unreachable', 'Nintendo gave a token in a new shape.')
    return parsed.data
  }

  /**
   * The account a session is for: its id, and its nickname for the page.
   * Of everything Nintendo says about the account, nothing else is read.
   */
  const account = async (sessionToken: string): Promise<{ id: string; nickname?: string }> => {
    const given = await token(sessionToken)
    const { status, body } = await call(
      `${NINTENDO_ACCOUNT_API}/users/me`,
      { headers: { Authorization: `Bearer ${given.access_token}` } },
      'about the account',
    )
    const parsed = status === 200 ? nintendoUserSchema.safeParse(body) : undefined
    if (parsed?.success) {
      const { id, nickname } = parsed.data
      return { id, ...(nickname ? { nickname } : {}) }
    }
    // The token itself names the account, for when Nintendo does not say more.
    const id = given.id_token ? accountOfIdToken(given.id_token) : undefined
    if (!id) throw new SourceError('unreachable', 'Nintendo did not say which account signed in.')
    return { id }
  }

  /** Every game the account has played, as the Nintendo Store app lists them, with its minutes. */
  const playHistory = async (sessionToken: string): Promise<Reported[]> => {
    const given = await token(sessionToken)
    const { status, body } = await call(
      `${NINTENDO_STORE_API}/users/me/play_histories`,
      // Titles in English, as IGDB names games.
      { headers: { Authorization: `Bearer ${given.access_token}`, 'gentry-locale': 'en-US' } },
      'with the play history',
    )
    if (status !== 200) throw unreachable('with the play history', status)
    const parsed = nintendoPlayHistorySchema.safeParse(body)
    if (!parsed.success)
      throw new SourceError('unreachable', 'Nintendo listed games in a new shape.')
    return reportedFromNintendo(parsed.data)
  }

  return { session, account, playHistory }
}

export type Nintendo = ReturnType<typeof createNintendo>

let shared: Nintendo | undefined
/** This server's Nintendo. */
export const nintendo = (): Nintendo => (shared ??= createNintendo())
