import { describe, expect, it } from 'vitest'

import {
  claimedSteamId,
  isValidAnswer,
  reportedFromSteam,
  STEAM_OPENID,
  steamSignInAddress,
} from '@/domain/sync/steam'

const RETURN_TO = 'https://shelf.test/api/v1/me/platforms/steam/return?state=abc&locale=en'
const ID = '76561197960287930'

const answer = (changes: Record<string, string> = {}) =>
  new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${ID}`,
    'openid.return_to': RETURN_TO,
    ...changes,
  })

describe('Steam’s games', () => {
  it('lists each game with its minutes and when it was last played', () => {
    expect(
      reportedFromSteam({
        response: {
          game_count: 2,
          games: [
            {
              appid: 220,
              name: 'Half-Life 2',
              playtime_forever: 600,
              rtime_last_played: 1_700_000_000,
            },
            { appid: 400, name: 'Portal', playtime_forever: 0, rtime_last_played: 0 },
          ],
        },
      }),
    ).toEqual([
      { storeId: '220', title: 'Half-Life 2', minutes: 600, lastPlayedAt: 1_700_000_000_000 },
      { storeId: '400', title: 'Portal', minutes: 0 },
    ])
  })

  it('tells an account that hides its games from one that has none', () => {
    expect(reportedFromSteam({ response: {} })).toBeUndefined()
    expect(reportedFromSteam({ response: { game_count: 0 } })).toEqual([])
  })

  it('leaves out a game Steam no longer names', () => {
    expect(
      reportedFromSteam({
        response: { game_count: 1, games: [{ appid: 1, playtime_forever: 5 }] },
      }),
    ).toEqual([])
  })
})

describe('signing in through Steam', () => {
  it('asks Steam to choose the account and come back here', () => {
    const address = new URL(steamSignInAddress(RETURN_TO, 'https://shelf.test'))
    expect(address.searchParams.get('openid.return_to')).toBe(RETURN_TO)
    expect(address.searchParams.get('openid.identity')).toBe(
      'http://specs.openid.net/auth/2.0/identifier_select',
    )
  })

  it('reads the account a positive answer claims', () => {
    expect(claimedSteamId(answer(), RETURN_TO)).toBe(ID)
  })

  it('claims nothing for an answer that is not Steam’s, not positive, or not for here', () => {
    expect(claimedSteamId(answer({ 'openid.mode': 'cancel' }), RETURN_TO)).toBeUndefined()
    expect(
      claimedSteamId(answer({ 'openid.op_endpoint': 'https://evil.test/openid' }), RETURN_TO),
    ).toBeUndefined()
    expect(
      claimedSteamId(answer({ 'openid.return_to': `${RETURN_TO}x` }), RETURN_TO),
    ).toBeUndefined()
    expect(
      claimedSteamId(
        answer({ 'openid.claimed_id': 'https://evil.test/openid/id/76561197960287930' }),
        RETURN_TO,
      ),
    ).toBeUndefined()
  })

  it('takes only Steam’s plain yes', () => {
    expect(isValidAnswer('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n')).toBe(true)
    expect(isValidAnswer('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n')).toBe(false)
    expect(isValidAnswer('is_valid:truex')).toBe(false)
  })
})
