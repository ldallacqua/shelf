'use client'

import { useEffect } from 'react'

import type { Palette } from '@/domain/color/palette'
import { duration } from '@/ui/tokens/motion'

/**
 * Following the game (issue 206): with it on (`data-follow` on <html>, the
 * device's choice), the room takes the colors of the game in focus: on a
 * game's page as it opens, and in the library once the pointer rests on a game
 * or the keyboard reaches it.
 *
 * The colors glide, half a second, with every part of the page together
 * (`data-colors-changing`, theme.css). A whole page gliding restyles it on
 * every frame: measured with the processor four times slower, that dropped a
 * dozen frames a change, so the first glide is watched, and a device it was
 * too slow for changes at once from then on.
 *
 * This file is on the library's and a game's pages, so it stays small: the
 * arithmetic is `follow-paint.ts`, loaded the first time a game is followed.
 */

/** How long the pointer rests on a game before the room takes its colors. */
const REST_MS = 350
/** How long the room keeps a game's colors after leaving it, so moving to the next doesn't flash. */
const LINGER_MS = 600
/** How long the colors glide: `--motion-slow`, as theme.css's `data-colors-changing` has it. */
const GLIDE_MS = duration.slow
/** Frames longer than this, more than LONG_FRAMES times in a glide, make the device too slow for it. */
const LONG_FRAME_MS = 50
const LONG_FRAMES = 2

let rest: ReturnType<typeof setTimeout> | undefined
let release: ReturnType<typeof setTimeout> | undefined
let glideEnd: ReturnType<typeof setTimeout> | undefined
/** The game whose colors are on their way, so a game left before they arrive isn't painted late. */
let wanted: string | undefined
/** Set once a glide dropped frames: from then on the room changes at once. */
let tooSlowToGlide = false
/** The game the pointer or keyboard rests on, so moving within its cover doesn't start the wait again. */
let resting: string | undefined
let restPending = false

const following = () => document.documentElement.hasAttribute('data-follow')

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** In the library, only for a pointer that hovers and a person who hasn't asked for less motion. */
const followsInTheLibrary = () => window.matchMedia('(hover: hover)').matches && !reducedMotion()

/** Makes a change of the room's colors glide, and watches whether this device keeps up. */
function glide(change: () => void): void {
  if (tooSlowToGlide || reducedMotion()) return change()
  const root = document.documentElement
  root.dataset.colorsChanging = ''
  change()
  clearTimeout(glideEnd)
  glideEnd = setTimeout(() => delete root.dataset.colorsChanging, GLIDE_MS + 60)

  let long = 0
  let last = performance.now()
  const end = last + GLIDE_MS
  const watch = (now: number) => {
    if (now - last > LONG_FRAME_MS) long += 1
    last = now
    if (now < end) requestAnimationFrame(watch)
    else if (long > LONG_FRAMES) tooSlowToGlide = true
  }
  requestAnimationFrame(watch)
}

function show(palette: Palette): void {
  const key = palette.join('')
  wanted = key
  if (document.documentElement.dataset.game === key) return
  void import('./follow-paint').then(({ paintGame }) => {
    if (following() && wanted === key) glide(() => paintGame(palette, key))
  })
}

function hide(): void {
  wanted = undefined
  if (document.documentElement.dataset.game === undefined) return
  glide(() => delete document.documentElement.dataset.game)
}

/**
 * The game the pointer or the keyboard is on in the library, or none: the room
 * takes its colors once it has rested there a moment, and gives them back a
 * moment after leaving. For views that know the game in focus only from an
 * event (`useFollowOnHover` in the library).
 */
export function restOn(palette: Palette | undefined): void {
  if (!following() || !followsInTheLibrary()) return
  const key = palette?.join('')
  clearTimeout(release)
  // Still on the same game, its colors on their way or on the walls: let it be.
  const shown = document.documentElement.dataset.game
  if (key !== undefined && key === resting && (restPending || shown === key)) return
  resting = key
  clearTimeout(rest)
  restPending = palette !== undefined
  if (palette) {
    rest = setTimeout(() => {
      restPending = false
      show(palette)
    }, REST_MS)
  } else release = setTimeout(hide, LINGER_MS)
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
    if (at === 'rest') {
      restOn(palette)
      return () => restOn(undefined)
    }
    clearTimeout(rest)
    clearTimeout(release)
    show(palette)
    return () => {
      clearTimeout(release)
      release = setTimeout(hide, 0)
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
