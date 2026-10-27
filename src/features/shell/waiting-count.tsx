'use client'

import { useTranslations } from 'next-intl'

/** The most a count shows: past it, 999+, four characters, the most a badge should hold. */
const MOST = 999

/**
 * How many games wait for a status, after the link to placing them: a small
 * accent pill, as on the Filters button. Its words are for assistive
 * technology, so the count is never only a colored shape. Nothing at none.
 */
export function WaitingCount({ count }: { count: number }) {
  const t = useTranslations('Shell')
  if (count <= 0) return null
  return (
    <>
      <span
        aria-hidden="true"
        className="ml-1.5 rounded-full bg-accent px-1.5 readout text-[0.625rem] leading-4 text-on-accent"
      >
        {count > MOST ? `${MOST}+` : count}
      </span>
      <span className="sr-only">{`, ${t('waiting', { count })}`}</span>
    </>
  )
}
