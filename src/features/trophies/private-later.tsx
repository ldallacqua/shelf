'use client'

import dynamic from 'next/dynamic'

import { TrophiesSkeleton } from './trophies-skeleton'

/**
 * A private shelf's trophy wall, its code fetched only when one is drawn
 * (ADR 004), as `PrivateLibraryLater` is: imported directly, it would weigh on
 * every public wall too.
 */
export const PrivateTrophiesLater = dynamic(
  () => import('./private-trophies').then((module) => module.PrivateTrophies),
  { ssr: false, loading: () => <TrophiesSkeleton /> },
)
