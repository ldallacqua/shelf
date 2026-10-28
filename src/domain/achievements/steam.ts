import { z } from 'zod'

import type {
  AchievementLanguage,
  DefinedSet,
  Definition,
  ProgressAnswer,
  Unlock,
} from '@/domain/achievements/achievements'

/**
 * What Steam sends about achievements (issue 72), for the three questions
 * the sync asks its Web API: a game's achievements (`ISteamUserStats/
 * GetSchemaForGame`), an account's progress through them
 * (`GetPlayerAchievements`), and how many of Steam's players unlocked each
 * (`GetGlobalAchievementPercentagesForApp`). Every answer passes these
 * schemas first. Checked against the live API on 28 Oct 2026: a hidden
 * achievement has no description, a game with none answers an empty
 * `game`, and the rates are text.
 */

/** Steam's own name for each of the site's languages, as `l` takes it. */
export const STEAM_LANGUAGE: Record<AchievementLanguage, string> = {
  en: 'english',
  'pt-BR': 'brazilian',
}

const text = z
  .string()
  .transform((value) => value.trim())
  .optional()

export const steamSchemaAnswerSchema = z.object({
  game: z
    .object({
      gameName: text,
      availableGameStats: z
        .object({
          achievements: z
            .array(
              z.object({
                name: z.string().trim().min(1),
                displayName: text,
                hidden: z.number().int().optional(),
                description: text,
                icon: z.string().optional(),
                icongray: z.string().optional(),
              }),
            )
            .optional(),
        })
        .optional(),
    })
    .default({}),
})

export type SteamSchemaAnswer = z.infer<typeof steamSchemaAnswerSchema>

/**
 * Steam's achievement artwork, by its own address. Steam has answered with
 * three hosts for the same files; the page's rules allow one, so each is
 * moved to it. Anything else is not kept.
 */
const STEAM_IMAGE =
  /^https:\/\/(?:steamcdn-a\.akamaihd\.net|cdn\.akamai\.steamstatic\.com|cdn\.cloudflare\.steamstatic\.com)\/steamcommunity\/public\/images\/apps\/(\d{1,10}\/[\w.-]{1,120}\.(?:jpg|png))$/

export const STEAM_IMAGE_HOST = 'https://cdn.akamai.steamstatic.com'

export const steamImage = (address: string | undefined): string | undefined => {
  const path = address ? STEAM_IMAGE.exec(address.trim())?.[1] : undefined
  return path ? `${STEAM_IMAGE_HOST}/steamcommunity/public/images/apps/${path}` : undefined
}

/** A game's achievements as Steam defines them, or nothing when it has none. */
export const definedFromSteam = (answer: SteamSchemaAnswer): DefinedSet | undefined => {
  const listed = answer.game.availableGameStats?.achievements ?? []
  if (listed.length === 0) return undefined
  const seen = new Set<string>()
  const achievements: Definition[] = []
  for (const each of listed) {
    if (seen.has(each.name)) continue
    seen.add(each.name)
    const definition: Definition = {
      id: each.name,
      // A name Steam left empty is its id: Steam's own word for it, not one made up.
      name: each.displayName || each.name,
      hidden: each.hidden === 1,
    }
    if (each.description) definition.description = each.description
    const icon = steamImage(each.icon)
    const locked = steamImage(each.icongray)
    if (icon) definition.icon = icon
    if (locked) definition.iconLocked = locked
    achievements.push(definition)
  }
  return { ...(answer.game.gameName ? { title: answer.game.gameName } : {}), achievements }
}

export const steamPlayerAnswerSchema = z.object({
  playerstats: z.object({
    success: z.boolean().optional(),
    error: z.string().optional(),
    achievements: z
      .array(
        z.object({
          apiname: z.string().trim().min(1),
          achieved: z.number().int(),
          /** Seconds since 1970; 0 when Steam does not know. */
          unlocktime: z.number().int().nonnegative().optional(),
          description: text,
        }),
      )
      .optional(),
  }),
})

export type SteamPlayerAnswer = z.infer<typeof steamPlayerAnswerSchema>

/**
 * Steam's answer about an account's progress, by its status and words:
 * private when the account's game details are not public, none when the
 * game keeps no stats. Undefined for anything else.
 */
export const playerFromSteam = (status: number, body: unknown): ProgressAnswer | undefined => {
  const parsed = steamPlayerAnswerSchema.safeParse(body)
  if (!parsed.success) return undefined
  const stats = parsed.data.playerstats
  if (status === 403 && /not public/i.test(stats.error ?? '')) return { kind: 'private' }
  if (status === 400 && /no stats/i.test(stats.error ?? '')) return { kind: 'none' }
  if (status !== 200 || stats.success !== true) return undefined
  const unlocks: Unlock[] = []
  const descriptions = new Map<string, string>()
  for (const each of stats.achievements ?? []) {
    if (each.description) descriptions.set(each.apiname, each.description)
    if (each.achieved !== 1) continue
    // A moment of 0 is Steam not knowing when, not the first of January 1970.
    unlocks.push(
      each.unlocktime ? { id: each.apiname, at: each.unlocktime * 1000 } : { id: each.apiname },
    )
  }
  return { kind: 'read', unlocks, descriptions }
}

export const steamRatesAnswerSchema = z.object({
  achievementpercentages: z
    .object({
      achievements: z
        .array(
          z.object({
            name: z.string().trim().min(1),
            percent: z.union([z.number(), z.string()]),
          }),
        )
        .default([]),
    })
    .optional(),
})

export type SteamRatesAnswer = z.infer<typeof steamRatesAnswerSchema>

/** Each achievement's share of Steam's players, 0 to 100. A figure that is not one is left out. */
export const ratesFromSteam = (answer: SteamRatesAnswer): Map<string, number> => {
  const rates = new Map<string, number>()
  for (const { name, percent } of answer.achievementpercentages?.achievements ?? []) {
    const value =
      typeof percent === 'number' ? percent : percent.trim() ? Number(percent.trim()) : NaN
    if (Number.isFinite(value) && value >= 0 && value <= 100) rates.set(name, value)
  }
  return rates
}
