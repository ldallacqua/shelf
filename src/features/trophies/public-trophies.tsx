'use client'

import { lazy, Suspense, type ReactNode } from 'react'

import { useIsMine } from '@/features/owner/account'

import type { Which } from './wall-address'

const OwnTrophies = lazy(() =>
  import('./own-trophies').then((module) => ({ default: module.OwnTrophies })),
)

/**
 * A public shelf's trophy wall, drawn by the server for everyone. To its own
 * account, the wall again with the games only it sees (spec 11.1), whose
 * code is fetched only for it; until then, and when it has none, the
 * server's wall stands.
 */
export function PublicTrophies({
  handle,
  which,
  children,
}: {
  handle: string
  /** Which trophies the address asks for. */
  which: Which
  children: ReactNode
}) {
  const mine = useIsMine(handle)
  if (!mine) return children
  return (
    <Suspense fallback={children}>
      <OwnTrophies handle={handle} which={which}>
        {children}
      </OwnTrophies>
    </Suspense>
  )
}
