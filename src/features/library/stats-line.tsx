import { useFormatter, useLocale, useTranslations } from 'next-intl'

import type { LibraryStats } from '@/domain/library/stats'

import { SettlingNumber } from './settling-number'

function Stat({ value, unit }: { value: number; unit: string }) {
  const format = useFormatter()
  const locale = useLocale()
  const text = format.number(value)
  // The settling figure is decoration. The true one is what is read out.
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="sr-only">{`${text} ${unit}`}</span>
      <SettlingNumber value={value} text={text} locale={locale} />
      <span aria-hidden="true">{unit}</span>
    </span>
  )
}

/**
 * Games, finished, hours: the line above the shelves (spec 3.9).
 *
 * Drawn on the server and handed to the library as it is. Its words and
 * figures never change on the device, so the device does not work them out
 * again: wording three plurals and a number format was 44 ms of a slow
 * phone's first second.
 */
export function StatsLine({ stats }: { stats: LibraryStats }) {
  const t = useTranslations('Library')

  return (
    <div
      role="group"
      aria-label={t('stats.label')}
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1 readout text-[0.6875rem] text-muted"
    >
      <Stat value={stats.games} unit={t('stats.games', { count: stats.games })} />
      <Stat value={stats.finished} unit={t('stats.finished', { count: stats.finished })} />
      <Stat value={stats.hours} unit={t('stats.hours', { count: stats.hours })} />
    </div>
  )
}
