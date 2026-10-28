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
 * achievements and the account's progress through them, counted for many
 * games at once as Steam counts them, and Steam's sign-in check for answers
 * this double signed. Any other key, account or
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
  /**
   * A game's achievements or the account's progress through them as Steam
   * gives them now, by app, in place of the fixture's: its totals count them.
   */
  achievements?: Record<string, Partial<AchievementAnswers>>
}

/** One game's achievement answers in `fixtures/steam/achievements.json`, as Steam sends them. */
export type AchievementAnswers = {
  /** `GetGameAchievements`, by Steam's name for the language. */
  definitions: Record<
    string,
    { response: { achievements: ({ internal_name: string } & Record<string, unknown>)[] } }
  >
  player?: {
    playerstats: { achievements: { apiname: string; achieved: number }[] } & Record<string, unknown>
  }
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

  const fixture = read('achievements.json') as Record<string, AchievementAnswers>
  /** A game's answers now: the fixture's, or what a test says Steam gives instead. */
  const answersFor = (app: string): AchievementAnswers | undefined => {
    const given = fixture[app]
    const instead = state.achievements?.[app]
    return given && instead ? { ...given, ...instead } : given
  }
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
    http.get(`${STEAM_API}/IPlayerService/GetGameAchievements/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const app = address.searchParams.get('appid') ?? ''
      if (state.failApps?.has(app)) return new HttpResponse(null, { status: 500 })
      const game = answersFor(app)
      if (!game) return HttpResponse.json({ response: {} })
      return HttpResponse.json(
        game.definitions[address.searchParams.get('language') ?? 'english'] ??
          game.definitions.english,
      )
    }),

    // How many achievements each game asked has, with the account's unlocked ones, rarest
    // first, as many as asked for. Every game but the three has none; a profile whose game
    // details are not public is answered with nothing.
    http.get(`${STEAM_API}/IPlayerService/GetTopAchievementsForGames/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      if (address.searchParams.get('steamid') !== MOCK_STEAM.steamId || state.achievementsPrivate) {
        return HttpResponse.json({ response: {} })
      }
      const most = Number(address.searchParams.get('max_achievements') ?? 0)
      const apps = [...address.searchParams]
        .filter(([name]) => /^appids\[\d+\]$/.test(name))
        .map(([, id]) => id)
      return HttpResponse.json({
        response: {
          games: apps.map((app) => {
            const game = answersFor(app)
            if (!game) return { appid: Number(app), total_achievements: 0 }
            const listed = game.definitions.english!.response.achievements
            const unlocked = new Set(
              game.player?.playerstats.achievements
                .filter((each) => each.achieved === 1)
                .map((each) => each.apiname),
            )
            const top = listed
              .filter((each) => unlocked.has(each.internal_name))
              .sort(
                (a, b) =>
                  Number(a.player_percent_unlocked ?? 0) - Number(b.player_percent_unlocked ?? 0),
              )
              .slice(0, most)
              .map(({ internal_name: _, localized_name, localized_desc, ...rest }) => ({
                name: localized_name,
                desc: localized_desc,
                ...rest,
              }))
            return {
              appid: Number(app),
              total_achievements: listed.length,
              ...(top.length > 0 ? { achievements: top } : {}),
            }
          }),
        },
      })
    }),

    http.get(`${STEAM_API}/ISteamUserStats/GetPlayerAchievements/v1/`, ({ request }) => {
      const { refused, address } = keyed(request)
      if (refused) return refused
      const app = address.searchParams.get('appid') ?? ''
      if (state.failApps?.has(app)) return new HttpResponse(null, { status: 500 })
      const game = answersFor(app)
      // Steam says a game has no stats before it says whose profile is private.
      if (!game?.player) return HttpResponse.json(noStats, { status: 400 })
      if (address.searchParams.get('steamid') !== MOCK_STEAM.steamId || state.achievementsPrivate) {
        return HttpResponse.json(notPublic, { status: 403 })
      }
      return HttpResponse.json(game.player)
    }),

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
