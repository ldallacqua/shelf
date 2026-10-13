'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/ui/button'
import { cn } from '@/ui/cn'
import { duration, type DurationName } from '@/ui/tokens/motion'

const steps = Object.keys(duration) as DurationName[]

/** The five motion lengths, each shown by a marker gliding along a track. */
export function MotionDemo() {
  const t = useTranslations('Foundations.motion')
  const [played, setPlayed] = useState(false)

  return (
    <div>
      <ul className="grid gap-4">
        {steps.map((step) => (
          <li key={step} className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <span className="font-medium">{t(`steps.${step}.name`)}</span>
              <span className="readout text-xs text-muted tabular-nums">
                {t('milliseconds', { value: duration[step] })}
              </span>
              <span className="text-sm text-muted">{t(`steps.${step}.use`)}</span>
            </div>
            <div aria-hidden="true" className="h-3 rounded-full bg-text/8">
              <div
                data-testid={`motion-marker-${step}`}
                data-played={played}
                style={{ transitionDuration: `var(--motion-${step})` }}
                className={cn(
                  'h-3 w-full ease-glide motion-safe:transition-transform',
                  'data-[played=true]:translate-x-[calc(100%-0.75rem)]',
                )}
              >
                <span className="block size-3 rounded-full bg-accent shadow-[0_0_calc(var(--glow)*10px)_var(--accent)]" />
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="secondary" onClick={() => setPlayed((value) => !value)}>
          {played ? t('reset') : t('play')}
        </Button>
        <p className="hidden text-sm text-muted motion-reduce:block">{t('calm')}</p>
      </div>
    </div>
  )
}
