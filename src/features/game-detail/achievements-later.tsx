'use client'

import dynamic from 'next/dynamic'

import { Ghosts } from '@/ui/ghosts'

/**
 * A game's achievements (issue 72), their code fetched only for a game that
 * has some, while their answer is on its way: imported directly, its lists
 * and controls would weigh on every game's page and on the library, whose
 * panel draws the same page.
 */
export const AchievementsLater = dynamic(
  () => import('./achievements').then((module) => module.Achievements),
  { ssr: false, loading: () => <Ghosts lines={3} /> },
)
