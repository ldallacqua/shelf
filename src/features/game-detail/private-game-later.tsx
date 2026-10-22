'use client'

import dynamic from 'next/dynamic'

import { GameSkeleton } from './game-skeleton'

/**
 * A game on a private shelf, its code fetched only when one is drawn
 * (ADR 004): imported directly, it would weigh on every public game's page.
 */
export const PrivateGameLater = dynamic(
  () => import('./private-game').then((module) => module.PrivateGame),
  { ssr: false, loading: () => <GameSkeleton /> },
)
