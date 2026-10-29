import { z } from 'zod'

import type {
  AchievementLanguage,
  DefinedSet,
  Definition,
  ProgressAnswer,
  ProgressTotal,
  Unlock,
} from '@/domain/achievements/achievements'

/**
 * What Steam sends about achievements (issue 72), for the three questions
 * the sync asks its Web API:
 * - a game's achievements in one language, with each one's share of Steam's
 *   players (`IPlayerService/GetGameAchievements`);
 * - how many achievements each of up to a hundred games has, and how many the
 *   account unlocked of each (`IPlayerService/GetTopAchievementsForGames`);
 * - the account's unlocks in one game, with their moments
 *   (`ISteamUserStats/GetPlayerAchievements`).
 * Every answer passes these schemas first. Checked against the live API on
 * 28 Oct 2026: a game with none answers an empty `response`, a hidden
 * achievement is described like the others, the artwork is a file name in
 * the game's folder, the shares are text, and the totals of a profile whose
 * game details are not public are an empty `response`.
 */

/** Steam's own name for each of the site's languages, as its Web API takes it. */
export const STEAM_LANGUAGE: Record<AchievementLanguage, string> = {
  en: 'english',
  'pt-BR': 'brazilian',
}

const text = z
  .string()
  .transform((value) => value.trim())
  .optional()

/** A share of Steam's players, 0 to 100, as text or a number. Anything else is not one. */
const shareOf = (value: number | string | undefined): number | undefined => {
  const share =
    typeof value === 'number' ? value : value?.trim() ? Number(value.trim()) : Number.NaN
  return Number.isFinite(share) && share >= 0 && share <= 100 ? share : undefined
}

export const steamGameAchievementsSchema = z.object({
  response: z
    .object({
      achievements: z
        .array(
          z.object({
            internal_name: z.string().trim().min(1),
            localized_name: text,
            localized_desc: text,
            icon: z.string().optional(),
            icon_gray: z.string().optional(),
            hidden: z.boolean().optional(),
            player_percent_unlocked: z.union([z.number(), z.string()]).optional(),
            internal_key: z.number().int().nonnegative().optional(),
          }),
        )
        .optional(),
    })
    .default({}),
})

export type SteamGameAchievements = z.infer<typeof steamGameAchievementsSchema>

/**
 * Steam's image servers for achievements' artwork. Checked on 29 Oct 2026:
 * the older `cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/`
 * answers 404 for a game out this year, where this one has every game's.
 */
export const STEAM_IMAGE_HOST = 'https://shared.akamai.steamstatic.com'

/**
 * An achievement's artwork: Steam names a file in the game's folder on its
 * image servers. Anything that is not a plain image file name is not kept.
 */
export const steamImage = (appId: string, file: string | undefined): string | undefined => {
  const name = file?.trim()
  if (!name || !/^\d{1,10}$/.test(appId) || !/^[\w-][\w.-]{0,119}\.(?:jpg|png)$/.test(name)) {
    return undefined
  }
  return `${STEAM_IMAGE_HOST}/community_assets/images/apps/${appId}/${name}`
}

/** A game's achievements as Steam defines them, or nothing when it has none. */
export const definedFromSteam = (
  appId: string,
  answer: SteamGameAchievements,
): DefinedSet | undefined => {
  const listed = answer.response.achievements ?? []
  if (listed.length === 0) return undefined
  const seen = new Set<string>()
  const achievements: Definition[] = []
  for (const each of listed) {
    if (seen.has(each.internal_name)) continue
    seen.add(each.internal_name)
    const definition: Definition = {
      id: each.internal_name,
      // A name Steam left empty is its id: Steam's own word for it, not one made up.
      name: each.localized_name || each.internal_name,
      hidden: each.hidden === true,
    }
    if (each.localized_desc) definition.description = each.localized_desc
    const icon = steamImage(appId, each.icon)
    const locked = steamImage(appId, each.icon_gray)
    if (icon) definition.icon = icon
    if (locked) definition.iconLocked = locked
    const rate = shareOf(each.player_percent_unlocked)
    if (rate !== undefined) definition.rate = rate
    if (each.internal_key !== undefined) definition.key = String(each.internal_key)
    achievements.push(definition)
  }
  return { achievements }
}

export const steamTotalsSchema = z.object({
  response: z
    .object({
      games: z
        .array(
          z.object({
            appid: z.number().int(),
            total_achievements: z.number().int().nonnegative().optional(),
            /** The account's unlocked ones, as many as were asked for, each by its stat and bit. */
            achievements: z
              .array(
                z.object({
                  statid: z.number().int().nonnegative().optional(),
                  bit: z.number().int().nonnegative().optional(),
                }),
              )
              .optional(),
          }),
        )
        .optional(),
    })
    .default({}),
})

export type SteamTotals = z.infer<typeof steamTotalsSchema>

/**
 * An achievement's `internal_key` in a game's definitions, from the stat and
 * bit a count lists it by: `(statid << 8) | bit`. Checked live on 28 Oct
 * 2026, on 3,727 unlocks of 39 games, each one's name agreeing.
 */
export const steamKey = (statid: number, bit: number) => String(statid * 256 + bit)

/**
 * How many achievements each game has, and how many the account unlocked,
 * by app id, with the unlocked ones' keys where Steam gives each its stat
 * and bit. A game Steam does not know is left out. Undefined when Steam
 * counted none of them: it says nothing of a profile whose game details are
 * not public.
 */
export const totalsFromSteam = (answer: SteamTotals): Map<string, ProgressTotal> | undefined => {
  const listed = answer.response.games
  if (!listed) return undefined
  const totals = new Map<string, ProgressTotal>()
  for (const game of listed) {
    if (game.total_achievements === undefined) continue
    const unlocked = game.achievements ?? []
    const total: ProgressTotal = { total: game.total_achievements, unlocked: unlocked.length }
    if (unlocked.every((each) => each.statid !== undefined && each.bit !== undefined)) {
      total.keys = unlocked.map((each) => steamKey(each.statid!, each.bit!))
    }
    totals.set(String(game.appid), total)
  }
  return totals
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
