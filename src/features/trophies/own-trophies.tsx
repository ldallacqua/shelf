'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState, type ReactNode } from 'react'

import type { AchievementWall } from '@/domain/library/trophy-achievements'
import { trophyWall, type TrophyWall } from '@/domain/library/trophies'
import { loadMine } from '@/features/library/use-library'

import { EmptyTrophies } from './empty-trophies'
import { loadMyAchievements } from './my-achievements'
import { TrophyWallView, type CardOf } from './trophy-wall'
import type { Which } from './wall-address'

/**
 * Its own account's trophy wall on its public shelf (spec 11.1): worked out
 * from its own files, with the games only it sees, when it has any: their
 * achievements count too, as the server works them out for the account.
 * Otherwise the wall the server drew, which says the same.
 */
export function OwnTrophies({
  handle,
  which,
  card,
  children,
}: {
  handle: string
  which: Which
  card?: CardOf
  children: ReactNode
}) {
  const locale = useLocale()
  const [own, setOwn] = useState<{ wall: TrophyWall; achievements?: AchievementWall }>()
  const { scope, q, by, rarity } = which

  useEffect(() => {
    let current = true
    loadMine()
      .then(async (library) => {
        if (!library.games.some((game) => game.private)) return
        const achievements = await loadMyAchievements({ scope, q, rarity }, locale)
        const today = new Date().toISOString().slice(0, 10)
        const year = new Date().getFullYear()
        const wall = trophyWall(library, year, 'en', { scope, q, today, by })
        if (current) setOwn({ wall, achievements })
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [scope, q, by, rarity, locale])

  if (!own) return children
  if (own.wall.years.length === 0 && scope === undefined && q === undefined) {
    return <EmptyTrophies />
  }
  return (
    <TrophyWallView
      wall={own.wall}
      achievements={own.achievements}
      handle={handle}
      q={q}
      card={card}
    />
  )
}
