import { progressOf, type AchievementGame } from '@/domain/achievements/progress'
import type { Library, LibraryGame } from '@/domain/library/library'
import { filterLibrary } from '@/domain/library/trophies'
import type { StatGame } from '@/domain/library/trophy-stats'
import { dayOf, type Day } from '@/domain/library/values'

/**
 * The trophy page's achievements (issue 68's third phase): how many are
 * unlocked and how rare they are, the games perfected, the records and
 * milestones among the unlocks, and the vault of the rarest and the latest.
 * Worked out from what the provider last said, over the games the page's
 * filter keeps, of all time or of one year: an unlock is of the year it came
 * in, and one whose moment the provider does not give is of all time only.
 */

/** An unlocked achievement, as the trophy page counts it. */
export type Unlocked = {
  /** Its provider's, its set's and its own id: one of a kind in a library. */
  key: string
  name: string
  /** Its name is in English: the provider has none in the visitor's language. */
  inEnglish?: true
  icon?: string
  /** The share of the provider's players who have it, 0 to 100: Steam's, not Shelf's. */
  rate?: number
  /** When, when the provider says. */
  at?: number
}

/** A game's achievements as the trophy page counts them: only its unlocks are kept whole. */
export type GameUnlocks = {
  slug: string
  /** Achievements in its sets whose progress is known. */
  total: number
  /** Every set that has achievements is known and complete, and one has them. */
  perfect: boolean
  unlocked: Unlocked[]
  /** When its progress was last read. */
  readAt?: number
}

/** A game's unlocks, or nothing when none of its sets with achievements is known. */
export const unlocksOf = ({ slug, sets }: AchievementGame): GameUnlocks | undefined => {
  let total = 0
  let known = false
  let perfect = true
  let readAt: number | undefined
  const unlocked: Unlocked[] = []
  for (const set of sets) {
    const progress = progressOf(set)
    if (!progress) {
      // A set not known, or with none: it cannot make the game perfect, nor stop it.
      if (set.state !== 'none') perfect = false
      continue
    }
    known = true
    total += progress.total
    if (progress.total > 0 && !progress.complete) perfect = false
    if (set.readAt !== undefined) readAt = Math.max(readAt ?? set.readAt, set.readAt)
    for (const achievement of set.achievements) {
      if (achievement.state !== 'unlocked') continue
      unlocked.push({
        key: `${set.provider}:${set.setId}/${achievement.id}`,
        name: achievement.name,
        ...(achievement.inEnglish ? { inEnglish: true as const } : {}),
        ...(achievement.icon ? { icon: achievement.icon } : {}),
        ...(achievement.rate === undefined ? {} : { rate: achievement.rate }),
        ...(achievement.unlockedAt === undefined ? {} : { at: achievement.unlockedAt }),
      })
    }
  }
  if (!known || total === 0) return undefined
  return { slug, total, perfect, unlocked, ...(readAt === undefined ? {} : { readAt }) }
}

/**
 * How rare an unlock is, by the share of the provider's players who have it.
 * Each tier is under its bound and from the one before; Steam's own library
 * calls an unlock under a tenth rare, and so does a game's page.
 */
export const rarities = ['ultra', 'very', 'rare', 'uncommon', 'common', 'most'] as const
export type Rarity = (typeof rarities)[number]

export const RARITY_BELOW: Record<Rarity, number> = {
  ultra: 1,
  very: 5,
  rare: 10,
  uncommon: 25,
  common: 50,
  most: Infinity,
}

export const isRarity = (value: unknown): value is Rarity =>
  typeof value === 'string' && (rarities as readonly string[]).includes(value)

export const rarityOf = (rate: number): Rarity =>
  rarities.find((rarity) => rate < RARITY_BELOW[rarity])!

/** What an unlock scores: 100 over the share who have it, at most 100. A tenth scores 10. */
export const pointsOf = (rate: number) => Math.round(100 / Math.max(1, rate))

/** How many unlocks the vault shows in each order. */
export const VAULT_SHOWN = 12
/** How many perfect games it shows, the latest first. */
export const PERFECTS_SHOWN = 12
/** How many games close to perfect, and how close: this many left at most, and this share done. */
export const CLOSE_SHOWN = 5
export const CLOSE_LEFT = 5
export const CLOSE_SHARE = 0.75
/** A perfect game's time is a record only from this many achievements: three in an hour says little. */
export const TIMED_FROM = 10
/** Genres are ranked by the share unlocked once this many of their games have achievements. */
export const GENRE_FROM = 3
export const GENRES_SHOWN = 8
/** The unlocks worth marking, by how many came before. */
export const UNLOCK_MILESTONES = [1, 100, 500, 1000, 2500, 5000, 10000] as const
/** A year's unlocks are compared with another's only from this many. */
const COMPARED_FROM = 20

