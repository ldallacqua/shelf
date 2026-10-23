'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState } from 'react'

import { writeSort, type Sort } from '@/domain/library/sort'

/** How long the filter and the sort stay still before what they leave is said: not at each letter. */
const SETTLE_MS = 700

/**
 * Says what a filter or a sort leaves on the shelves (spec 13): "42 games,
 * sorted by My rating, descending". Silent for the address the page opened
 * at, and when nothing matches, which the empty shelf says itself.
 */
export function ResultStatus({
  q,
  sort,
  count,
}: {
  q: string
  sort: Sort
  /** How many games match, once the library file has arrived. */
  count?: number
}) {
  const t = useTranslations('Sort')
  const asked = `${q}\n${writeSort(sort)}`
  /** The filter and sort the page opened at, until either changes. */
  const opened = useRef<string | undefined>(asked)
  const [said, setSaid] = useState('')

  const words =
    count === undefined
      ? undefined
      : sort.key === 'random'
        ? t('shuffled', { count })
        : t('result', {
            count,
            order: t(sort.descending ? 'descending' : 'ascending', { key: t(`keys.${sort.key}`) }),
          })

  useEffect(() => {
    if (asked === opened.current || words === undefined) return
    opened.current = undefined
    const timer = setTimeout(() => setSaid(count === 0 ? '' : words), SETTLE_MS)
    return () => clearTimeout(timer)
  }, [asked, words, count])

  return (
    <p className="sr-only" role="status">
      {said}
    </p>
  )
}
