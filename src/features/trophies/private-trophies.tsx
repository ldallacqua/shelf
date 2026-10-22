'use client'

import { useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import { trophyWall } from '@/domain/library/trophies'
import { PrivateShelf } from '@/features/library/private-shelf'
import { useShelf } from '@/features/library/shelf'
import { loadMine } from '@/features/library/use-library'
import { useAccount } from '@/features/owner/account'

import { EmptyTrophies } from './empty-trophies'
import { TrophiesSkeleton } from './trophies-skeleton'
import { TrophyWallView } from './trophy-wall'

/** One's own private trophy wall, worked out in the browser from what `/api/v1/me/library` answers. */
function MyTrophies({ handle }: { handle: string }) {
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
  const wall = trophyWall(library, new Date().getFullYear())
  if (wall.years.length === 0) return <EmptyTrophies />
  return <TrophyWallView wall={wall} handle={handle} />
}

/**
 * A private shelf's trophy wall (ADR 004). Its page is a frame; for its own
 * account the browser fills it in, and anyone else is told the shelf is private.
 */
export function PrivateTrophies() {
  const account = useAccount()
  const { handle } = useShelf()
  if (account.status === 'checking') return <TrophiesSkeleton />
  if (account.status !== 'signed-in' || account.handle !== handle) return <PrivateShelf />
  return <MyTrophies handle={handle} />
}