/** An unlock in the vault, with the game it is of. */
export type VaultItem = Unlocked & { game: StatGame }

/** A game with every achievement unlocked. */
export type PerfectGame = StatGame &
  Pick<LibraryGame, 'cover' | 'colors' | 'hash' | 'adult'> & {
    total: number
    /** The day of the last unlock, when the provider gave every moment. */
    on?: Day
    /** From the first unlock to the last, in milliseconds, when every moment is known. */
    took?: number
  }

/** A game a few achievements short of perfect. */
export type CloseGame = StatGame & { earned: number; total: number }

export type AchievementMilestone = { game: StatGame; on: Day } & (
  | { kind: 'unlock'; nth: number; name: string; inEnglish?: true }
  | { kind: 'perfect' }
  | { kind: 'ultra'; name: string; inEnglish?: true; rate: number }
)

/** How one genre's games with achievements stand. */
export type AchievementGenre = {
  id: number
  name: string
  slug: string
  games: number
  unlocked: number
  available: number
  /** Unlocked of available, 0 to 1. */
  share: number
}

/** One thing worth saying about the achievements, as data: the page words it. */
export type AchievementInsight =
  /** More unlocked this year than in all of last year, or than in any year before. */
  | {
      kind: 'unlocks'
      year: number
      count: number
      than: { year: number; count: number }
      best: boolean
    }
  /** A game a few achievements from perfect. */
  | { kind: 'close'; game: StatGame; left: number }
  /** The rarest unlock, when few have it. */
  | { kind: 'rarest'; unlock: VaultItem }

export type AchievementStats = {
  /** The year the figures are of, when they are of one: the unlocks in it. */
  scope?: number
  /** The rarity the vault keeps to, when one is chosen. */
  rarity?: Rarity
  /** Games with achievements whose progress is known, or of a year, with an unlock in it. */
  games: number
  /** Unlocked, of all time, or in the year. */
  unlocked: number
  /** In the known sets, unlocked or not. All time only. */
  available?: number
  /** Whole percent of those unlocked, rounded down so nearly all is never 100. All time only. */
  percent?: number
  /** Games perfected: of a year, those whose last unlock came in it. */
  perfect: number
  /** Of the games with an unlock, the share perfected, 0 to 1. All time only. */
  perfectShare?: number
  /** The average unlock's share of the provider's players, of those whose share is known. */
  averageRate?: number
  /** Each unlock scores `pointsOf` its share. */
  score: number
  /** The unlocks of each rarity, the rarest first. */
  rarities: { rarity: Rarity; count: number }[]
  /** The rarest unlocks, and the latest, of the rarity chosen. */
  rarest: VaultItem[]
  latest: VaultItem[]
  /** The games perfected, the latest first, those without a day last. */
  perfects: PerfectGame[]
  /** The games closest to perfect, the fewest left first. All time only. */
  close: CloseGame[]
  /** Unlocks each year, from the first to this one; of a year, each of its months. */
  trend: { year: number; month?: number; count: number }[]
  /** The unlocks and games worth marking, the earliest first. */
  milestones: AchievementMilestone[]
  records: {
    /** The day with the most unlocks, and the game most of them were in. */
    bestDay?: { on: Day; count: number; game: StatGame }
    /** The most days in a row with an unlock. */
    streak?: { days: number; from: Day; to: Day }
    /** The perfect games of `TIMED_FROM` achievements or more, quickest and slowest from first unlock to last. */
    quickest?: PerfectGame & { took: number }
    slowest?: PerfectGame & { took: number }
  }
  /** Genres by the share of their achievements unlocked. All time only. */
  genres: AchievementGenre[]
  /** All time only. */
  insights: AchievementInsight[]
  /** The latest read behind the figures. */
  readAt?: number
}

/** The achievements of a page, and of the same page on a device that hides adult games (spec 3.13). */
export type AchievementWall = {
  stats?: AchievementStats
  /** When the games the page is of have adult ones: the figures without them. */
  hidden?: AchievementStats
}

export type AchievementOptions = {
  /** Only the unlocks in this year. */
  scope?: number
  /** Only the games this filter matches, in the library's filter language. */
  q?: string
  /** The rarity the vault keeps to. */
  rarity?: Rarity
}

const gameOf = ({ slug, title }: LibraryGame): StatGame => ({ slug, title })
const yearOf = (at: number) => new Date(at).getUTCFullYear()
const monthOf = (at: number) => new Date(at).getUTCMonth() + 1
const nextDay = (day: Day): Day => dayOf(Date.parse(`${day}T00:00:00Z`) + 86_400_000)

