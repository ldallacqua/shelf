'use client'

import { useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import { trophyWall, type WallOptions } from '@/domain/library/trophies'
import { PrivateShelf } from '@/features/library/private-shelf'
import { useShelf } from '@/features/library/shelf'
import { loadMine } from '@/features/library/use-library'
import { useAccount } from '@/features/owner/account'

import { EmptyTrophies } from './empty-trophies'
import { TrophiesSkeleton } from './trophies-skeleton'
import { TrophyWallView } from './trophy-wall'

/** One's own private trophy wall, worked out in the browser from what `/api/v1/me/library` answers. */
function MyTrophies({ handle, which }: { handle: string; which: Which }) {
  const [library, setLibrary] = useState<Library>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    loadMine()
      .then((loaded) => current && setLibrary(loaded))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [])

  if (failed) throw new Error('Your library could not be read.')
  if (!library) return <TrophiesSkeleton />
  const today = new Date().toISOString().slice(0, 10)
  const wall = trophyWall(library, new Date().getFullYear(), 'en', { ...which, today })
  if (wall.years.length === 0 && which.scope === undefined && which.q === undefined) {
    return <EmptyTrophies />
  }
  return <TrophyWallView wall={wall} handle={handle} q={which.q} />
}

/** Which trophies the address asks for. */
type Which = Pick<WallOptions, 'scope' | 'q'>

/**
 * A private shelf's trophy wall (ADR 004). Its page is a frame; for its own
 * account the browser fills it in, and anyone else is told the shelf is private.
 */
export function PrivateTrophies({ which = {} }: { which?: Which }) {
  const account = useAccount()
  const { handle } = useShelf()
  if (account.status === 'checking') return <TrophiesSkeleton />
  if (account.status !== 'signed-in' || account.handle !== handle) return <PrivateShelf />
  return <MyTrophies handle={handle} which={which} />
}
