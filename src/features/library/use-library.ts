'use client'

import { startTransition, useEffect, useState } from 'react'

import type { Library } from '@/domain/library/library'
import { decodeLibrary, type SnapshotFile } from '@/domain/library/snapshot'

import { snapshotAddress, type LibraryFiles } from './shelf-address'

/**
 * Fetches the library file: the whole library, once, cached by its version.
 * Every filter, sort and regroup after that happens on the device. One's own
 * private library is fetched fresh for each version (ADR 004), and kept in
 * memory only for as long as the page is open.
 */

const fetched = new Map<string, Promise<Library>>()

/** How long to wait before asking again for a version the server is still making. */
const AGAIN_MS = [250, 500, 1000, 2000]

const fetchFile = async (files: LibraryFiles, version: number): Promise<Library> => {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(snapshotAddress(files, version), {
      cache: files.kind === 'mine' ? 'no-store' : 'default',
    })
    if (!response.ok) throw new Error(`The library file answered ${response.status}`)
    const library = decodeLibrary((await response.json()) as SnapshotFile)
    // Right after a write the server may still send the new version's address on to the
    // version before it, while it makes the new file in the background; a moment later it
    // has it. Taking the older file would show the shelf as it was before the change. One's
    // own file is read fresh, not by version.
    const wait = AGAIN_MS[attempt]
    if (files.kind === 'mine' || library.version >= version || wait === undefined) return library
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

/** The library file for a version: fetched once, and kept while the page is open. */
export const load = (files: LibraryFiles, version: number): Promise<Library> => {
  const id = `${files.kind === 'public' ? files.key : 'mine'}:${version}`
  let file = fetched.get(id)
  if (!file) {
    file = fetchFile(files, version)
    fetched.set(id, file)
    // A failed attempt is forgotten, so "Try again" really tries again.
    file.catch(() => fetched.delete(id))
  }
  return file
}

/** One's own library, fetched fresh: what a private shelf's page starts from. */
export const loadMine = (): Promise<Library> => load({ kind: 'mine' }, Date.now())

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
export function useLibrary(
  files: LibraryFiles,
  version: number,
  prepare?: (library: Library) => void,
): LibraryState {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; library?: Library; failed?: boolean }>()
  const key = `${version}:${attempt}`

  useEffect(() => {
    let current = true
    load(files, version)
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
    // A shelf's files are the same for as long as its page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, key])

  // While a newer version is on its way (a game was just added or changed),
  // the shelf keeps the library it has, rather than falling back to its
  // first screen; the new one replaces it when it arrives.
  const [shown, setShown] = useState<Library>()
  if (result?.key === key && result.library && result.library !== shown) setShown(result.library)

  // An answer for an earlier version or attempt is not this one's answer.
  if (result?.key !== key)
    return shown ? { status: 'ready', library: shown } : { status: 'loading' }
  if (result.library) return { status: 'ready', library: result.library }
  return { status: 'failed', retry: () => setAttempt((count) => count + 1) }
}