/** Earliest first; the same moment in the order they were listed. */
const byMoment = <T extends { at?: number }>(a: T, b: T) => a.at! - b.at!

/** The unlocks of a set of games as one list, each with its game. */
const allOf = (
  games: readonly { unlocks: GameUnlocks; game: LibraryGame }[],
  keep: (unlock: Unlocked) => boolean,
): VaultItem[] =>
  games.flatMap(({ unlocks, game }) =>
    unlocks.unlocked.filter(keep).map((unlock) => ({ ...unlock, game: gameOf(game) })),
  )

/** A perfect game's day and time, as its unlocks' moments say. */
const perfectOf = (unlocks: GameUnlocks, game: LibraryGame): PerfectGame => {
  const moments = unlocks.unlocked.map((unlock) => unlock.at)
  const timed = moments.every((at) => at !== undefined) && moments.length > 0
  const first = timed ? Math.min(...(moments as number[])) : undefined
  const last = timed ? Math.max(...(moments as number[])) : undefined
  return {
    ...gameOf(game),
    cover: game.cover,
    colors: game.colors,
    hash: game.hash,
    ...(game.adult ? { adult: true } : {}),
    total: unlocks.total,
    ...(last === undefined ? {} : { on: dayOf(last), took: last - first! }),
  }
}

const genresOf = (
  games: readonly { unlocks: GameUnlocks; game: LibraryGame }[],
  library: Library,
): AchievementGenre[] => {
  const named = new Map(library.names.genre.map((genre) => [genre.id, genre]))
  const tally = new Map<number, AchievementGenre>()
  for (const { unlocks, game } of games) {
    for (const id of new Set(game.genres)) {
      const genre = named.get(id)
      if (!genre) continue
      const found = tally.get(id) ?? {
        id,
        name: genre.name,
        slug: genre.slug,
        games: 0,
        unlocked: 0,
        available: 0,
        share: 0,
      }
      found.games += 1
      found.unlocked += unlocks.unlocked.length
      found.available += unlocks.total
      tally.set(id, found)
    }
  }
  return [...tally.values()]
    .filter((genre) => genre.games >= GENRE_FROM)
    .map((genre) => ({ ...genre, share: genre.unlocked / genre.available }))
    .sort((a, b) => b.share - a.share || b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, GENRES_SHOWN)
}

/** The most days in a row with an unlock, of these days, earliest first and each once. */
const streakOf = (days: readonly Day[]): AchievementStats['records']['streak'] => {
  let best: { days: number; from: Day; to: Day } | undefined
  let run: { days: number; from: Day; to: Day } | undefined
  for (const day of days) {
    run =
      run && nextDay(run.to) === day
        ? { ...run, days: run.days + 1, to: day }
        : { days: 1, from: day, to: day }
    if (!best || run.days > best.days) best = run
  }
  return best && best.days > 1 ? best : undefined
}

const milestonesOf = (
  timed: readonly VaultItem[],
  perfects: readonly PerfectGame[],
): AchievementMilestone[] => {
  const marked: AchievementMilestone[] = []
  for (const nth of UNLOCK_MILESTONES) {
    const unlock = timed[nth - 1]
    if (!unlock) break
    marked.push({
      kind: 'unlock',
      nth,
      name: unlock.name,
      ...(unlock.inEnglish ? { inEnglish: true as const } : {}),
      game: unlock.game,
      on: dayOf(unlock.at!),
    })
  }
  const firstPerfect = perfects
    .filter((game) => game.on !== undefined)
    .sort((a, b) => (a.on! < b.on! ? -1 : a.on! > b.on! ? 1 : 0))[0]
  if (firstPerfect) {
    marked.push({
      kind: 'perfect',
      game: { slug: firstPerfect.slug, title: firstPerfect.title },
      on: firstPerfect.on!,
    })
  }
  const firstUltra = timed.find(
    (unlock) => unlock.rate !== undefined && unlock.rate < RARITY_BELOW.ultra,
  )
  if (firstUltra) {
    marked.push({
      kind: 'ultra',
      name: firstUltra.name,
      ...(firstUltra.inEnglish ? { inEnglish: true as const } : {}),
      rate: firstUltra.rate!,
      game: firstUltra.game,
      on: dayOf(firstUltra.at!),
    })
  }
  return marked.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
}

