import { z } from 'zod'

import type { Reported } from '@/domain/sync/items'

/**
 * What Steam sends, for the two questions a sync asks it (ADR 003): the
 * games an account owns (`IPlayerService/GetOwnedGames`) and the account's
 * name (`ISteamUser/GetPlayerSummaries`). Every answer passes these schemas
 * first.
 */

/** A SteamID64: seventeen digits, the form Steam's sign-in vouches for. */
export const steamIdSchema = z.string().regex(/^\d{17}$/)

const ownedGame = z.object({
  appid: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  /** Minutes, on every computer together. */
  playtime_forever: z.number().int().nonnegative().default(0),
  /** Seconds since 1970; 0 when never played. */
  rtime_last_played: z.number().int().nonnegative().optional(),
})

/**
 * An account whose game details are not public answers with an empty
 * `response`: no count and no games. One with no games answers a count of 0.
 */
export const steamOwnedGamesSchema = z.object({
  response: z.object({
    game_count: z.number().int().nonnegative().optional(),
    games: z.array(ownedGame).optional(),
  }),
})

export type SteamOwnedGames = z.infer<typeof steamOwnedGamesSchema>

export const steamPlayersSchema = z.object({
  response: z.object({
    players: z.array(
      z.object({
        steamid: z.string(),
        personaname: z.string().optional(),
        /** 3 when the profile is public. */
        communityvisibilitystate: z.number().int().optional(),
      }),
    ),
  }),
})

/** The games an answer lists, as the sync remembers them; undefined when the account hides them. */
export const reportedFromSteam = (answer: SteamOwnedGames): Reported[] | undefined => {
  const { game_count: count, games } = answer.response
  if (count === undefined && games === undefined) return undefined
  return (games ?? []).flatMap((game) => {
    // A game Steam has no name for is one it has taken down; nothing to match it by.
    if (!game.name) return []
    const reported: Reported = {
      storeId: String(game.appid),
      title: game.name,
      minutes: game.playtime_forever,
    }
    if (game.rtime_last_played) reported.lastPlayedAt = game.rtime_last_played * 1000
    return [reported]
  })
}

/** Steam's OpenID 2.0 provider, the "Sign in through Steam" page. */
export const STEAM_OPENID = 'https://steamcommunity.com/openid/login'

const OPENID_NS = 'http://specs.openid.net/auth/2.0'
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select'

/** Where to send the browser to sign in through Steam, coming back to `returnTo`. */
export const steamSignInAddress = (returnTo: string, realm: string, provider = STEAM_OPENID) => {
  const address = new URL(provider)
  address.search = new URLSearchParams({
    'openid.ns': OPENID_NS,
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  }).toString()
  return address.toString()
}

const CLAIMED_ID = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/

/**
 * The account Steam's answer claims, before Steam has confirmed it: the
 * answer must be a positive one, from Steam, for the address it was sent
 * back to. Steam is then asked whether it really sent it.
 */
export const claimedSteamId = (
  params: URLSearchParams,
  returnTo: string,
  provider = STEAM_OPENID,
): string | undefined => {
  if (params.get('openid.ns') !== OPENID_NS) return undefined
  if (params.get('openid.mode') !== 'id_res') return undefined
  if (params.get('openid.op_endpoint') !== provider) return undefined
  // Steam signs the address it sends back to, query and all.
  if (params.get('openid.return_to') !== returnTo) return undefined
  const claimed = params.get('openid.claimed_id') ?? ''
  if (params.get('openid.identity') !== claimed) return undefined
  return CLAIMED_ID.exec(claimed)?.[1]
}

/** The question that asks Steam whether it sent an answer: the answer itself, marked for checking. */
export const checkAuthenticationBody = (params: URLSearchParams): URLSearchParams => {
  const body = new URLSearchParams()
  for (const [name, value] of params) if (name.startsWith('openid.')) body.set(name, value)
  body.set('openid.mode', 'check_authentication')
  return body
}

/** Steam's reply to that question: key-value lines, `is_valid:true` for yes. */
export const isValidAnswer = (text: string): boolean =>
  text.split(/\r?\n/).some((line) => line.trim() === 'is_valid:true')
