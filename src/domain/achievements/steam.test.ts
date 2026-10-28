import { describe, expect, it } from 'vitest'

import {
  definedFromSteam,
  playerFromSteam,
  ratesFromSteam,
  steamImage,
  steamRatesAnswerSchema,
  steamSchemaAnswerSchema,
} from './steam'

/** Steam's achievement answers, in the shapes the live API gave on 28 Oct 2026. */

describe('a game’s achievements from Steam', () => {
  it('reads each one, a hidden one without the description Steam leaves out', () => {
    const answer = steamSchemaAnswerSchema.parse({
      game: {
        gameName: 'Outer Wilds',
        gameVersion: '12',
        availableGameStats: {
          achievements: [
            {
              name: 'ACH_LIFTOFF',
              defaultvalue: 0,
              displayName: 'Liftoff',
              hidden: 0,
              description: ' Leave the village. ',
              icon: 'https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/753640/a1b2.jpg',
              icongray:
                'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/753640/c3d4.jpg',
            },
            { name: 'ACH_EYE', defaultvalue: 0, displayName: 'The Eye', hidden: 1 },
            // Listed twice: kept once.
            { name: 'ACH_EYE', defaultvalue: 0, displayName: 'The Eye', hidden: 1 },
          ],
          stats: [],
        },
      },
    })
    expect(definedFromSteam(answer)).toEqual({
      title: 'Outer Wilds',
      achievements: [
        {
          id: 'ACH_LIFTOFF',
          name: 'Liftoff',
          description: 'Leave the village.',
          icon: 'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/753640/a1b2.jpg',
          iconLocked:
            'https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/753640/c3d4.jpg',
          hidden: false,
        },
        { id: 'ACH_EYE', name: 'The Eye', hidden: true },
      ],
    })
  })

  it('is nothing for a game without any: Steam answers an empty game', () => {
    expect(definedFromSteam(steamSchemaAnswerSchema.parse({ game: {} }))).toBeUndefined()
    expect(definedFromSteam(steamSchemaAnswerSchema.parse({}))).toBeUndefined()
  })

  it('keeps artwork only from Steam’s own image servers', () => {
    expect(steamImage('https://example.com/steamcommunity/public/images/apps/1/a.jpg')).toBe(
      undefined,
    )
    expect(
      steamImage('https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/1/../a.jpg'),
    ).toBe(undefined)
    expect(steamImage(undefined)).toBeUndefined()
  })
})

describe('an account’s progress from Steam', () => {
  it('reads unlocks, a moment of 0 as not known rather than 1970', () => {
    expect(
      playerFromSteam(200, {
        playerstats: {
          steamID: '76561190000000001',
          gameName: 'Portal',
          achievements: [
            { apiname: 'A', achieved: 1, unlocktime: 1760000000, description: 'One' },
            { apiname: 'B', achieved: 1, unlocktime: 0 },
            { apiname: 'C', achieved: 0, unlocktime: 0, description: 'Hidden, described' },
          ],
          success: true,
        },
      }),
    ).toEqual({
      kind: 'read',
      unlocks: [{ id: 'A', at: 1760000000 * 1000 }, { id: 'B' }],
      descriptions: new Map([
        ['A', 'One'],
        ['C', 'Hidden, described'],
      ]),
    })
  })

  it('tells a private profile and a game without stats from a failure', () => {
    expect(
      playerFromSteam(403, { playerstats: { error: 'Profile is not public', success: false } }),
    ).toEqual({ kind: 'private' })
    expect(
      playerFromSteam(400, {
        playerstats: { error: 'Requested app has no stats', success: false },
      }),
    ).toEqual({ kind: 'none' })
    expect(playerFromSteam(500, { playerstats: { success: false } })).toBeUndefined()
    expect(playerFromSteam(200, { playerstats: { success: false } })).toBeUndefined()
    expect(playerFromSteam(200, '<html>')).toBeUndefined()
  })
})

describe('unlock rates from Steam', () => {
  it('reads them as text or numbers, and leaves out what is not a share', () => {
    const rates = ratesFromSteam(
      steamRatesAnswerSchema.parse({
        achievementpercentages: {
          achievements: [
            { name: 'A', percent: '80.9' },
            { name: 'B', percent: 9 },
            { name: 'C', percent: '' },
            { name: 'D', percent: 'lots' },
            { name: 'E', percent: '120' },
          ],
        },
      }),
    )
    expect(rates).toEqual(
      new Map([
        ['A', 80.9],
        ['B', 9],
      ]),
    )
  })

  it('is none for a game without achievements: Steam answers nothing', () => {
    expect(ratesFromSteam(steamRatesAnswerSchema.parse({}))).toEqual(new Map())
  })
})
