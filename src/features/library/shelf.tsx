'use client'

import { createContext, use, type ReactNode } from 'react'

import { useIsMine } from '@/features/owner/account'

import type { ShelfInfo } from './shelf-address'

/**
 * The shelf a page is part of (ADR 004): whose it is, what it is called,
 * whether anyone may see it, and where its files are. Every page under
 * `/u/{handle}` gives it to what it draws, once it has found the shelf; a
 * link inside a shelf builds its address from it (`shelf-address.ts`).
 */

const ShelfContext = createContext<ShelfInfo | undefined>(undefined)

export function ShelfProvider({ shelf, children }: { shelf: ShelfInfo; children: ReactNode }) {
  // Its own account reads its own files, with the games only it sees (spec 11.1); a public
  // shelf's files never carry them.
  const mine = useIsMine(shelf.handle) && shelf.files.kind === 'public'
  return (
    <ShelfContext value={mine ? { ...shelf, files: { kind: 'mine' } } : shelf}>
      {children}
    </ShelfContext>
  )
}

/** The shelf this page is part of. Only under `/u/{handle}`. */
export const useShelf = (): ShelfInfo => {
  const shelf = use(ShelfContext)
  if (!shelf) throw new Error('useShelf is for pages under /u/{handle}, inside a ShelfProvider.')
  return shelf
}
