'use client'

import { useTranslations } from 'next-intl'

import { durationOf } from '@/domain/library/duration'

/**
 * A game's play time in words, the same everywhere it is shown (`durationOf`): "45 min",
 * "1 h 25 min", "312 h", or "Less than a minute" for a few seconds, never "0 h". `long` spells the
 * units out, for a screen reader.
 */
export const useDuration = () => {
  const short = useTranslations('Duration')
  const spelled = useTranslations('Duration.long')
  return (minutes: number, { long = false }: { long?: boolean } = {}): string => {
    // The two hold the same keys, the short ones beside the long ones' namespace.
    const t = (long ? spelled : short) as typeof spelled
    const said = durationOf(minutes)
    switch (said.unit) {
      case 'none':
        return t('minutes', { minutes: 0 })
      case 'under':
        return t('under')
      case 'minutes':
        return t('minutes', { minutes: said.minutes })
      case 'hoursMinutes':
        return t('hoursMinutes', { hours: said.hours, minutes: said.minutes })
      case 'hours':
        return t('hours', { hours: said.hours })
    }
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
      <span className="sr-only">{say(minutes, { long: true })}</span>
    </>
  )
}
