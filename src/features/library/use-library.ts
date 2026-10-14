'use client'

import { startTransition, useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import { decodeLibrary, type SnapshotFile } from '@/domain/library/snapshot'

/**
 * Fetches the library file: the whole library, once, cached by its version.
 * Every filter, sort and regroup after that happens on the device.
 */

const files = new Map<number, Promise<Library>>()

const load = (version: number): Promise<Library> => {
  let file = files.get(version)
  if (!file) {
    file = fetch(`/api/v1/library/snapshot/${version}`)
      .then((response) => {
        if (!response.ok) throw new Error(`The library file answered ${response.status}`)
        return response.json() as Promise<SnapshotFile>
      })
      .then(decodeLibrary)
    files.set(version, file)
    // A failed attempt is forgotten, so "Try again" really tries again.
    file.catch(() => files.delete(version))
  }
  return file
}

export type LibraryState =
  | { status: 'loading' }
  | { status: 'ready'; library: Library }
  | { status: 'failed'; retry: () => void }

/** Lets the browser draw a frame and answer a touch before the next piece of work. */
const nextTurn = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/**
 * `prepare` is given the library when it arrives, in a turn of its own,
 * before anything is drawn from it: the place for work that drawing would
 * otherwise have to stop for, such as arranging the shelves.
 */
export function useLibrary(version: number, prepare?: (library: Library) => void): LibraryState {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; library?: Library; failed?: boolean }>()
  const key = `${version}:${attempt}`

  useEffect(() => {
    let current = true
    load(version)
      .then(async (library) => {
        if (!current) return
        await nextTurn()
        prepare?.(library)
        await nextTurn()
        // The first screen is already drawn and usable. Filling in the rest
        // is not urgent, so React may do it in small pieces between other
        // work, and a tap that lands meanwhile is answered first.
        if (current) startTransition(() => setResult({ key, library }))
      })
      .catch(() => current && setResult({ key, failed: true }))
    return () => {
      current = false
    }
    // `prepare` is whatever it was when the request was made: it only saves work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key])

  // An answer for an earlier version or attempt is not this one's answer.
  if (result?.key !== key) return { status: 'loading' }
  if (result.library) return { status: 'ready', library: result.library }
  return { status: 'failed', retry: () => setAttempt((count) => count + 1) }
}
