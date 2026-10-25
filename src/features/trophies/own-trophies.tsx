'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { trophyWall, type TrophyWall } from '@/domain/library/trophies'
import { loadMine } from '@/features/library/use-library'

import { EmptyTrophies } from './empty-trophies'
import { TrophyWallView } from './trophy-wall'

/**
 * Its own account's trophy wall on its public shelf (spec 11.1): worked out
 * from its own files, with the games only it sees, when one of them is
 * finished. Otherwise the wall the server drew, which says the same.
 */
export function OwnTrophies({ handle, children }: { handle: string; children: ReactNode }) {
  const [own, setOwn] = useState<TrophyWall>()

  useEffect(() => {
    let current = true
    loadMine()
      .then((library) => {
        const hidden = library.games.some((game) => game.private && game.status === 'completed')
        if (current && hidden) setOwn(trophyWall(library, new Date().getFullYear()))
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])

  if (!own) return children
  if (own.years.length === 0) return <EmptyTrophies />
  return <TrophyWallView wall={own} handle={handle} />
}
