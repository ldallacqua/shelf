import type { Candidate, Habits, PlatformLabel } from '@/domain/library/adding'

/**
 * Many games at once (spec 4.2): a pasted list, one title a line, matched
 * against IGDB and reviewed before anything is added.
 */

/** Lines one paste may have. */
export const MAX_LINES = 200
/** Lines sent to be matched at once: the progress bar moves in steps this size. */
export const MATCH_STEP = 10
/** Games sent to be added at once. */
export const ADD_STEP = 10
/** The most one request may carry, through the API. */
export const MAX_MATCH_LINES = 20
export const MAX_ADDITIONS = 50
/** Longer than any game's title, with a year and a platform. */
export const MAX_LINE_LENGTH = 200
/** What a line offers: its match, and the alternatives in its menu. */
export const MAX_ALTERNATIVES = 6

export type PastedLine = {
  /** The line as pasted, spaces tidied. */
  text: string
  title: string
  /** A year in brackets: `(2017)`. */
  year?: number
  /** What was in square brackets, as written: `[Switch]`. */
  platform?: string
}

/** A list's bullet or number, which is not part of the title: `- `, `• `, `12. `, `3) `. */
const BULLET = /^(?:[-*•–]\s+|\d{1,3}[.)]\s+)/u
const YEAR = /\((\d{4})\)/
const PLATFORM = /\[([^\]]{1,40})\]/

/** One pasted line: the title, and a year and a platform when it gives them. Nothing for a blank line. */
export const parseLine = (raw: string): PastedLine | undefined => {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_LENGTH)
  let rest = text.replace(BULLET, '')
  const line: Omit<PastedLine, 'text' | 'title'> = {}
  const year = YEAR.exec(rest)
  if (year) {
    const value = Number(year[1])
    if (value >= 1950 && value < 2100) {
      line.year = value
      rest = rest.replace(year[0], ' ')
    }
  }
  const platform = PLATFORM.exec(rest)
  if (platform?.[1]?.trim()) {
    line.platform = platform[1].trim()
    rest = rest.replace(platform[0], ' ')
  }
  const title = rest.replace(/\s+/g, ' ').trim()
  return title ? { text, title, ...line } : undefined
}

/** Every line that names a game, in order. */
export const parseList = (text: string): PastedLine[] =>
  text.split(/\r?\n/).flatMap((raw) => parseLine(raw) ?? [])

/**
 * A title as compared: case, accents, apostrophes and full stops do not
 * count, and other punctuation is a space. "Assassins Creed II" is
 * "Assassin's Creed II"; "LA Noire" is "L.A. Noire".
 */
export const titleKeyOf = (title: string): string =>
  title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['‘’ʼ`.]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

const squash = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** What people write for a platform, beyond its name, short name and key. */
const ALIASES: Record<string, string> = {
  ns: 'switch',
  nsw: 'switch',
  ns2: 'switch-2',
  xsx: 'xbox-series',
  xss: 'xbox-series',
  seriesx: 'xbox-series',
  seriess: 'xbox-series',
  xboxseriesx: 'xbox-series',
  xboxseriess: 'xbox-series',
  xboxseries: 'xbox-series',
  xb1: 'xbox-one',
  xbone: 'xbox-one',
  x360: 'xbox-360',
  psx: 'ps1',
  windows: 'pc',
  win: 'pc',
  steam: 'pc',
  gog: 'pc',
  epic: 'pc',
  macos: 'mac',
  osx: 'mac',
  genesis: 'genesis',
  megadrive: 'genesis',
  gc: 'gamecube',
  ngc: 'gamecube',
  gcn: 'gamecube',
}

/** The platform a line's square brackets name, if they name one. */
export const resolvePlatform = (
  written: string,
  platforms: readonly PlatformLabel[],
): PlatformLabel | undefined => {
  const wanted = squash(written)
  if (!wanted) return undefined
  const alias = ALIASES[wanted]
  return (
    (alias ? platforms.find((platform) => platform.key === alias) : undefined) ??
    platforms.find((platform) =>
      [platform.key, platform.name, platform.short].some((name) => squash(name) === wanted),
    )
  )
}

/** How sure a line's match is: the title as written, close to it, or nothing found. */
export type Confidence = 'exact' | 'close' | 'none'

/**
 * A line's candidates, best first: the title as written, then the year it
 * gives, then the platform it gives, then IGDB's own order.
 */
export const rankForLine = (
  line: PastedLine,
  candidates: readonly Candidate[],
  platformId?: number,
): Candidate[] => {
  const key = titleKeyOf(line.title)
  const score = (candidate: Candidate) =>
    (titleKeyOf(candidate.title) === key ? 4 : 0) +
    (line.year !== undefined && candidate.year === line.year ? 2 : 0) +
    (platformId !== undefined && [...candidate.platforms, ...candidate.alsoOn].includes(platformId)
      ? 1
      : 0)
  return candidates
    .map((candidate, index) => ({ candidate, index, score: score(candidate) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ candidate }) => candidate)
}

export const confidenceOf = (line: PastedLine, best: Candidate | undefined): Confidence => {
  if (!best) return 'none'
  const sameTitle = titleKeyOf(best.title) === titleKeyOf(line.title)
  return sameTitle && (line.year === undefined || best.year === line.year) ? 'exact' : 'close'
}

/** One line, matched: the platform its brackets name, how sure the match is, and what else it could be. */
export type LineMatch = PastedLine & {
  platformId?: number
  confidence: Confidence
  /** The match first, then the alternatives. Empty when nothing was found. */
  candidates: Candidate[]
}

export type MatchAnswer = {
  lines: LineMatch[]
  /** Names for every platform the candidates and the lines mention. */
  platforms: PlatformLabel[]
  habits: Habits
}

/**
 * The platform a row starts on: the one its line names, if the game is on
 * it; else the one I own most on, of the game's; else the game's first.
 */
export const startingPlatform = (
  candidate: Candidate,
  habits: Habits,
  named?: number,
): number | undefined => {
  const on = [...candidate.platforms, ...candidate.alsoOn]
  if (named !== undefined && on.includes(named)) return named
  return habits.order.find((id) => on.includes(id)) ?? on[0]
}
