'use client'

import { useLocale } from 'next-intl'
import { useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import type { AchievementWall } from '@/domain/library/trophy-achievements'
import { trophyWall } from '@/domain/library/trophies'
import { PrivateShelf } from '@/features/library/private-shelf'
import { useShelf } from '@/features/library/shelf'
import { loadMine } from '@/features/library/use-library'
import { useAccount } from '@/features/owner/account'

import { EmptyTrophies } from './empty-trophies'
import { loadMyAchievements } from './my-achievements'
import { TrophiesSkeleton } from './trophies-skeleton'
import { TrophyWallView } from './trophy-wall'
import type { Which } from './wall-address'

/**
 * One's own private trophy wall, worked out in the browser from what
 * `/api/v1/me/library` answers, with its achievements as the server works
 * them out for the same address.
 */
function MyTrophies({ handle, which }: { handle: string; which: Which }) {
  const locale = useLocale()
  const [loaded, setLoaded] = useState<{ library: Library; achievements?: AchievementWall }>()
  const [failed, setFailed] = useState(false)
  const { scope, q, rarity } = which

  useEffect(() => {
    let current = true
    Promise.all([loadMine(), loadMyAchievements({ scope, q, rarity }, locale)])
      .then(([library, achievements]) => current && setLoaded({ library, achievements }))
      .catch(() => current && setFailed(true))
    return () => {
      current = false
    }
  }, [scope, q, rarity, locale])

  if (failed) throw new Error('Your library could not be read.')
  if (!loaded) return <TrophiesSkeleton />
  const { library, achievements } = loaded
  const today = new Date().toISOString().slice(0, 10)
  const wall = trophyWall(library, new Date().getFullYear(), 'en', { ...which, today })
  if (wall.years.length === 0 && which.scope === undefined && which.q === undefined) {
    return <EmptyTrophies />
  }
  return <TrophyWallView wall={wall} achievements={achievements} handle={handle} q={which.q} />
}

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
