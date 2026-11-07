import { useTranslations } from 'next-intl'

import { durationOf } from '@/domain/library/duration'

/**
 * A game's play time in words, the same everywhere it is shown (`durationOf`): "45 min",
 * "1 h 25 min", "312 h", or "Less than a minute" for a few seconds, never "0 h". `long` spells the
 * units out, for a screen reader. Each way of saying it is a message named after its unit, so this
 * stays a line or two on every page that draws one. Not a client module: a game's own page says
 * play time in the editor's skeleton, drawn on the server, and a client module's hook can't be
 * called there.
 */
export const useDuration = () => {
  const t = useTranslations('Duration')
  return (minutes: number, long = false): string => {
    const said = durationOf(minutes)
    return t((long ? `long.${said.unit}` : said.unit) as 'hours', said as { hours: number })
  }
}

/**
 * A play time drawn: short on screen ("1 h 25 min"), and in full words to a screen reader, which
 * would read "min" as it likes.
 */
export function Duration({ minutes }: { minutes: number }) {
  const say = useDuration()
  return (
    <>
      <span aria-hidden="true" className="whitespace-nowrap">
        {say(minutes)}
      </span>
      <span className="sr-only">{say(minutes, true)}</span>
    </>
  )
}
