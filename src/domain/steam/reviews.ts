import { z } from 'zod'

/**
 * What Steam's players say of a game (spec 7.11), as its store sums it up:
 * how many reviewed it, how many of them recommend it, and the score its
 * words come from. Not a rating: a share of people who said yes.
 */

export type SteamReviews = {
  /** The app these are for: a game can have several, and this is the most reviewed. */
  app: string
  count: number
  /** Of those who reviewed it, how many recommend it, from 0 to 100. */
  percent: number
  /** Steam's own step, from 1 (Overwhelmingly Negative) to 9. Below ten reviews it has none: 0. */
  score: number
}

export const steamReviewsQuestion = (appIds: readonly string[]): string =>
  JSON.stringify({
    ids: appIds.map((appId) => ({ appid: Number(appId) })),
    context: { language: 'english', country_code: 'US' },
    data_request: { include_reviews: true },
  })

const answerSchema = z.object({
  response: z.object({
    store_items: z
      .array(
        z.object({
          id: z.number(),
          reviews: z
            .object({
              summary_filtered: z
                .object({
                  review_count: z.number().int().nonnegative(),
                  percent_positive: z.number().min(0).max(100),
                  review_score: z.number().int().min(0).max(9),
                })
                .optional(),
            })
            .optional(),
        }),
      )
      .default([]),
  }),
})

/**
 * Each app asked about that has a review. One with none yet, or none the store
 * will show here, is left out. Undefined for an answer in a new shape.
 */
export const steamReviewsIn = (answer: unknown): Map<string, SteamReviews> | undefined => {
  const parsed = answerSchema.safeParse(answer)
  if (!parsed.success) return undefined
  const found = new Map<string, SteamReviews>()
  for (const item of parsed.data.response.store_items) {
    const summary = item.reviews?.summary_filtered
    if (!summary || summary.review_count === 0) continue
    const app = String(item.id)
    found.set(app, {
      app,
      count: summary.review_count,
      percent: summary.percent_positive,
      score: summary.review_score,
    })
  }
  return found
}

/** A game's apps, the most reviewed first. */
export const mostReviewed = (
  apps: readonly string[],
  reviews: ReadonlyMap<string, SteamReviews>,
): SteamReviews | undefined =>
  apps
    .flatMap((app) => reviews.get(app) ?? [])
    .reduce<SteamReviews | undefined>(
      (best, each) => (!best || each.count > best.count ? each : best),
      undefined,
    )

/** How far the count may drift before it is worth a new version of every shelf holding the game. */
const COUNT_DRIFT = 0.05

/**
 * Whether what Steam says now is worth storing. A popular game gains reviews
 * every hour; what the page shows only moves with its share, its words, or a
 * count that has grown by a twentieth.
 */
export const reviewsMoved = (
  stored: SteamReviews | null | undefined,
  now: SteamReviews | undefined,
): boolean => {
  if (!stored || !now) return Boolean(stored) !== Boolean(now)
  return (
    stored.app !== now.app ||
    stored.percent !== now.percent ||
    stored.score !== now.score ||
    Math.abs(now.count - stored.count) > stored.count * COUNT_DRIFT
  )
}
