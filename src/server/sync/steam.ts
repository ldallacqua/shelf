import 'server-only'

import type { Reported } from '@/domain/sync/items'
import {
  checkAuthenticationBody,
  claimedSteamId,
  isValidAnswer,
  reportedFromSteam,
  STEAM_OPENID,
  steamOwnedGamesSchema,
  steamPlayersSchema,
} from '@/domain/sync/steam'
import { steamKey } from '@/server/env'
import { SourceError } from '@/server/sync/source-error'

/**
 * Steam, the first source (ADR 003): the only code that knows Steam's
 * addresses. It asks two things of the Web API, with Shelf's key, about an
 * account that signed in through Steam, and checks that sign-in with Steam
 * itself. Nothing here writes; the sync decides what the answers become.
 */

export const STEAM_API = 'https://api.steampowered.com'

export type SteamDeps = {
  key: () => string | undefined
  fetch?: typeof fetch
  timeoutMs?: number
}

export const createSteam = ({ key, fetch: given, timeoutMs = 15_000 }: SteamDeps) => {
  // Looked up at each call, not when made, so whatever wraps fetch later is used.
  const send: typeof fetch = (input, init) => (given ?? fetch)(input, init)
  /** A Web API question. The key travels in the address, as Steam asks; that address is never logged. */
  const ask = async (path: string, params: Record<string, string>): Promise<unknown> => {
    const secret = key()
    if (!secret) throw new SourceError('unset', 'This server has no Steam Web API key.')
    const address = new URL(`${STEAM_API}${path}`)
    address.search = new URLSearchParams({ key: secret, format: 'json', ...params }).toString()
    let response: Response
    try {
      response = await send(address, { signal: AbortSignal.timeout(timeoutMs) })
    } catch {
      throw new SourceError('unreachable', `Steam did not answer ${path}.`)
    }
    if (!response.ok)
      throw new SourceError('unreachable', `Steam answered ${path} with ${response.status}.`)
    return response.json().catch(() => {
      throw new SourceError('unreachable', `Steam's answer to ${path} was not JSON.`)
    })
  }

  /**
   * Every game the account owns, free games it has played among them, with
   * its minutes. Undefined when its game details are not public.
   */
  const ownedGames = async (steamId: string): Promise<Reported[] | undefined> => {
    const parsed = steamOwnedGamesSchema.safeParse(
      await ask('/IPlayerService/GetOwnedGames/v1/', {
        steamid: steamId,
        include_appinfo: 'true',
        include_played_free_games: 'true',
      }),
    )
    if (!parsed.success) throw new SourceError('unreachable', 'Steam listed games in a new shape.')
    return reportedFromSteam(parsed.data)
  }

  /** The account's name on Steam, for the page. */
  const playerName = async (steamId: string): Promise<string | undefined> => {
    const parsed = steamPlayersSchema.safeParse(
      await ask('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }),
    )
    if (!parsed.success) return undefined
    return parsed.data.response.players.find((player) => player.steamid === steamId)?.personaname
  }

  /**
   * The account a "Sign in through Steam" answer is for, once Steam has said
   * it sent that answer; undefined for anything else. Steam answers each
   * answer's question once, so an answer cannot be used twice.
   */
  const verifySignIn = async (
    params: URLSearchParams,
    returnTo: string,
  ): Promise<string | undefined> => {
    const claimed = claimedSteamId(params, returnTo)
    if (!claimed) return undefined
    let response: Response
    try {
      response = await send(STEAM_OPENID, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: checkAuthenticationBody(params),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new SourceError('unreachable', 'Steam did not answer whether it signed me in.')
    }
    if (!response.ok) return undefined
    return isValidAnswer(await response.text()) ? claimed : undefined
  }

  return { ownedGames, playerName, verifySignIn }
}

export type Steam = ReturnType<typeof createSteam>

let shared: Steam | undefined
/** This server's Steam, with its key. */
export const steam = (): Steam => (shared ??= createSteam({ key: steamKey }))
