'use client'

import { useEffect } from 'react'

import { useShelf } from '@/features/library/shelf'

import { knowShelf } from './store'

/**
 * Tells the list beside the page which shelf this game is on, and at which
 * version, for a page reached any way but from the library (a link, an
 * address typed, a reload). Inside the page's `ShelfProvider`, so one's own
 * shelf is read as its own (ADR 004).
 */
export function KnowShelf({ version }: { version: number }) {
  const shelf = useShelf()
  const key = shelf.files.kind === 'public' ? shelf.files.key : 'mine'
  useEffect(() => {
    knowShelf({ shelf, version })
    // The shelf is the same while these are: a new object each render says nothing new.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf.handle, shelf.name, key, version])
  return null
}
