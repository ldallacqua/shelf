'use client'

import { useEffect, useState } from 'react'

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

export function useLibrary(version: number): LibraryState {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; library?: Library; failed?: boolean }>()
  const key = `${version}:${attempt}`

  useEffect(() => {
    let current = true
    load(version).then(
      (library) => current && setResult({ key, library }),
      () => current && setResult({ key, failed: true }),
    )
    return () => {
      current = false
    }
  }, [version, key])

  // An answer for an earlier version or attempt is not this one's answer.
  if (result?.key !== key) return { status: 'loading' }
  if (result.library) return { status: 'ready', library: result.library }
  return { status: 'failed', retry: () => setAttempt((count) => count + 1) }
}
