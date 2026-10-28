import 'server-only'

import { z } from 'zod'

import {
  achievementProviders,
  achievementStates,
  progressProblems,
  setStates,
} from '@/domain/achievements/achievements'

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
