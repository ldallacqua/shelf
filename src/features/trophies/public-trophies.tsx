'use client'

import { useEffect, useState } from 'react'

import type { TrophyWall } from '@/domain/library/trophies'
import { useIsMine } from '@/features/owner/account'

import { EmptyTrophies } from './empty-trophies'
import { TrophyWallView } from './trophy-wall'

/**
 * A public shelf's trophy wall, as the server drew it for everyone. To its
 * own account, with the games only it sees (spec 11.1) when one of them is
 * finished: worked out again in its browser from its own files, whose code
 * is fetched only then.
 */
export function PublicTrophies({ wall, handle }: { wall: TrophyWall; handle: string }) {
  const mine = useIsMine(handle)
  const [own, setOwn] = useState<TrophyWall>()

  useEffect(() => {
    if (!mine) return
    let current = true
    void Promise.all([
      import('@/features/library/use-library'),
      import('@/domain/library/trophies'),
    ])
      .then(async ([{ loadMine }, { trophyWall }]) => {
        const library = await loadMine()
        const hidden = library.games.some((game) => game.private && game.status === 'completed')
        if (current && hidden) setOwn(trophyWall(library, new Date().getFullYear()))
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [mine])

  const shown = own ?? wall
  if (shown.years.length === 0) return <EmptyTrophies />
  return <TrophyWallView wall={shown} handle={handle} />
}
