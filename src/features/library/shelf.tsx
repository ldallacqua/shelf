'use client'

import { createContext, use, type ReactNode } from 'react'

import type { ShelfInfo } from './shelf-address'

/**
 * The shelf a page is part of (ADR 004): whose it is, what it is called,
 * whether anyone may see it, and where its files are. Every page under
 * `/u/{handle}` gives it to what it draws, once it has found the shelf; a
 * link inside a shelf builds its address from it (`shelf-address.ts`).
 */

const ShelfContext = createContext<ShelfInfo | undefined>(undefined)

export function ShelfProvider({ shelf, children }: { shelf: ShelfInfo; children: ReactNode }) {
  return <ShelfContext value={shelf}>{children}</ShelfContext>
}

/** The shelf this page is part of. Only under `/u/{handle}`. */
export const useShelf = (): ShelfInfo => {
  const shelf = use(ShelfContext)
  if (!shelf) throw new Error('useShelf is for pages under /u/{handle}, inside a ShelfProvider.')
  return shelf
}
