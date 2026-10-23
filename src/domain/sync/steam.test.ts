import { describe, expect, it } from 'vitest'

import {
  claimedSteamId,
  isValidAnswer,
  kindsFromSteam,
  reportedFromSteam,
  STEAM_OPENID,
  steamSignInAddress,
  steamStoreItemsSchema,
  storeItemsQuestion,
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

describe('what Steam’s store says each app is', () => {
  // As the store answered on 23 Oct 2026, cut down to what is read.
  const answer = steamStoreItemsSchema.parse({
    response: {
      store_items: [
        { id: 3405340, success: 1, type: 0, name: 'Megabonk' },
        { id: 3520070, success: 1, type: 1, related_items: { parent_appid: 3405340 } },
        { id: 431960, success: 1, type: 6 },
        { id: 4046730, success: 1, type: 11 },
        { id: 10190, success: 1, type: 14, related_items: { parent_appid: 10180 } },
        { id: 212910, success: 1, type: 14 },
        { id: 2691310, success: 1, type: 4, related_items: { parent_appid: 1350650 } },
        { id: 9900001, success: 15, appid: 0 },
        { id: 9900002, success: 15, appid: 0 },
      ],
    },
  })
  const apps = [
    { storeId: '3405340', title: 'Megabonk' },
    { storeId: '3520070', title: 'Megabonk Demo' },
    { storeId: '431960', title: 'Wallpaper Engine' },
    { storeId: '4046730', title: 'Megabonk Soundtrack' },
    { storeId: '10190', title: 'Call of Duty: Modern Warfare 2 (2009) - Multiplayer' },
    { storeId: '212910', title: 'Call of Duty: Black Ops II - Zombies' },
    { storeId: '2691310', title: 'FreshWomen - Season 2' },
    { storeId: '9900001', title: 'The Killing Antidote Playtest' },
    { storeId: '9900002', title: 'Something Taken Down' },
    { storeId: '9900003', title: 'Not In The Answer' },
  ]
  const kinds = kindsFromSteam(answer, apps)

  it('tells games from demos, software and soundtracks', () => {
    expect(kinds.get('3405340')).toEqual({ kind: 'game' })
    expect(kinds.get('3520070')).toEqual({ kind: 'demo' })
    expect(kinds.get('431960')).toEqual({ kind: 'software' })
    expect(kinds.get('4046730')).toEqual({ kind: 'media' })
  })

  it('takes a mode listed apart as a part of the game it names, and one that names none as a game', () => {
    expect(kinds.get('10190')).toEqual({ kind: 'part', parentStoreId: '10180' })
    expect(kinds.get('212910')).toEqual({ kind: 'game' })
  })

  it('leaves a DLC with hours of its own to IGDB, as a game', () => {
    expect(kinds.get('2691310')).toEqual({ kind: 'game' })
  })

  it('knows a playtest by its name, since the store has no page for it', () => {
    expect(kinds.get('9900001')).toEqual({ kind: 'demo' })
    expect(kinds.get('9900002')).toEqual({ kind: 'unknown' })
  })

  it('says nothing of an app the answer left out, so it is asked again', () => {
    expect(kinds.has('9900003')).toBe(false)
  })

  it('asks for apps by number, in English, as sold in the US', () => {
    expect(JSON.parse(storeItemsQuestion(['220', '440']))).toEqual({
      ids: [{ appid: 220 }, { appid: 440 }],
      context: { language: 'english', country_code: 'US' },
      data_request: {},
    })
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
