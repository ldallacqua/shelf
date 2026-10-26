'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'

import type { PlayableGame } from '@/domain/library/editing'
import { readySlugs, type OnThisComputer } from '@/domain/library/ready'
import { inDesktopApp, onLaunchersChange } from '@/features/desktop/tauri'

/** Being inside the app never changes while a page is open. */
const unchanging = () => () => {}

/**
 * Which of my games are ready to play on this computer (spec 7.7), by their
 * address: a file chosen for it that is still there, or one of its apps on
 * Steam installed. Null where Ready to play is not offered: in a browser, on
 * someone else's shelf, or in an app from before it. Undefined until known.
 *
 * What this computer has is read again when the window comes back to the
 * front (a game installed meanwhile) and when Play chooses or forgets a file;
 * my games' apps, once for each version of the library. The code that reads
 * them is fetched only here.
 */
export function useReadySlugs(
  mine: boolean,
  version: number,
): ReadonlySet<string> | null | undefined {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  const asking = app && mine
  const [games, setGames] = useState<PlayableGame[] | null>()
  const [here, setHere] = useState<OnThisComputer | null>()

  useEffect(() => {
    if (!asking) return
    let current = true
    import('@/features/desktop/playable')
      .then(({ readMyPlayable }) => readMyPlayable())
      .then(
        (list) => {
          if (current) setGames(list ?? null)
        },
        () => {
          if (current) setGames(null)
        },
      )
    return () => {
      current = false
    }
  }, [asking, version])

  useEffect(() => {
    if (!asking) return
    let current = true
    const read = () => {
      void import('@/features/desktop/playable')
        .then(({ readOnThisComputer }) => readOnThisComputer())
        .then((found) => {
          if (current) setHere(found ?? null)
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    read()
    window.addEventListener('focus', read)
    document.addEventListener('visibilitychange', onVisible)
    const stop = onLaunchersChange(read)
    return () => {
      current = false
      window.removeEventListener('focus', read)
      document.removeEventListener('visibilitychange', onVisible)
      stop()
    }
  }, [asking])

  return useMemo(() => {
    if (!asking || here === null || games === null) return null
    if (here === undefined || games === undefined) return undefined
    return readySlugs(games, here)
  }, [asking, here, games])
}