const insightsOf = (
  trend: AchievementStats['trend'],
  year: number,
  close: readonly CloseGame[],
  rarest: VaultItem | undefined,
): AchievementInsight[] => {
  const said: AchievementInsight[] = []
  const now = trend.find((each) => each.year === year)?.count ?? 0
  const before = trend.filter((each) => each.year < year)
  const best = before.reduce<{ year: number; count: number } | undefined>(
    (top, each) => (!top || each.count > top.count ? { year: each.year, count: each.count } : top),
    undefined,
  )
  const last = before.find((each) => each.year === year - 1)
  if (best && best.count >= COMPARED_FROM && now > best.count) {
    said.push({ kind: 'unlocks', year, count: now, than: best, best: true })
  } else if (last && last.count >= COMPARED_FROM && now > last.count) {
    said.push({
      kind: 'unlocks',
      year,
      count: now,
      than: { year: last.year, count: last.count },
      best: false,
    })
  }
  const closest = close[0]
  if (closest)
    said.push({
      kind: 'close',
      game: { slug: closest.slug, title: closest.title },
      left: closest.total - closest.earned,
    })
  if (rarest && rarest.rate !== undefined && rarest.rate < RARITY_BELOW.very) {
    said.push({ kind: 'rarest', unlock: rarest })
  }
  return said
}

/**
 * The achievement figures of these games, of all time or of one year.
 * Nothing when none of them has achievements whose progress is known, or,
 * of a year, when nothing was unlocked in it.
 */
