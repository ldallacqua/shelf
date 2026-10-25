import { z } from 'zod'

import type { Reported, StoreKind, StoreKindOf } from '@/domain/sync/items'

/**
 * What Steam sends, for the three questions a sync asks it (ADR 003): the
 * games an account owns (`IPlayerService/GetOwnedGames`), the account's
 * name (`ISteamUser/GetPlayerSummaries`), and what kind of app each one is
 * (`IStoreBrowseService/GetItems`, the store's own). Every answer passes
 * these schemas first.
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

/**
 * The store's answer about some apps, one item per app asked, in any order.
 * `success` is 1 for an app with a store page; anything else (15 for one
 * Steam does not know) has only the `id` asked.
 */
export const steamStoreItemsSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number().int().nonnegative(),
          success: z.number().int(),
          /** The store's app type: see `STORE_KIND`. */
          type: z.number().int().nonnegative().optional(),
          related_items: z
            .object({ parent_appid: z.number().int().positive().optional() })
            .optional(),
        }),
      )
      .default([]),
  }),
})

export type SteamStoreItems = z.infer<typeof steamStoreItemsSchema>

/** The question to the store about these apps, as `GetItems` takes it. */
export const storeItemsQuestion = (appIds: readonly string[]): string =>
  JSON.stringify({
    ids: appIds.map((appid) => ({ appid: Number(appid) })),
    context: { language: 'english', country_code: 'US' },
    data_request: {},
  })

/**
 * The store's app types (Valve's `EStoreAppType`), as the sync reads them.
 * A mod, and a DLC that Steam lists as an app of its own, may be games:
 * IGDB decides those. A type not here is taken as a game too.
 */
const STORE_KIND: Record<number, StoreKind> = {
  0: 'game',
  1: 'demo',
  2: 'game', // a mod
  3: 'media', // a film
  4: 'game', // a DLC with hours of its own: something I launch
  5: 'media', // a guide
  6: 'software',
  7: 'media', // a video
  8: 'media', // a series
  9: 'media', // an episode
  10: 'software', // hardware's own app
  11: 'media', // a soundtrack
  12: 'demo', // a beta
  13: 'software', // a tool
  14: 'part', // a store page for a mode of another app: see `kindsFromSteam`
}

/** Steam names a playtest "<Game> Playtest", and gives it no store page. */
const PLAYTEST = /\bplaytest\s*$/i

/**
 * Each app's kind, from the store's answer. An app the answer has no page
 * for is a playtest when its name says so, and unknown otherwise. An app the
 * answer leaves out is left out here too, to be asked again.
 */
export const kindsFromSteam = (
  answer: SteamStoreItems,
  apps: readonly { storeId: string; title: string }[],
): Map<string, StoreKindOf> => {
  const byId = new Map(answer.response.store_items.map((item) => [String(item.id), item]))
  const kinds = new Map<string, StoreKindOf>()
  for (const { storeId, title } of apps) {
    const item = byId.get(storeId)
    if (!item) continue
    if (item.success !== 1) {
      kinds.set(storeId, { kind: PLAYTEST.test(title) ? 'demo' : 'unknown' })
      continue
    }
    const kind = STORE_KIND[item.type ?? 0] ?? 'game'
    const parent = item.related_items?.parent_appid
    if (item.type !== 14) kinds.set(storeId, { kind })
    // A mode's page that names no game (Black Ops II's zombies): the sync looks for it by title.
    else
      kinds.set(
        storeId,
        parent ? { kind: 'part', parentStoreId: String(parent) } : { kind: 'part' },
      )
  }
  return kinds
}

/** Steam's OpenID 2.0 provider, the "Sign in through Steam" page. */
export const STEAM_OPENID = 'https://steamcommunity.com/openid/login'

/**
 * The signed-in person's own privacy settings on Steam, where Game details is
 * set to Public. Signed out, Steam asks for its sign-in first, then opens them.
 */
export const STEAM_PRIVACY_SETTINGS = 'https://steamcommunity.com/my/edit/settings'

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
