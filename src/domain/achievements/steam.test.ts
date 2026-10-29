import { describe, expect, it } from 'vitest'

import {
  definedFromSteam,
  playerFromSteam,
  steamGameAchievementsSchema,
  steamImage,
  steamKey,
  steamTotalsSchema,
  totalsFromSteam,
} from './steam'

/** Steam's achievement answers, in the shapes the live API gave on 28 Oct 2026. */

describe('a game’s achievements from Steam', () => {
  it('reads each one with Steam’s share of its players, a hidden one described like the others', () => {
    const answer = steamGameAchievementsSchema.parse({
      response: {
        achievements: [
          {
            internal_name: 'ACH_LIFTOFF',
            localized_name: 'Liftoff',
            localized_desc: ' Leave the village. ',
            icon: 'a1b2.jpg',
            icon_gray: 'c3d4.jpg',
            hidden: false,
            player_percent_unlocked: '80.9',
            internal_key: 0,
            groupid: 0,
            archived: false,
            progress_type: 0,
          },
          {
            internal_name: 'ACH_EYE',
            localized_name: 'The Eye',
            localized_desc: 'Reach the eye.',
            hidden: true,
            player_percent_unlocked: 9,
          },
          // Listed twice: kept once.
          { internal_name: 'ACH_EYE', localized_name: 'The Eye', hidden: true },
          // No name: Steam's own id for it.
          { internal_name: 'ACH_QUIET', localized_name: '', hidden: false },
        ],
      },
    })
    expect(definedFromSteam('753640', answer)).toEqual({
      achievements: [
        {
          id: 'ACH_LIFTOFF',
          key: '0',
          name: 'Liftoff',
          description: 'Leave the village.',
          icon: 'https://shared.akamai.steamstatic.com/community_assets/images/apps/753640/a1b2.jpg',
          iconLocked:
            'https://shared.akamai.steamstatic.com/community_assets/images/apps/753640/c3d4.jpg',
          hidden: false,
          rate: 80.9,
        },
        { id: 'ACH_EYE', name: 'The Eye', description: 'Reach the eye.', hidden: true, rate: 9 },
        { id: 'ACH_QUIET', name: 'ACH_QUIET', hidden: false },
      ],
    })
  })

  it('is nothing for a game without any: Steam answers an empty response', () => {
    expect(definedFromSteam('70', steamGameAchievementsSchema.parse({ response: {} }))).toBe(
      undefined,
    )
    expect(definedFromSteam('70', steamGameAchievementsSchema.parse({}))).toBeUndefined()
  })

  it('keeps artwork only as an image file in the game’s own folder', () => {
    expect(steamImage('220', 'a.jpg')).toBe(
      'https://shared.akamai.steamstatic.com/community_assets/images/apps/220/a.jpg',
    )
    expect(steamImage('220', '../a.jpg')).toBeUndefined()
    expect(steamImage('220', 'https://example.com/a.jpg')).toBeUndefined()
    expect(steamImage('220', 'a.gif')).toBeUndefined()
    expect(steamImage('../220', 'a.jpg')).toBeUndefined()
    expect(steamImage('220', undefined)).toBeUndefined()
  })

  it('leaves out a share that is not one', () => {
    const shares = definedFromSteam(
      '220',
      steamGameAchievementsSchema.parse({
        response: {
          achievements: ['', 'lots', '120', '-1'].map((share, at) => ({
            internal_name: `A${at}`,
            player_percent_unlocked: share,
          })),
        },
      }),
    )!.achievements
    expect(shares.every((each) => each.rate === undefined)).toBe(true)
  })
})

describe('many games’ totals from Steam', () => {
  it('counts each game’s achievements and the account’s unlocked ones', () => {
    const totals = totalsFromSteam(
      steamTotalsSchema.parse({
        response: {
          games: [
            {
              appid: 646570,
              total_achievements: 46,
              achievements: [
                { statid: 1, bit: 14, name: 'You Are Nothing', player_percent_unlocked: '13.0' },
                { statid: 1, bit: 30, name: 'Speed Climber', player_percent_unlocked: '6.7' },
              ],
            },
            { appid: 332310, total_achievements: 71 },
            { appid: 570, total_achievements: 0 },
            // A game Steam does not know.
            { appid: 999999999 },
          ],
        },
      }),
    )
    expect(totals).toEqual(
      new Map([
        ['646570', { total: 46, unlocked: 2, keys: ['270', '286'] }],
        ['332310', { total: 71, unlocked: 0, keys: [] }],
        ['570', { total: 0, unlocked: 0, keys: [] }],
      ]),
    )
  })

  it('names an unlock by the key its definition has: the stat, shifted a byte, and the bit', () => {
    // A game's first two, as GetGameAchievements keys them.
    expect(steamKey(1, 0)).toBe('256')
    expect(steamKey(1, 6)).toBe('262')
    expect(steamKey(100, 30)).toBe('25630')
  })

  it('counts the unlocked ones without their keys when Steam leaves out a stat or a bit', () => {
    const totals = totalsFromSteam(
      steamTotalsSchema.parse({
        response: {
          games: [
            { appid: 646570, total_achievements: 46, achievements: [{ name: 'Speed Climber' }] },
          ],
        },
      }),
    )
    expect(totals?.get('646570')).toEqual({ total: 46, unlocked: 1 })
  })

  it('is nothing when Steam counts none, as for a profile whose game details are private', () => {
    expect(totalsFromSteam(steamTotalsSchema.parse({ response: {} }))).toBeUndefined()
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
