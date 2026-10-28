import 'server-only'

import { z } from 'zod'

import { progressProblems } from '@/domain/achievements/achievements'
import { syncSources } from '@/domain/library/values'
import { decisions, storeKinds } from '@/domain/sync/items'
import { linkProblems, nintendoLinkOutcomes } from '@/domain/sync/link'

/**
 * What the account page's Platforms section is answered with (ADR 003):
 * an account's links to its sources, a sync's steps, and the games a source
 * listed. Each answer passes its schema before it is sent, as every other
 * answer of the API does. Only the signed-in account's own, and kept by no one.
 */

const moment = z.int().nullable().describe('Milliseconds since 1970')

const counts = z.object({
  'on-shelf': z.int().describe('On the shelf, fed by the source'),
  adding: z.int().describe('Matched, still to be put on the shelf'),
  'needs-you': z.int().describe('No match, or a question for the owner'),
  hidden: z.int().describe('Not a game, not mine, or taken off the shelf'),
  notSeen: z.int().describe('On the shelf, but no longer listed by the source'),
  unsorted: z.int().describe('On the shelf from this source, and not placed yet: status unsorted'),
})

const achievementCounts = z.object({
  games: z.int().describe('Games on the shelf from the source'),
  known: z.int().describe('Of those, games whose achievements are read, or that have none'),
  private: z.int().describe('Of those, games whose achievements the source keeps private'),
})

export const apiLink = z
  .object({
    source: z.enum(syncSources),
    externalId: z
      .string()
      .describe('The account’s id at the source: a SteamID64, a Nintendo Account id'),
    name: z.string().nullable().describe('The account’s name there'),
    daily: z.boolean().describe('Synced again once a day'),
    linkedAt: z.int(),
    readAt: moment.describe('When the source last answered with its list'),
    syncedAt: moment.describe('When a sync last left nothing to add'),
    problem: z.enum(linkProblems).nullable(),
    counts,
    achievements: achievementCounts
      .optional()
      .describe('How far its achievements are read, for a source Shelf reads them from'),
  })
  .meta({ id: 'PlatformLink' })

export const apiPlatforms = z
  .array(
    z.object({
      source: z.enum(syncSources),
      ready: z.boolean().describe('Built and switched on'),
      link: apiLink.nullable(),
    }),
  )
  .meta({ id: 'Platforms' })

export const apiAchievementStep = z
  .object({
    read: z.int().describe('Games whose achievements this step read'),
    remaining: z.int().describe('Games still to read: ask for another step while above 0'),
    counts: achievementCounts,
    problem: z
      .enum(progressProblems)
      .nullable()
      .describe('private: the source keeps them private; unreachable: it did not answer for some'),
  })
  .meta({ id: 'AchievementStep' })

export const apiSyncStep = z
  .object({
    link: apiLink,
    added: z.int().describe('Games this step put on the shelf'),
    remaining: z.int().describe('Work left: ask for another step while above 0'),
    version: z.int().describe('The library’s version after this step'),
  })
  .meta({ id: 'SyncStep' })

export const apiSourceItem = z
  .object({
    id: z.string(),
    title: z.string().describe('As the source names it'),
    storeId: z.string(),
    minutes: z.int(),
    lastPlayedAt: moment,
    lastSeenAt: z.int(),
    state: z.enum(['on-shelf', 'adding', 'needs-you', 'hidden']),
    decision: z.enum(decisions),
    kind: z
      .enum(storeKinds)
      .nullable()
      .describe(
        'What the store says it is, null until asked. A demo, software or media is left out by itself, as not a game; a part is matched by the game it belongs to',
      ),
    onShelf: z
      .object({ slug: z.string(), title: z.string() })
      .optional()
      .describe('The game on the shelf it feeds'),
    match: z
      .object({
        igdbId: z.int(),
        title: z.string(),
        year: z.int().nullable(),
        cover: z.string().nullable().describe('An address on IGDB’s image servers'),
      })
      .optional()
      .describe(
        'For a game a source saw played: the game Shelf takes it for, which waits for the owner to confirm it and say how they own it',
      ),
  })
  .meta({ id: 'SourceItem' })

export const apiSourceItems = z.array(apiSourceItem)

export const apiAnswered = z.object({ item: apiSourceItem, version: z.int() })

/** How pasting the link from Nintendo’s “Select this account” button went. */
export const apiNintendoLinked = z
  .object({ outcome: z.enum(nintendoLinkOutcomes) })
  .meta({ id: 'NintendoLinked' })
