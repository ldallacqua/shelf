import { z } from 'zod'

import type { Reported } from '@/domain/sync/items'

/**
 * What Nintendo sends, for the questions a Nintendo sync asks (ADR 003,
 * "Built: Nintendo"): a session token for the code Nintendo's sign-in page
 * gave, an access token for that session, the account's id and nickname,
 * and the play history the Nintendo Store app shows: every game played on
 * the account, with its minutes and when it was first and last played.
 * Nintendo documents none of these; every answer passes these schemas first.
 */

/**
 * Shelf signs in as the Nintendo Store app does, the only app that reads the
 * play history, so Nintendo's page says the account is linked to "Nintendo
 * Store". The scope is that app's own.
 */
export const NINTENDO_CLIENT_ID = '5c38e31cd085304b'
export const NINTENDO_SCOPE = 'openid user user.mii user.email user.links[].id'

/**
 * Where Nintendo's page sends the app back: an address only the app opens.
 * A browser cannot follow it, so the person copies it from the page's
 * "Select this account" button and pastes it into Shelf.
 */
export const NINTENDO_REDIRECT = `npf${NINTENDO_CLIENT_ID}://auth`

export const NINTENDO_ACCOUNTS = 'https://accounts.nintendo.com/connect/1.0.0'

/** Nintendo's own sign-in page, for one round trip: its state, and the challenge of its secret. */
export const nintendoSignInAddress = (state: string, challenge: string): string =>
  `${NINTENDO_ACCOUNTS}/authorize?${new URLSearchParams({
    state,
    redirect_uri: NINTENDO_REDIRECT,
    client_id: NINTENDO_CLIENT_ID,
    scope: NINTENDO_SCOPE,
    response_type: 'session_token_code',
    session_token_code_challenge: challenge,
    session_token_code_challenge_method: 'S256',
  }).toString()}`

/** A session token code is a JWT: three parts of base64url. */
const CODE = /^[\w-]+\.[\w-]+\.[\w-]+$/

/** Longer than any link Nintendo's button carries. */
export const MAX_PASTED_LINK = 4_000

export type PastedLink =
  | { ok: true; code: string }
  /** Not what the button links to: the page's own address, say, or part of the link. */
  | { ok: false; reason: 'not-the-link' }
  /** The button of another sign-in: an older one, or someone else's. */
  | { ok: false; reason: 'another-sign-in' }

/** The code in a link copied from Nintendo's "Select this account" button, for this round trip. */
export const codeFromLink = (pasted: string, state: string): PastedLink => {
  const text = pasted.trim()
  if (text.length > MAX_PASTED_LINK || !text.startsWith(`${NINTENDO_REDIRECT}#`)) {
    return { ok: false, reason: 'not-the-link' }
  }
  const fragment = new URLSearchParams(text.slice(NINTENDO_REDIRECT.length + 1))
  const code = fragment.get('session_token_code') ?? ''
  if (!CODE.test(code)) return { ok: false, reason: 'not-the-link' }
  if (fragment.get('state') !== state) return { ok: false, reason: 'another-sign-in' }
  return { ok: true, code }
}

/** The session the code is exchanged for: about two years, until the person ends it. */
export const nintendoSessionSchema = z.object({ session_token: z.string().min(1) })

/** An access token for the session, good for a quarter of an hour. */
export const nintendoTokenSchema = z.object({
  access_token: z.string().min(1),
  id_token: z.string().optional(),
})

/** The account, of everything Nintendo sends about it: its id and the nickname shown on the page. */
export const nintendoUserSchema = z.object({
  id: z.string().min(1),
  nickname: z.string().optional(),
})

const idTokenSchema = z.object({ sub: z.string().min(1) })

/** The account an id token names, read from its payload, for when the account's own answer fails. */
export const accountOfIdToken = (idToken: string): string | undefined => {
  const payload = idToken.split('.')[1]
  if (!payload) return undefined
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const parsed = idTokenSchema.safeParse(JSON.parse(json))
    return parsed.success ? parsed.data.sub : undefined
  } catch {
    return undefined
  }
}

const moment = z
  .string()
  .optional()
  .transform((value) => {
    const at = value === undefined ? Number.NaN : Date.parse(value)
    return Number.isFinite(at) ? at : undefined
  })

/** The play history: one entry for each game on each console it was played on. */
export const nintendoPlayHistorySchema = z.object({
  playHistories: z
    .array(
      z.object({
        /** The game's id on Nintendo's consoles, sixteen hex digits. */
        titleId: z.string().min(1).max(32),
        titleName: z.string(),
        /** The console it was played on: `HAC` a Switch, `BEE` a Switch 2. */
        platform: z.string().optional(),
        totalPlayedMinutes: z.number().nonnegative().default(0),
        firstPlayedAt: moment,
        lastPlayedAt: moment,
      }),
    )
    .default([]),
})

export type NintendoPlayHistory = z.infer<typeof nintendoPlayHistorySchema>

/**
 * Nintendo's names for its consoles, as IGDB platform ids. A game played on
 * a console not here is matched on all of Nintendo's.
 */
const CONSOLES: Record<string, number> = {
  HAC: 130, // Nintendo Switch
  BEE: 508, // Nintendo Switch 2
  WUP: 41, // Wii U
  CTR: 37, // Nintendo 3DS
  KTR: 137, // New Nintendo 3DS
}

/**
 * Each game once, whatever consoles it was played on: its minutes summed,
 * its last play the latest, and its console the one it was first played on.
 * A Switch game first played on a Switch is a Switch game, though it went on
 * on a Switch 2. Nintendo gives no year.
 */
export const reportedFromNintendo = (answer: NintendoPlayHistory): Reported[] => {
  type Game = { first: number; title: string; platformId?: number; minutes: number; last: number }
  const games = new Map<string, Game>()
  for (const entry of answer.playHistories) {
    const storeId = entry.titleId.toUpperCase()
    const here: Game = {
      first: entry.firstPlayedAt ?? Number.POSITIVE_INFINITY,
      title: entry.titleName.trim(),
      ...(entry.platform && CONSOLES[entry.platform.toUpperCase()] !== undefined
        ? { platformId: CONSOLES[entry.platform.toUpperCase()] }
        : {}),
      minutes: Math.round(entry.totalPlayedMinutes),
      last: entry.lastPlayedAt ?? 0,
    }
    const known = games.get(storeId)
    if (!known) {
      games.set(storeId, here)
      continue
    }
    const earliest = here.first < known.first ? here : known
    games.set(storeId, {
      first: earliest.first,
      title: earliest.title,
      ...(earliest.platformId === undefined ? {} : { platformId: earliest.platformId }),
      minutes: known.minutes + here.minutes,
      last: Math.max(known.last, here.last),
    })
  }
  return [...games].map(([storeId, game]) => ({
    storeId,
    title: game.title,
    ...(game.platformId === undefined ? {} : { platformId: game.platformId }),
    minutes: game.minutes,
    ...(game.last > 0 ? { lastPlayedAt: game.last } : {}),
  }))
}
