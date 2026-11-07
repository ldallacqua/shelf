'use client'

import { useEffect, useState } from 'react'

import type { Completion } from '@/domain/library/remembered'

/**
 * The arrangement this device remembers, for a library opened from an address
 * that names no view, grouping or sort (issue 149). It stands until the
 * address names one, whether because `put` wrote it there (once, as the page
 * comes alive) or because a choice did. After that the address alone says how
 * the library stands, so a step back to an address that named none shows the
 * defaults it showed then. A new arrival, a new `completion`, brings it back.
 */
export function useArrival(
  completion: Completion | undefined,
  named: boolean,
  put: (completion: Completion) => void,
): Completion | undefined {
  const [arrival, setArrival] = useState(completion)
  const [given, setGiven] = useState(completion)
  if (completion !== given) {
    setGiven(completion)
    setArrival(completion)
  }
  if (arrival && named) setArrival(undefined)

  useEffect(() => {
    if (arrival) put(arrival)
    // `put` is whatever writes the address now; it is only asked once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival])

  return arrival
}
