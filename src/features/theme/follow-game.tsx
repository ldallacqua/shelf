'use client'

import { useEffect } from 'react'

import type { Palette } from '@/domain/color/palette'

/**
 * Following the game (issue 206): with it on (`data-follow` on <html>, the
 * device's choice), the room takes the colors of the game in focus: on a
 * game's page as it opens, and on the shelf once the pointer rests on a game
 * or the keyboard reaches it. It changes at once, never gliding: measured with
 * the processor four times slower, a whole page gliding to new colors dropped
 * a dozen frames each time, and a change at once about one.
 *
 * This file is on the library's and a game's pages, so it stays small: the
 * arithmetic is `follow-paint.ts`, loaded the first time a game is followed.
 */

/** How long the pointer rests on a game before the room takes its colors. */
const REST_MS = 350
/** How long the room keeps a game's colors after leaving it, so moving to the next doesn't flash. */
const LINGER_MS = 600

let release: ReturnType<typeof setTimeout> | undefined
/** The game whose colors are on their way, so a game left before they arrive isn't painted late. */
let wanted: string | undefined

const following = () => document.documentElement.hasAttribute('data-follow')

/** On the shelf, only for a pointer that hovers and a person who hasn't asked for less motion. */
const followsOnTheShelf = () =>
  window.matchMedia('(hover: hover)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

function show(palette: Palette): void {
  const key = palette.join('')
  wanted = key
  if (document.documentElement.dataset.game === key) return
  void import('./follow-paint').then(({ paintGame }) => {
    if (following() && wanted === key) paintGame(palette, key)
  })
}

function hide(): void {
  wanted = undefined
  delete document.documentElement.dataset.game
}

/**
 * Follows a game while it is in focus: `palette` is its cover's colors, or
 * none when no game is. `at` says when: as soon as it is given (a game's
 * page), or once it has rested a moment (the shelf).
 */
export function useFollowGame(palette: Palette | undefined, at: 'once' | 'rest' = 'rest'): void {
  const key = palette?.join('')
  useEffect(() => {
    if (!palette || !following()) return
    if (at === 'rest' && !followsOnTheShelf()) return
    clearTimeout(release)
    const shown = setTimeout(() => show(palette), at === 'rest' ? REST_MS : 0)
    return () => {
      clearTimeout(shown)
      clearTimeout(release)
      release = setTimeout(hide, at === 'rest' ? LINGER_MS : 0)
    }
    // The palette is followed by its colors, not by the array that carries them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, at])
}

/** A game's page follows its game while it is open. */
export function FollowGame({ colors }: { colors: Palette | undefined }) {
  useFollowGame(colors, 'once')
  return null
}
