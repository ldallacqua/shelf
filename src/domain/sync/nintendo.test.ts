import { describe, expect, it } from 'vitest'

import {
  accountOfIdToken,
  codeFromLink,
  NINTENDO_REDIRECT,
  nintendoPlayHistorySchema,
  nintendoSignInAddress,
  reportedFromNintendo,
} from '@/domain/sync/nintendo'
import { copyPlatform, platformsFor } from '@/domain/sync/sources'

const SWITCH = 130
const SWITCH_2 = 508
const PC = 6

/** A made-up JWT, shaped as Nintendo's codes and tokens are. */
const jwt = (payload: Record<string, unknown>) =>
  ['eyJhbGciOiJSUzI1NiJ9', btoa(JSON.stringify(payload)).replace(/=+$/, ''), 'c2lnbmF0dXJl'].join(
    '.',
  )

describe('signing in on Nintendo’s page', () => {
  it('asks as the Nintendo Store app does, for this round trip', () => {
    const address = new URL(nintendoSignInAddress('the-state', 'the-challenge'))
    expect(address.origin + address.pathname).toBe(
      'https://accounts.nintendo.com/connect/1.0.0/authorize',
    )
    expect(Object.fromEntries(address.searchParams)).toMatchObject({
      state: 'the-state',
      client_id: '5c38e31cd085304b',
      redirect_uri: 'npf5c38e31cd085304b://auth',
      response_type: 'session_token_code',
      session_token_code_challenge: 'the-challenge',
      session_token_code_challenge_method: 'S256',
    })
  })
})

describe('the link copied from “Select this account”', () => {
  const code = jwt({ typ: 'session_token_code' })
  const link = `${NINTENDO_REDIRECT}#session_token_code=${code}&state=the-state&session_state=abc`

  it('gives its code, pasted with the spaces a copy brings', () => {
    expect(codeFromLink(`  ${link}\n`, 'the-state')).toEqual({ ok: true, code })
  })

  it('is not the page’s own address, nor a link cut short', () => {
    const page = `https://accounts.nintendo.com/connect/1.0.0/authorize?state=the-state`
    expect(codeFromLink(page, 'the-state')).toEqual({ ok: false, reason: 'not-the-link' })
    expect(codeFromLink(`${NINTENDO_REDIRECT}#state=the-state`, 'the-state')).toEqual({
      ok: false,
      reason: 'not-the-link',
    })
    expect(codeFromLink(link.slice(0, 60), 'the-state')).toEqual({
      ok: false,
      reason: 'not-the-link',
    })
  })

  it('is refused from another sign-in, older or someone else’s', () => {
    expect(codeFromLink(link, 'another-state')).toEqual({ ok: false, reason: 'another-sign-in' })
  })
})

describe('the account an id token names', () => {
  it('is its subject', () => {
    expect(accountOfIdToken(jwt({ sub: '1234abcd5678ef90' }))).toBe('1234abcd5678ef90')
  })

  it('is no one for something that is not a token', () => {
    expect(accountOfIdToken('not a token')).toBeUndefined()
    expect(accountOfIdToken(jwt({ aud: 'x' }))).toBeUndefined()
  })
})

describe('Nintendo’s play history', () => {
  const answer = nintendoPlayHistorySchema.parse({
    playHistories: [
      {
        titleId: '0100f2c0115b6000',
        titleName: 'The Legend of Zelda: Tears of the Kingdom',
        platform: 'HAC',
        totalPlayedMinutes: 6000,
        totalPlayedDays: 80,
        firstPlayedAt: '2023-05-12T10:00:00Z',
        lastPlayedAt: '2025-03-01T20:00:00Z',
        imageUrl: 'https://example.test/cover.jpg',
      },
      {
        titleId: '0100F2C0115B6000',
        titleName: 'The Legend of Zelda: Tears of the Kingdom',
        platform: 'BEE',
        totalPlayedMinutes: 600,
        firstPlayedAt: '2025-06-05T10:00:00Z',
        lastPlayedAt: '2025-07-01T20:00:00Z',
      },
      {
        titleId: '0100A3D008C5C000',
        titleName: 'Mario Kart World ',
        platform: 'BEE',
        totalPlayedMinutes: 900,
        firstPlayedAt: '2025-06-05T09:00:00Z',
        lastPlayedAt: '2025-06-30T20:00:00Z',
      },
      { titleId: '0004000000030800', titleName: 'Old Game', platform: 'XYZ' },
    ],
    recentPlayHistories: [],
  })

  it('is each game once, its minutes summed and its last play the latest', () => {
    expect(reportedFromNintendo(answer)).toEqual([
      {
        storeId: '0100F2C0115B6000',
        title: 'The Legend of Zelda: Tears of the Kingdom',
        platformId: SWITCH,
        minutes: 6600,
        lastPlayedAt: Date.parse('2025-07-01T20:00:00Z'),
      },
      {
        storeId: '0100A3D008C5C000',
        title: 'Mario Kart World',
        platformId: SWITCH_2,
        minutes: 900,
        lastPlayedAt: Date.parse('2025-06-30T20:00:00Z'),
      },
      { storeId: '0004000000030800', title: 'Old Game', minutes: 0 },
    ])
  })

  it('keeps the console a game was first played on, in whatever order Nintendo lists them', () => {
    const [zelda] = reportedFromNintendo({
      playHistories: [...answer.playHistories.slice(0, 2)].reverse(),
    })
    expect(zelda).toMatchObject({ platformId: SWITCH, minutes: 6600 })
  })

  it('is empty for an account that has played nothing', () => {
    expect(reportedFromNintendo(nintendoPlayHistorySchema.parse({}))).toEqual([])
  })
})

describe('where a synced game’s copy goes', () => {
  it('is searched for on the consoles a Switch 2 plays, and on Nintendo’s when none is named', () => {
    expect(platformsFor('nintendo', SWITCH_2)).toEqual([SWITCH, SWITCH_2])
    expect(platformsFor('nintendo', SWITCH)).toEqual([SWITCH])
    expect(platformsFor('nintendo', null)).toContain(SWITCH)
  })

  it('is a Switch copy for a Switch game played on a Switch 2, a Switch 2 one for its own games', () => {
    expect(copyPlatform('nintendo', SWITCH_2, [SWITCH, SWITCH_2])).toBe(SWITCH)
    expect(copyPlatform('nintendo', SWITCH_2, [SWITCH_2])).toBe(SWITCH_2)
    expect(copyPlatform('nintendo', SWITCH, [SWITCH, 41])).toBe(SWITCH)
  })

  it('is the first of the source’s platforms the game is on, when the source names none', () => {
    expect(copyPlatform('nintendo', null, [41, SWITCH])).toBe(SWITCH)
  })

  it('is PC for Steam, whatever the record says', () => {
    expect(copyPlatform('steam', null, [PC, 14])).toBe(PC)
    expect(copyPlatform('steam', null, [14])).toBe(PC)
  })
})
