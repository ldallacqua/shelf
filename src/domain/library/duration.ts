/**
 * How a play time is said (issue 148), on its own and importing nothing: the library's list and
 * a game's page draw it, and neither should pay for the rest of `hours.ts`.
 */

/**
 * From this many minutes on, a time is said in whole hours. Past a hundred hours a game's minutes
 * say nothing anyone reads, and HowLongToBeat, Steam and the consoles drop them sooner still.
 */
export const WHOLE_HOURS_FROM = 100 * 60

/** A play time as it is said: what `features/library/duration.ts` puts into words. */
export type Duration =
  | { unit: 'none' }
  /** Something was counted, less than a minute of it: never "0 h". */
  | { unit: 'under' }
  | { unit: 'minutes'; minutes: number }
  | { unit: 'hoursMinutes'; hours: number; minutes: number }
  | { unit: 'hours'; hours: number }

/**
 * How a play time in minutes is said, the same everywhere a game's own hours are shown: minutes
 * under an hour, hours and minutes under `WHOLE_HOURS_FROM`, whole hours past it. Always rounded
 * down, so it never says more was played than was.
 */
export const durationOf = (minutes: number): Duration => {
  if (!(minutes > 0)) return { unit: 'none' }
  const whole = Math.floor(minutes)
  if (whole < 1) return { unit: 'under' }
  if (whole < 60) return { unit: 'minutes', minutes: whole }
  const hours = Math.floor(whole / 60)
  const rest = whole % 60
  if (whole >= WHOLE_HOURS_FROM || rest === 0) return { unit: 'hours', hours }
  return { unit: 'hoursMinutes', hours, minutes: rest }
}
