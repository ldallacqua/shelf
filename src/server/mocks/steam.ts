import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { http, HttpResponse } from 'msw'

import { STEAM_OPENID } from '@/domain/sync/steam'
import { MOCK_STEAM } from '@/server/mocks/owner'
import { MOCK_STEAM_SIGNATURE } from '@/server/mocks/steam-answer'
import { STEAM_API } from '@/server/sync/steam'

/**
 * A test double for Steam, answering as Steam answers: the made-up
 * account's games from `fixtures/steam/`, an empty answer for its private
 * twin, the store's word on what kind of app each is, three games'
 * achievements and the account's progress through them, and Steam's
 * sign-in check for answers this double signed. Any other key, account or
 * address is refused, so a test can never be talking to the real Steam.
 */

export { mockSteamAnswer, MOCK_STEAM_SIGNATURE } from '@/server/mocks/steam-answer'

export type SteamMockState = {
  /** The Web API questions asked, by path. */
  asked: string[]
  /** Sign-in answers already checked: Steam says yes to each once. */
  checked: Set<string>
  /** When set, the Web API answers with this status instead. */
  failWith?: number
  /** Apps whose achievement questions answer 500, as Steam does when it is failing. */
  failApps?: Set<string>
  /** The account's achievements answered as a profile whose game details are not public. */
  achievementsPrivate?: boolean
}

/** One game's achievement answers in `fixtures/steam/achievements.json`, as Steam sends them. */
type AchievementAnswers = {
  schema: Record<string, Record<string, unknown>>
  player?: Record<string, unknown>
  rates?: Record<string, unknown>
}

export const newSteamMockState = (): SteamMockState => ({ asked: [], checked: new Set() })

const read = (file: string): Record<string, unknown> =>
  JSON.parse(
    readFileSync(
      /* turbopackIgnore: true */ join(process.cwd(), 'fixtures', 'steam', file),
      'utf8',
    ),
  ) as Record<string, unknown>

export const createSteamHandlers = (state: SteamMockState = newSteamMockState()) => {
  const owned = read('owned-games.json')
  const store = new Map(
    (
      read('store-items.json') as { response: { store_items: { id: number }[] } }
    ).response.store_items.map((item) => [item.id, item]),
  )

  const achievements = read('achievements.json') as Record<string, AchievementAnswers>
  /** As Steam answers a profile whose game details are not public, and a game without stats. */
  const notPublic = { playerstats: { error: 'Profile is not public', success: false } }
  const noStats = { playerstats: { error: 'Requested app has no stats', success: false } }

  const keyed = (request: Request) => {
    const address = new URL(request.url)
    state.asked.push(address.pathname)
    if (address.searchParams.get('key') !== MOCK_STEAM.key) {
      return { refused: HttpResponse.text('Forbidden', { status: 403 }), address }
    }
    if (state.failWith)
      return { refused: new HttpResponse(null, { status: state.failWith }), address }
    return { address }
  }

  return [
    http.get(`${STEAM_API}/IPlayerService/GetOwnedGames/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const id = address.searchParams.get('steamid')
      if (id === MOCK_STEAM.steamId) return HttpResponse.json(owned)
      if (id === MOCK_STEAM.privateSteamId) return HttpResponse.json({ response: {} })
      return HttpResponse.json({ response: {} })
    }),

    http.get(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const ids = (address.searchParams.get('steamids') ?? '').split(',')
      return HttpResponse.json({
        response: {
          players: ids
            .filter((id) => id === MOCK_STEAM.steamId || id === MOCK_STEAM.privateSteamId)
            .map((id) => ({
              steamid: id,
              personaname: MOCK_STEAM.name,
              communityvisibilitystate: 3,
            })),
        },
      })
    }),

    // A game's achievements, in the language asked: English where the game has no other.
    http.get(`${STEAM_API}/ISteamUserStats/GetSchemaForGame/v2/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const app = address.searchParams.get('appid') ?? ''
      if (state.failApps?.has(app)) return new HttpResponse(null, { status: 500 })
      const game = achievements[app]
      if (!game) return HttpResponse.json({ game: {} })
      return HttpResponse.json(
        game.schema[address.searchParams.get('l') ?? 'english'] ?? game.schema.english,
      )
    }),

    http.get(`${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const app = address.searchParams.get('appid') ?? ''
      if (state.failApps?.has(app)) return new HttpResponse(null, { status: 500 })
      const game = achievements[app]
      // Steam says a game has no stats before it says whose profile is private.
      if (!game?.player) return HttpResponse.json(noStats, { status: 400 })
      if (address.searchParams.get('steamid') !== MOCK_STEAM.steamId || state.achievementsPrivate) {
        return HttpResponse.json(notPublic, { status: 403 })
      }
      return HttpResponse.json(game.player)
    }),

    http.get(
      `${STEAM_API}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/`,
      ({ request }) => {
        const { refused, address } = keyed(request)
        if (refused) return refused
        const app = address.searchParams.get('gameid') ?? ''
        if (state.failApps?.has(app)) return new HttpResponse(null, { status: 500 })
        const rates = achievements[app]?.rates
        return rates ? HttpResponse.json(rates) : HttpResponse.json({}, { status: 403 })
      },
    ),

    // The store, item by item for the apps asked; one it has no page for, as Steam answers it.
    http.get(`${STEAM_API}/IStoreBrowseService/GetItems/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const question = JSON.parse(address.searchParams.get('input_json') ?? '{}') as {
        ids?: { appid: number }[]
      }
      return HttpResponse.json({
        response: {
          store_items: (question.ids ?? []).map(
            ({ appid }) => store.get(appid) ?? { id: appid, success: 15 },
          ),
        },
      })
    }),

    http.post(STEAM_OPENID, async ({ request }) => {
      const body = new URLSearchParams(await request.text())
      const nonce = body.get('openid.response_nonce') ?? ''
      const valid =
        body.get('openid.mode') === 'check_authentication' &&
        body.get('openid.sig') === MOCK_STEAM_SIGNATURE &&
        nonce !== '' &&
        !state.checked.has(nonce)
      if (valid) state.checked.add(nonce)
      return HttpResponse.text(`ns:http://specs.openid.net/auth/2.0\nis_valid:${valid}\n`)
    }),

    // Anything else on Steam's hosts is a mistake in a test.
    http.all(`${STEAM_API}/*`, () =>
      HttpResponse.text('Not a question the double knows', { status: 404 }),
    ),
  ]
}
