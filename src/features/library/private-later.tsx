'use client'

import dynamic from 'next/dynamic'

import { LibrarySkeleton } from './library-skeleton'

/**
 * A private shelf's library, its code fetched only when one is drawn
 * (ADR 004). A page loads every client component it imports, drawn or not,
 * so imported directly it would weigh on every public shelf too. Nothing of
 * it is drawn on the server: until its account is known, the skeleton.
 */
export const PrivateLibraryLater = dynamic(
  () => import('./private-library').then((module) => module.PrivateLibrary),
  { ssr: false, loading: () => <LibrarySkeleton /> },
)
