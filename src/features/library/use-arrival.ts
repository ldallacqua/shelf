'use client'

import { useEffect, useState } from 'react'

import type { Completion } from '@/domain/library/remembered'

/** Whether two completions arrange the library the same way: a shuffle's seed aside. */
const sameArrangement = (a: Completion, b: Completion) =>
  a.view === b.view && a.group === b.group && a.sort === b.sort

/**
 * The arrangement this device remembers, for a library opened from an address
 * that names no view, grouping or sort (issue 149). It stands until the
 * address names one, whether because `put` wrote it there (once, as the page
 * comes alive) or because a choice did. After that the address alone says how
 * the library stands, so a step back to an address that named none shows the
 * defaults it showed then. A new arrival, a new `completion`, brings it back.
 *
 * `here` reads the address and the device as they are now. Each time the page
 * is shown it is asked again: React keeps a page the router may come back to,
 * effects undone, and the router keeps what the server drew for an address,
 * so a page shown again from either carries what the cookie said then. A
 * choice made since, on this page or another, decides instead.
 */
export function useArrival(
  completion: Completion | undefined,
  named: boolean,
  put: (completion: Completion) => void,
  here: () => { named: boolean; completion: Completion | undefined },
): Completion | undefined {
  const [arrival, setArrival] = useState(completion)
  const [given, setGiven] = useState(completion)
  if (completion !== given) {
    setGiven(completion)
    setArrival(completion)
  }
  if (arrival && named) setArrival(undefined)

  useEffect(() => {
    if (!arrival) return
    // Once the step of history that brought the page here has settled: nuqs drops what it was
    // asked to write before then, and a link from another page would leave the address bare.
    // Only what the device still remembers: the server read the cookie for a page the router may
    // have kept since, and the look below puts what it says now in its place.
    const later = setTimeout(() => {
      const now = here()
      if (!now.named && now.completion && sameArrangement(arrival, now.completion)) put(arrival)
    })
    return () => clearTimeout(later)
    // `put` is whatever writes the address now; it is only asked once per arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival])

  useEffect(() => {
    // Read once that step has settled too, when the address is the page's own.
    const later = setTimeout(() => {
      const now = here()
      if (now.named) return
      // The same arrangement keeps the server's, whose first screen was drawn with its seed.
      setArrival((drawn) =>
        drawn && now.completion && sameArrangement(drawn, now.completion) ? drawn : now.completion,
      )
    })
    return () => clearTimeout(later)
    // Asked each time the page is shown, and only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return arrival
}
