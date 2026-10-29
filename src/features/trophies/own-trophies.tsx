'use client'

import { useEffect, useState, type ReactNode } from 'react'

import { trophyWall, type TrophyWall, type WallOptions } from '@/domain/library/trophies'
import { loadMine } from '@/features/library/use-library'

import { EmptyTrophies } from './empty-trophies'
import { TrophyWallView } from './trophy-wall'

/**
 * Its own account's trophy wall on its public shelf (spec 11.1): worked out
 * from its own files, with the games only it sees, when one of them is
 * finished. Otherwise the wall the server drew, which says the same.
 */
export function OwnTrophies({
  handle,
  which,
  children,
}: {
  handle: string
  which: Pick<WallOptions, 'scope' | 'q' | 'by'>
  children: ReactNode
}) {
  const [own, setOwn] = useState<TrophyWall>()
  const { scope, q, by } = which

  useEffect(() => {
    let current = true
    loadMine()
      .then((library) => {
        const hidden = library.games.some((game) => game.private && game.status === 'completed')
        const today = new Date().toISOString().slice(0, 10)
        const year = new Date().getFullYear()
        if (current && hidden) setOwn(trophyWall(library, year, 'en', { scope, q, today, by }))
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [scope, q, by])

  if (!own) return children
  if (own.years.length === 0 && scope === undefined && q === undefined) return <EmptyTrophies />
  return <TrophyWallView wall={own} handle={handle} q={q} />
}
