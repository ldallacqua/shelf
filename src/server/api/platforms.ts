import 'server-only'

import { z } from 'zod'

import { syncSources } from '@/domain/library/values'
import { decisions } from '@/domain/sync/items'
import { linkProblems } from '@/domain/sync/link'

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
})

export const apiLink = z
  .object({
    source: z.enum(syncSources),
    externalId: z.string().describe('The account’s id at the source: a SteamID64'),
    name: z.string().nullable().describe('The account’s name there'),
    daily: z.boolean().describe('Synced again once a day'),
    linkedAt: z.int(),
    readAt: moment.describe('When the source last answered with its list'),
    syncedAt: moment.describe('When a sync last left nothing to add'),
    problem: z.enum(linkProblems).nullable(),
    counts,
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
    onShelf: z
      .object({ slug: z.string(), title: z.string() })
      .optional()
      .describe('The game on the shelf it feeds'),
  })
  .meta({ id: 'SourceItem' })

export const apiSourceItems = z.array(apiSourceItem)

export const apiAnswered = z.object({ item: apiSourceItem, version: z.int() })
