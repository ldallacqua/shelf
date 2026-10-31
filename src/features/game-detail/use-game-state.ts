'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { desktop, refusals, type GameView } from '@/features/desktop/bridge'

/**
 * Whether a game is running on this computer (ADR 005, section 11), asked of
 * the app while its Play shows, and never while the window is hidden, so a game
 * in front costs it nothing. Looked at again as soon as the window comes back,
 * which is also what follows Windows waking up.
 *
 * An app older than this has no such command: `unavailable`, and Play is as
 * it was. The site is updated before the app is.
 */

/** How often it is asked while nothing is happening: often enough to feel current, cheap to answer. */
const STEADY_MS = 5_000
/** While it is starting or being stopped, when the person is waiting for the answer. */
const BUSY_MS = 1_000
/** How soon a running game not seen is looked for again, before anyone is told it has gone. */
const DOUBT_MS = 1_000
/** How long a game sent to Steam stays Starting, if Steam shows nothing of it. */
const STEAM_START_MS = 60_000

export type GameState = GameView | 'unavailable'

const STARTING: GameView = { state: 'starting', unresponsive: false }

/** When each game was sent to Steam: Steam is reached by a link, so the app can't know. */
const sentToSteam = new Map<string, number>()

const same = (a: GameState | undefined, b: GameState) =>
  a === b ||
  (typeof a === 'object' &&
    typeof b === 'object' &&
    a.state === b.state &&
    a.why === b.why &&
    a.unresponsive === b.unresponsive)

/** A game just sent to Steam is starting, until Steam or a process shows otherwise. */
const withSteam = (entry: string, view: GameView): GameView => {
  const sent = sentToSteam.get(entry)
  if (sent === undefined) return view
  const waiting = view.state === 'stopped' || view.why === 'steam'
  if (waiting && Date.now() - sent < STEAM_START_MS) return STARTING
  sentToSteam.delete(entry)
  return view
}

/**
 * `enabled` holds it back until what the game has here is known; `apps` are its Steam apps
 * installed here. `path` is the game's file, so a change of it looks again at once.
 */
export function useGameState(
  entry: string,
  apps: readonly string[],
  path: string | undefined,
  enabled: boolean,
) {
  const [state, setState] = useState<GameState>()
  const shown = useRef<GameState | undefined>(undefined)
  const lookNow = useRef<() => void>(() => {})
  const installed = apps.join(' ')

  useEffect(() => {
    if (!enabled) return
    let current = true
    let timer: ReturnType<typeof setTimeout> | undefined
    let doubting = false
    const asked = installed === '' ? [] : installed.split(' ')

    const show = (next: GameState) => {
      if (same(shown.current, next)) return
      shown.current = next
      setState(next)
    }

    const look = async () => {
      clearTimeout(timer)
      // Comes back with the window: `visibilitychange`, below.
      if (document.visibilityState === 'hidden') return
      let answer: GameView
      try {
        answer = await desktop.gameState(entry, asked)
      } catch (error) {
        if (!current) return
        // Not one of the app's own words, or nothing known yet: this app can't tell.
        const refused = refusals.some((word) => word === error)
        if (!refused || shown.current === undefined) {
          show('unavailable')
          return
        }
        timer = setTimeout(() => void look(), STEADY_MS)
        return
      }
      if (!current) return
      const view = withSteam(entry, answer)
      // A launcher handing over to the game, or two looks either side of it: said twice.
      const was = shown.current
      const left =
        typeof was === 'object' &&
        (was.state === 'running' || was.state === 'stopping') &&
        was.state !== view.state &&
        view.state !== 'running' &&
        view.state !== 'stopping'
      if (left && !doubting) {
        doubting = true
        timer = setTimeout(() => void look(), DOUBT_MS)
        return
      }
      doubting = false
      show(view)
      const busy = view.state === 'starting' || view.state === 'stopping'
      timer = setTimeout(() => void look(), busy ? BUSY_MS : STEADY_MS)
    }

    lookNow.current = () => void look()
    const onVisible = () => void look()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    void look()
    return () => {
      current = false
      clearTimeout(timer)
      lookNow.current = () => {}
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [entry, installed, path, enabled])

  /** Says the game has just been sent to Steam: nobody else can. */
  const sentGameToSteam = useCallback(() => {
    sentToSteam.set(entry, Date.now())
    shown.current = STARTING
    setState(STARTING)
    lookNow.current()
  }, [entry])

  /** Asks again now, after something was done to the game. */
  const check = useCallback(() => lookNow.current(), [])

  return { state, check, sentGameToSteam }
}
