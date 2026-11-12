'use client'

import { CheckIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { askingSteps, setupSteps, type SetupStep } from '@/domain/setup/setup'
import { cn } from '@/ui/cn'

type AskingStep = (typeof askingSteps)[number]

/**
 * Where the setup stands (spec 4.6): a line of four segments, lit up to the step in view, each
 * named and numbered, with a tick once what it asks is true. Every step can be gone back to, or
 * jumped ahead to, since none is required: the segments are buttons. A phone shows the step's
 * number and name above the line, and the names only to assistive technology.
 */
export function SetupProgress({
  current,
  done,
  onPick,
}: {
  current: SetupStep
  done: Readonly<Record<AskingStep, boolean>>
  onPick: (step: SetupStep) => void
}) {
  const t = useTranslations('Start')
  const at = setupSteps.indexOf(current)
  const number = Math.min(at + 1, askingSteps.length)
  return (
    <nav aria-label={t('steps')}>
      <p className="readout text-[0.6875rem] text-muted sm:hidden">
        {current === 'ready'
          ? t('ready.eyebrow')
          : t('stepOf', { number, total: askingSteps.length, name: t(`names.${current}`) })}
      </p>
      <ol className="mt-3 grid grid-cols-4 gap-2 sm:mt-0 sm:gap-3">
        {askingSteps.map((step, index) => {
          const isCurrent = step === current
          const lit = index <= at
          return (
            <li key={step} className="min-w-0">
              <button
                type="button"
                onClick={() => onPick(step)}
                aria-current={isCurrent ? 'step' : undefined}
                // Said in words, not by the tick alone.
                aria-label={done[step] ? t('doneName', { name: t(`names.${step}`) }) : undefined}
                className={cn(
                  'group grid min-h-6 w-full gap-2 rounded-control pb-1 text-left',
                  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'block h-1 rounded-full transition-[background-color,box-shadow] duration-slow ease-settle',
                    lit
                      ? 'bg-accent shadow-[0_0_calc(var(--glow)*10px)_var(--accent)]'
                      : 'bg-line-strong group-hover:bg-muted',
                  )}
                />
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-1.5 text-sm',
                    isCurrent ? 'font-medium text-text' : 'text-muted group-hover:text-text',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-5 flex-none place-items-center rounded-full border text-[0.6875rem] tabular-nums',
                      done[step]
                        ? 'border-accent bg-accent text-on-accent'
                        : isCurrent
                          ? 'border-text'
                          : 'border-line-strong',
                    )}
                  >
                    {done[step] ? <CheckIcon strokeWidth={3} className="size-3" /> : index + 1}
                  </span>
                  <span className="truncate max-sm:sr-only">{t(`names.${step}`)}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
