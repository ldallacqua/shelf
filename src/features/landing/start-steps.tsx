import { useTranslations } from 'next-intl'

const STEPS = ['create', 'bring', 'play'] as const

/**
 * "Ready in a minute" (spec 4.6): the three steps from signing up to a shelf of one's own, as
 * setting a shelf up walks through them, so a visitor knows what comes after the button.
 */
export function StartSteps() {
  const t = useTranslations('Landing.start.steps')
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {STEPS.map((step, index) => (
        <li
          key={step}
          className="grid content-start gap-3 rounded-panel border border-line bg-surface p-6"
        >
          <span
            aria-hidden="true"
            className="grid size-10 place-items-center rounded-full border border-accent bg-accent/15 font-mono text-sm tabular-nums"
          >
            {index + 1}
          </span>
          <h3 className="title text-xl">{t(`${step}.title`)}</h3>
          <p className="text-pretty text-muted">{t(`${step}.body`)}</p>
        </li>
      ))}
    </ol>
  )
}
