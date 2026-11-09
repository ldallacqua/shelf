/**
 * The order of the daily sync's work (ADR 003, decision 6), whatever the
 * sources are. Its time is short and shared by every link, so the work that
 * matters most goes first for all of them: each link's first step, which
 * reads the source and brings every game's hours and last play up to date;
 * then the steps that put the rest of its games on the shelf; then
 * achievements (issue 72), the most there is to read. Done a link at a time
 * instead, one link's achievements could spend the whole run, and the link
 * after it would wait a day for its hours.
 */

/** One link, as the daily sync works on it. */
export type DailyLink = {
  /** One step of its library: `first` reads the source. Throws when the source fails. */
  step: (first: boolean) => Promise<{ remaining: number; problem: boolean }>
  /** One step of its achievements, for a source that has them; `stop` when none can be read. */
  achievements?: () => Promise<{ remaining: number; stop: boolean }>
  /** A step that threw: the link is left out of the rest of the run. */
  failed: (error: unknown) => void
}

/** Runs the day's work while there is time, and returns how many links were read. */
export const runDaily = async (
  links: readonly DailyLink[],
  inTime: () => boolean,
): Promise<number> => {
  const left = new Map<DailyLink, { remaining: number; problem: boolean }>()
  const attempt = async <T>(link: DailyLink, work: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await work()
    } catch (error) {
      left.delete(link)
      link.failed(error)
      return undefined
    }
  }

  for (const link of links) {
    if (!inTime()) break
    const step = await attempt(link, () => link.step(true))
    if (step) left.set(link, step)
  }
  const read = left.size

  for (const link of left.keys()) {
    let step = left.get(link)
    while (step && step.remaining > 0 && inTime()) {
      step = await attempt(link, () => link.step(false))
      if (step) left.set(link, step)
    }
  }

  for (const [link, step] of left) {
    if (!link.achievements || step.remaining > 0 || step.problem) continue
    const next = link.achievements
    let achievements = inTime() ? await attempt(link, next) : undefined
    while (achievements && achievements.remaining > 0 && !achievements.stop && inTime()) {
      achievements = await attempt(link, next)
    }
  }
  return read
}