export const achievementStatsOf = (
  library: Library,
  unlocks: readonly GameUnlocks[],
  year: number,
  { scope, rarity }: Pick<AchievementOptions, 'scope' | 'rarity'> = {},
): AchievementStats | undefined => {
  const bySlug = new Map(library.games.map((game) => [game.slug, game]))
  const games = unlocks.flatMap((each) => {
    const game = bySlug.get(each.slug)
    return game ? [{ unlocks: each, game }] : []
  })
  if (games.length === 0) return undefined
  const inScope = (unlock: Unlocked) =>
    scope === undefined || (unlock.at !== undefined && yearOf(unlock.at) === scope)

  const unlocked = allOf(games, inScope)
  if (scope !== undefined && unlocked.length === 0) return undefined
  const timed = allOf(games, (unlock) => unlock.at !== undefined).sort(byMoment)
  const rated = unlocked.filter((unlock) => unlock.rate !== undefined)

  const everyPerfect = games
    .filter(({ unlocks: each }) => each.perfect)
    .map(({ unlocks: each, game }) => perfectOf(each, game))
  const perfects = everyPerfect
    .filter(
      (game) =>
        scope === undefined || (game.on !== undefined && Number(game.on.slice(0, 4)) === scope),
    )
    .sort((a, b) =>
      a.on === b.on
        ? a.title.localeCompare(b.title)
        : a.on === undefined
          ? 1
          : b.on === undefined
            ? -1
            : a.on < b.on
              ? 1
              : -1,
    )
  const started = games.filter(({ unlocks: each }) => each.unlocked.length > 0).length
  const available = games.reduce((sum, { unlocks: each }) => sum + each.total, 0)
  const total = games.reduce((sum, { unlocks: each }) => sum + each.unlocked.length, 0)

  const kept = (unlock: VaultItem) =>
    rarity === undefined || (unlock.rate !== undefined && rarityOf(unlock.rate) === rarity)
  const rarest = rated
    .filter(kept)
    .sort((a, b) => a.rate! - b.rate! || (b.at ?? 0) - (a.at ?? 0))
    .slice(0, VAULT_SHOWN)
  const latest = unlocked
    .filter((unlock) => unlock.at !== undefined && kept(unlock))
    .sort((a, b) => b.at! - a.at!)
    .slice(0, VAULT_SHOWN)

  const close: CloseGame[] =
    scope !== undefined
      ? []
      : games
          .filter(({ unlocks: each }) => {
            const left = each.total - each.unlocked.length
            return (
              !each.perfect &&
              left > 0 &&
              left <= CLOSE_LEFT &&
              each.unlocked.length / each.total >= CLOSE_SHARE
            )
          })
          .map(({ unlocks: each, game }) => ({
            ...gameOf(game),
            earned: each.unlocked.length,
            total: each.total,
          }))
          .sort(
            (a, b) =>
              a.total - a.earned - (b.total - b.earned) ||
              b.earned / b.total - a.earned / a.total ||
              a.title.localeCompare(b.title),
          )
          .slice(0, CLOSE_SHOWN)

  // Unlocks a year, from the first to this one; of a year, its twelve months.
  const counted = unlocked.filter((unlock) => unlock.at !== undefined)
  let trend: AchievementStats['trend']
  if (scope === undefined) {
    const first = timed[0] ? yearOf(timed[0].at!) : undefined
    trend =
      first === undefined
        ? []
        : Array.from({ length: Math.max(0, year - first) + 1 }, (_, at) => ({
            year: first + at,
            count: 0,
          }))
    for (const unlock of counted) {
      const found = trend.find((each) => each.year === yearOf(unlock.at!))
      if (found) found.count += 1
    }
  } else {
    trend = Array.from({ length: 12 }, (_, at) => ({ year: scope, month: at + 1, count: 0 }))
    for (const unlock of counted) trend[monthOf(unlock.at!) - 1]!.count += 1
  }

  // The records, of the unlocks in the scope.
  const days = new Map<Day, VaultItem[]>()
  for (const unlock of counted) {
    const day = dayOf(unlock.at!)
    days.set(day, [...(days.get(day) ?? []), unlock])
  }
  let bestDay: AchievementStats['records']['bestDay']
  for (const [on, list] of [...days].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (list.length < 2 || (bestDay && list.length <= bestDay.count)) continue
    const perGame = new Map<string, { game: StatGame; count: number }>()
    for (const unlock of list) {
      const found = perGame.get(unlock.game.slug) ?? { game: unlock.game, count: 0 }
      found.count += 1
      perGame.set(unlock.game.slug, found)
    }
    const most = [...perGame.values()].sort((a, b) => b.count - a.count)[0]!
    bestDay = { on, count: list.length, game: most.game }
  }
  const timedPerfects = perfects
    .filter(
      (game): game is PerfectGame & { took: number } =>
        game.took !== undefined && game.total >= TIMED_FROM,
    )
    .sort((a, b) => a.took - b.took)
  const quickest = timedPerfects[0]
  const slowest = timedPerfects.length > 1 ? timedPerfects.at(-1) : undefined

  const milestones = milestonesOf(timed, everyPerfect).filter(
    (milestone) => scope === undefined || Number(milestone.on.slice(0, 4)) === scope,
  )
  const readAt = games.reduce<number | undefined>(
    (latestRead, { unlocks: each }) =>
      each.readAt === undefined ? latestRead : Math.max(latestRead ?? each.readAt, each.readAt),
    undefined,
  )
  const everyRarest = rated.slice().sort((a, b) => a.rate! - b.rate!)[0]

  return {
    ...(scope === undefined ? {} : { scope }),
    ...(rarity ? { rarity } : {}),
    games:
      scope === undefined ? games.length : new Set(unlocked.map((unlock) => unlock.game.slug)).size,
    unlocked: unlocked.length,
    ...(scope === undefined ? { available, percent: Math.floor((total * 100) / available) } : {}),
    perfect: perfects.length,
    ...(scope === undefined && started > 0 ? { perfectShare: everyPerfect.length / started } : {}),
    ...(rated.length > 0
      ? { averageRate: rated.reduce((sum, unlock) => sum + unlock.rate!, 0) / rated.length }
      : {}),
    score: rated.reduce((sum, unlock) => sum + pointsOf(unlock.rate!), 0),
    rarities: rarities.map((each) => ({
      rarity: each,
      count: rated.filter((unlock) => rarityOf(unlock.rate!) === each).length,
    })),
    rarest,
    latest,
    perfects: perfects.slice(0, PERFECTS_SHOWN),
    close,
    trend,
    milestones,
    records: {
      ...(bestDay ? { bestDay } : {}),
      ...(() => {
        const streak = streakOf([...days.keys()].sort())
        return streak ? { streak } : {}
      })(),
      ...(quickest ? { quickest } : {}),
      ...(slowest ? { slowest } : {}),
    },
    genres: scope === undefined ? genresOf(games, library) : [],
    insights: scope === undefined ? insightsOf(trend, year, close, everyRarest) : [],
    ...(readAt === undefined ? {} : { readAt }),
  }
}

/**
 * The trophy page's achievements (issue 68): of the games its filter keeps,
 * of all time or of one year, and again without adult games when there are
 * any, as the wall's own figures are. `year` is this year.
 */
export const achievementWall = (
  library: Library,
  unlocks: readonly GameUnlocks[],
  year: number,
  options: AchievementOptions = {},
): AchievementWall => {
  library = filterLibrary(library, options.q)
  const wall: AchievementWall = {}
  const stats = achievementStatsOf(library, unlocks, year, options)
  if (stats) wall.stats = stats
  if (library.games.some((game) => game.adult)) {
    const hidden = achievementStatsOf(
      { ...library, games: library.games.filter((game) => !game.adult) },
      unlocks,
      year,
      options,
    )
    if (hidden) wall.hidden = hidden
  }
  return wall
}
