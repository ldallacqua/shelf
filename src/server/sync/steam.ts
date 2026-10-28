import 'server-only'

import type {
  AchievementLanguage,
  DefinedSet,
  ProgressAnswer,
} from '@/domain/achievements/achievements'
import {
  definedFromSteam,
  playerFromSteam,
  ratesFromSteam,
  STEAM_LANGUAGE,
  steamRatesAnswerSchema,
  steamSchemaAnswerSchema,
} from '@/domain/achievements/steam'
import type { Reported, StoreKindOf } from '@/domain/sync/items'
import {
  checkAuthenticationBody,
  claimedSteamId,
  isValidAnswer,
  kindsFromSteam,
  reportedFromSteam,
  STEAM_OPENID,
  steamOwnedGamesSchema,
  steamPlayersSchema,
  steamStoreItemsSchema,
  storeItemsQuestion,
} from '@/domain/sync/steam'
import { steamKey } from '@/server/env'
import { SourceError } from '@/server/sync/source-error'

/**
 * Steam, the first source (ADR 003): the only code that knows Steam's
 * addresses. It asks the Web API, with Shelf's key, what an account that
 * signed in through Steam owns and what it is called, the store what kind
 * of app each game is, and each game's achievements and the account's
 * progress through them; and it checks that sign-in with Steam itself.
 * Nothing here writes; the sync decides what the answers become.
 */

export const STEAM_API = 'https://api.steampowered.com'

/** Apps asked of the store in one request: the question travels in the address. */
const APPS_PER_REQUEST = 100

/**
 * How long to wait before asking Steam again, after it answered that it is
 * busy or failing: twice, then the question fails, to be asked on a later step.
 */
const RETRY_AFTER_MS = [1_000, 3_000]
/** The longest wait Steam's own `Retry-After` may ask for here. */
const LONGEST_WAIT_MS = 5_000

export type SteamDeps = {
  key: () => string | undefined
  fetch?: typeof fetch
  timeoutMs?: number
  /** How a retry waits: tests do not. */
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export const createSteam = ({ key, fetch: given, timeoutMs = 15_000, sleep = wait }: SteamDeps) => {
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
   * An achievement question, answered with its status and body, whatever the
   * status: Steam says "private" and "no achievements" with a 403 and a 400.
   * Busy (429) or failing (5xx), or not reached, Steam is asked again after a
   * wait, twice; then the question fails.
   */
  const askStats = async (
    path: string,
    params: Record<string, string>,
  ): Promise<{ status: number; body: unknown }> => {
    const secret = key()
    if (!secret) throw new SourceError('unset', 'This server has no Steam Web API key.')
    const address = new URL(`${STEAM_API}${path}`)
    address.search = new URLSearchParams({ key: secret, format: 'json', ...params }).toString()
    for (let attempt = 0; ; attempt += 1) {
      let response: Response | undefined
      try {
        response = await send(address, { signal: AbortSignal.timeout(timeoutMs) })
      } catch {
        response = undefined
      }
      const busy = !response || response.status === 429 || response.status >= 500
      if (!busy) {
        return { status: response!.status, body: await response!.json().catch(() => undefined) }
      }
      const delay = RETRY_AFTER_MS[attempt]
      if (delay === undefined) {
        throw new SourceError(
          'unreachable',
          `Steam did not answer ${path}${response ? ` (${response.status})` : ''}.`,
        )
      }
      const asked = Number(response?.headers.get('retry-after'))
      await sleep(
        Number.isFinite(asked) && asked > 0 ? Math.min(asked * 1000, LONGEST_WAIT_MS) : delay,
      )
    }
  }

  /** A game's achievements in one language, or nothing when it has none. */
  const achievementSchema = async (
    appId: string,
    language: AchievementLanguage,
  ): Promise<DefinedSet | undefined> => {
    const { status, body } = await askStats('/ISteamUserStats/GetSchemaForGame/v2/', {
      appid: appId,
      l: STEAM_LANGUAGE[language],
    })
    // A game Steam does not know, or one without stats, answers an empty `game`, or a 400 or 403.
    if (status === 400 || status === 403) return undefined
    const parsed = steamSchemaAnswerSchema.safeParse(body)
    if (status !== 200 || !parsed.success) {
      throw new SourceError('unreachable', 'Steam described achievements in a new shape.')
    }
    return definedFromSteam(parsed.data)
  }

  /** The account's progress through a game's achievements. */
  const playerAchievements = async (steamId: string, appId: string): Promise<ProgressAnswer> => {
    const { status, body } = await askStats('/ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: steamId,
      appid: appId,
      l: STEAM_LANGUAGE.en,
    })
    const answer = playerFromSteam(status, body)
    if (!answer) {
      throw new SourceError(
        'unreachable',
        `Steam answered an account's achievements with ${status}.`,
      )
    }
    return answer
  }

  /** How many of Steam's players unlocked each of a game's achievements, by its id. */
  const unlockRates = async (appId: string): Promise<Map<string, number>> => {
    const { status, body } = await askStats(
      '/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/',
      { gameid: appId },
    )
    // A game without achievements answers 403 and nothing.
    if (status === 403) return new Map()
    const parsed = steamRatesAnswerSchema.safeParse(body)
    if (status !== 200 || !parsed.success) {
      throw new SourceError('unreachable', 'Steam gave unlock rates in a new shape.')
    }
    return ratesFromSteam(parsed.data)
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
   * What kind of app each of these is, by the store: a game, a demo,
   * software. The apps go a hundred to a request, four requests at a time;
   * an app whose request failed is left out of the answer, to be asked again.
   */
  const appKinds = async (
    apps: readonly { storeId: string; title: string }[],
  ): Promise<Map<string, StoreKindOf>> => {
    const batches: (typeof apps)[] = []
    for (let i = 0; i < apps.length; i += APPS_PER_REQUEST) {
      batches.push(apps.slice(i, i + APPS_PER_REQUEST))
    }
    const kinds = new Map<string, StoreKindOf>()
    for (let i = 0; i < batches.length; i += 4) {
      const answers = await Promise.allSettled(
        batches.slice(i, i + 4).map(async (batch) => {
          const parsed = steamStoreItemsSchema.safeParse(
            await ask('/IStoreBrowseService/GetItems/v1/', {
              input_json: storeItemsQuestion(batch.map((app) => app.storeId)),
            }),
          )
          return parsed.success ? kindsFromSteam(parsed.data, batch) : new Map()
        }),
      )
      for (const answer of answers) {
        if (answer.status === 'fulfilled')
          for (const [id, kind] of answer.value) kinds.set(id, kind)
      }
    }
    return kinds
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

  return {
    ownedGames,
    playerName,
    appKinds,
    verifySignIn,
    achievementSchema,
    playerAchievements,
    unlockRates,
  }
}

export type Steam = ReturnType<typeof createSteam>

let shared: Steam | undefined
/** This server's Steam, with its key. */
export const steam = (): Steam => (shared ??= createSteam({ key: steamKey }))
