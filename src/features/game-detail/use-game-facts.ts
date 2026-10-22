'use client'

import { useEffect, useState } from 'react'

import type { GameFacts } from '@/domain/library/game-page'
import { factsAddress, type LibraryFiles } from '@/features/library/shelf-address'

/**
 * A game's facts, for the game opened over the shelf: what its page shows
 * beyond the library file. Fetched once per game and library version, and
 * kept for as long as the page is open; the browser keeps a public
 * library's file for a year, so a game opened again on a later visit costs
 * nothing. One's own private library's are fetched fresh (ADR 004).
 */

const files = new Map<string, Promise<GameFacts>>()
/** The ones that have arrived, so a game opened again is drawn whole at once. */
const arrived = new Map<string, GameFacts>()
/**
 * Each game's newest facts in each library, of whichever version. A change
 * to the library is a new version, whose facts are fetched again; until
 * they are in, the game keeps the ones it has rather than going back to
 * ghosts. Never another library's: its notes are its own.
 */
const newest = new Map<string, { version: number; facts: GameFacts }>()

/** What a game's facts are known by here: its library's files, its version and the game. */
const addressOf = (shelf: LibraryFiles, version: number, slug: string) =>
  shelf.kind === 'public' ? factsAddress(shelf, version, slug) : `mine:${version}:${slug}`

/** A game in a library, whatever the version. */
const gameIn = (shelf: LibraryFiles, slug: string) =>
  `${shelf.kind === 'public' ? shelf.key : 'mine'}:${slug}`

const load = (shelf: LibraryFiles, version: number, slug: string): Promise<GameFacts> => {
  const address = addressOf(shelf, version, slug)
  let file = files.get(address)
  if (!file) {
    file = fetch(factsAddress(shelf, version, slug), {
      cache: shelf.kind === 'mine' ? 'no-store' : 'default',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`A game's facts answered ${response.status}`)
        return response.json() as Promise<GameFacts>
      })
      .then((facts) => {
        arrived.set(address, facts)
        const game = gameIn(shelf, slug)
        if ((newest.get(game)?.version ?? -1) <= version) newest.set(game, { version, facts })
        return facts
      })
    files.set(address, file)
    // A failed attempt is forgotten, so opening the game again tries again.
    file.catch(() => files.delete(address))
  }
  return file
}

export type FactsState =
  { status: 'loading' } | { status: 'ready'; facts: GameFacts } | { status: 'failed' }

export function useGameFacts(
  shelf: LibraryFiles,
  version: number,
  slug: string | undefined,
): FactsState {
  const [result, setResult] = useState<{ key: string; facts?: GameFacts }>()
  const key = slug ? addressOf(shelf, version, slug) : ''

  useEffect(() => {
    if (!slug) return
    let current = true
    load(shelf, version, slug)
      .then((facts) => current && setResult({ key, facts }))
      .catch(() => current && setResult({ key }))
    return () => {
      current = false
    }
    // A shelf's files are the same for as long as its page is open; `key` names them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, slug, key])

  const known = arrived.get(key)
  if (known) return { status: 'ready', facts: known }
  if (result?.key === key && result.facts) return { status: 'ready', facts: result.facts }
  const earlier = slug ? newest.get(gameIn(shelf, slug))?.facts : undefined
  if (earlier) return { status: 'ready', facts: earlier }
  if (!slug || result?.key !== key) return { status: 'loading' }
  return { status: 'failed' }
}
