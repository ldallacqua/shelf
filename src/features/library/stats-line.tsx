'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import type { LibraryStats } from '@/domain/library/stats'
import { duration } from '@/ui/tokens/motion'

/**
 * A number that settles into place once, when first seen: the last stretch
 * of a count-up. The page arrives with the final number already in it, so
 * nothing is wrong before, without, or instead of the animation; with
 * reduced motion it does not run.
 */
function useSettled(value: number): number {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const from = Math.round(value * 0.85)
    if (from === value) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration.cinematic)
      // Ease out: quick at first, slowing into the final figure.
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Once, for the number the page arrived with. A later change shows at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return shown
}

function Stat({ value, unit }: { value: number; unit: string }) {
  const format = useFormatter()
  const shown = useSettled(value)
  // The settling figure is decoration. The true one is what is read out.
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="sr-only">{`${format.number(value)} ${unit}`}</span>
      <span aria-hidden="true" className="title text-base text-text tabular-nums sm:text-lg">
        {format.number(shown)}
      </span>
      <span aria-hidden="true">{unit}</span>
    </span>
  )
}

/** Games, finished, hours: the line above the shelves (spec 3.9). */
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
