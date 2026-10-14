import { useFormatter, useLocale, useTranslations } from 'next-intl'

import type { LibraryStats } from '@/domain/library/stats'

import { SettlingNumber } from './settling-number'

function Stat({ value, unit, settle }: { value: number; unit: string; settle: boolean }) {
  const format = useFormatter()
  const locale = useLocale()
  const text = format.number(value)
  // The settling figure is decoration. The true one is what is read out.
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="sr-only">{`${text} ${unit}`}</span>
      {settle ? (
        <SettlingNumber value={value} text={text} locale={locale} />
      ) : (
        <span aria-hidden="true" className="title text-base text-text tabular-nums sm:text-lg">
          {text}
        </span>
      )}
      <span aria-hidden="true">{unit}</span>
    </span>
  )
}

/**
 * Games, finished, hours: the line above the shelves (spec 3.9).
 *
 * Drawn on the server for the address's filter and handed to the library as
 * it is, so the device does not work it out again on arrival: wording three
 * plurals and a number format was 44 ms of a slow phone's first second. Once
 * a filter changes on the device, the library draws its own, without the
 * count-up.
 */
export function StatsLine({
  stats,
  settle = true,
}: {
  stats: LibraryStats
  /** Count up into place when first seen. Not again when a filter changes the figures. */
  settle?: boolean
}) {
  const t = useTranslations('Library')

  return (
    <div
      role="group"
      aria-label={t('stats.label')}
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1 readout text-[0.6875rem] text-muted"
    >
      <Stat value={stats.games} unit={t('stats.games', { count: stats.games })} settle={settle} />
      <Stat
        value={stats.finished}
        unit={t('stats.finished', { count: stats.finished })}
        settle={settle}
      />
      <Stat value={stats.hours} unit={t('stats.hours', { count: stats.hours })} settle={settle} />
    </div>
  )
}
