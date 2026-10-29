import 'server-only'

import { z } from 'zod'

import {
  achievementProviders,
  achievementStates,
  progressProblems,
  setStates,
} from '@/domain/achievements/achievements'
import { rarities } from '@/domain/library/trophy-achievements'

/**
 * What a game's achievements are answered with (issue 72): each of its sets
 * at a provider, with the account's progress through it. Checked against
 * this schema before it is sent, as every answer of the API is.
 */

const moment = z.int().describe('Milliseconds since 1970')

const apiAchievement = z.object({
  id: z.string().describe('The provider’s own id for it: Steam’s API name'),
  name: z.string(),
  description: z.string().optional(),
  icon: z.url().optional().describe('Its artwork, on the provider’s image servers'),
  iconLocked: z.url().optional().describe('Its artwork while locked'),
  hidden: z.boolean().describe('The provider keeps its details hidden until it is unlocked'),
  inEnglish: z
    .literal(true)
    .optional()
    .describe('Its words are in English: the provider has none in the language asked'),
  state: z.enum(achievementStates),
  unlockedAt: moment.optional().describe('Only when the provider says when'),
  rate: z
    .number()
    .min(0)
    .max(100)
    .optional()
    .describe('The share of the provider’s own players who unlocked it, as a percentage'),
})

export const apiGameAchievements = z
  .object({
    sets: z.array(
      z.object({
        provider: z.enum(achievementProviders),
        setId: z.string().describe('The provider’s id for the game: a Steam app id'),
        title: z.string().describe('The game’s name there'),
        state: z.enum(setStates),
        readAt: moment.optional().describe('When the account’s progress was last read'),
        ratesAt: moment.optional().describe('When the unlock rates were last read'),
        snapshot: z
          .literal(true)
          .optional()
          .describe('Kept from a provider the account has since disconnected from'),
        problem: z
          .enum(progressProblems)
          .optional()
          .describe('Why the last read did not work: what is shown is as of readAt'),
        achievements: z.array(apiAchievement),
      }),
    ),
  })
  .meta({ id: 'GameAchievements' })

const statGame = z.object({ slug: z.string(), title: z.string() })
const day = z.string().describe('A day, YYYY-MM-DD, in UTC')
const share = z
  .number()
  .min(0)
  .max(100)
  .describe('The share of the provider’s own players who have it, as a percentage')
const named = { name: z.string(), inEnglish: z.literal(true).optional() }

const apiUnlock = z.object({
  key: z.string().describe('Its provider’s, its set’s and its own id'),
  ...named,
  icon: z.url().optional(),
  rate: share.optional(),
  at: moment.optional().describe('When it was unlocked, only when the provider says'),
  game: statGame,
})

const apiPerfect = statGame.extend({
  cover: z.string().optional(),
  colors: z.tuple([z.string(), z.string(), z.string()]).readonly().optional(),
  hash: z.string().optional(),
  adult: z.literal(true).optional(),
  total: z.int(),
  on: day.optional().describe('The day of the last unlock, when every moment is known'),
  took: z.number().optional().describe('From the first unlock to the last, in milliseconds'),
})

const apiAchievementStats = z.object({
  scope: z.int().optional().describe('The year the figures are of: the unlocks in it'),
  rarity: z.enum(rarities).optional(),
  games: z.int(),
  unlocked: z.int(),
  available: z.int().optional(),
  percent: z.int().optional(),
  perfect: z.int(),
  perfectShare: z.number().optional(),
  averageRate: z.number().optional(),
  score: z.int(),
  rarities: z.array(z.object({ rarity: z.enum(rarities), count: z.int() })),
  rarest: z.array(apiUnlock),
  latest: z.array(apiUnlock),
  perfects: z.array(apiPerfect),
  close: z.array(statGame.extend({ earned: z.int(), total: z.int() })),
  trend: z.array(z.object({ year: z.int(), month: z.int().optional(), count: z.int() })),
  milestones: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('unlock'), nth: z.int(), ...named, game: statGame, on: day }),
      z.object({ kind: z.literal('perfect'), game: statGame, on: day }),
      z.object({ kind: z.literal('ultra'), ...named, rate: share, game: statGame, on: day }),
    ]),
  ),
  records: z.object({
    bestDay: z.object({ on: day, count: z.int(), game: statGame }).optional(),
    streak: z.object({ days: z.int(), from: day, to: day }).optional(),
    quickest: apiPerfect.extend({ took: z.number() }).optional(),
    slowest: apiPerfect.extend({ took: z.number() }).optional(),
  }),
  genres: z.array(
    z.object({
      id: z.int(),
      name: z.string(),
      slug: z.string(),
      games: z.int(),
      unlocked: z.int(),
      available: z.int(),
      share: z.number(),
    }),
  ),
  insights: z.array(
    z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('unlocks'),
        year: z.int(),
        count: z.int(),
        than: z.object({ year: z.int(), count: z.int() }),
        best: z.boolean(),
      }),
      z.object({ kind: z.literal('close'), game: statGame, left: z.int() }),
      z.object({ kind: z.literal('rarest'), unlock: apiUnlock }),
    ]),
  ),
  readAt: moment.optional(),
})

/**
 * The trophy page's achievements (issue 68), worked out on the server so the
 * browser is sent the figures and never every unlock: of the games the
 * page's filter keeps, of all time or of one year, and again without adult
 * games when there are any.
 */
export const apiAchievementWall = z
  .object({
    stats: apiAchievementStats.optional(),
    hidden: apiAchievementStats.optional().describe('The figures without adult games'),
  })
  .meta({ id: 'AchievementWall' })
