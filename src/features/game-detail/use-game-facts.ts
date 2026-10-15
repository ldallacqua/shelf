'use client'

import { useEffect, useState } from 'react'

import type { GameFacts } from '@/domain/library/game-page'

/**
 * A game's facts, for the game opened over the shelf: what its page shows
 * beyond the library file. Fetched once per game and library version, and
 * kept for as long as the page is open; the browser keeps the file for a
 * year, so a game opened again on a later visit costs nothing.
 */

const files = new Map<string, Promise<GameFacts>>()
/** The ones that have arrived, so a game opened again is drawn whole at once. */
const arrived = new Map<string, GameFacts>()

const addressOf = (version: number, slug: string) =>
  `/api/v1/library/games/${version}/${encodeURIComponent(slug)}`

const load = (version: number, slug: string): Promise<GameFacts> => {
  const address = addressOf(version, slug)
  let file = files.get(address)
  if (!file) {
    file = fetch(address)
      .then((response) => {
        if (!response.ok) throw new Error(`A game's facts answered ${response.status}`)
        return response.json() as Promise<GameFacts>
      })
      .then((facts) => {
        arrived.set(address, facts)
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

export function useGameFacts(version: number, slug: string | undefined): FactsState {
  const [result, setResult] = useState<{ key: string; facts?: GameFacts }>()
  const key = slug ? addressOf(version, slug) : ''

  useEffect(() => {
    if (!slug) return
    let current = true
    load(version, slug)
      .then((facts) => current && setResult({ key, facts }))
      .catch(() => current && setResult({ key }))
    return () => {
      current = false
    }
  }, [version, slug, key])

  const known = arrived.get(key)
  if (known) return { status: 'ready', facts: known }
  if (!slug || result?.key !== key) return { status: 'loading' }
  return result.facts ? { status: 'ready', facts: result.facts } : { status: 'failed' }
}
