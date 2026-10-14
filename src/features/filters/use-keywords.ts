'use client'

import { useEffect, useState } from 'react'

import { decodeKeywords, type KeywordsFile } from '@/domain/library/snapshot'
import type { GameKeywords } from '@/domain/query/evaluate'

/**
 * The keywords file: fetched the first time it is wanted (a filter asks for
 * a keyword, or the keyword list is opened), then kept for the visit. Like
 * the library file, its address carries the library's version.
 */

const files = new Map<number, Promise<GameKeywords>>()

const load = (version: number): Promise<GameKeywords> => {
  let file = files.get(version)
  if (!file) {
    file = fetch(`/api/v1/library/keywords/${version}`)
      .then((response) => {
        if (!response.ok) throw new Error(`The keywords file answered ${response.status}`)
        return response.json() as Promise<KeywordsFile>
      })
      .then(decodeKeywords)
    files.set(version, file)
    // A failed attempt is forgotten, so wanting it again tries again.
    file.catch(() => files.delete(version))
  }
  return file
}

export function useKeywords(version: number, wanted: boolean): GameKeywords | undefined {
  const [loaded, setLoaded] = useState<{ version: number; keywords: GameKeywords }>()

  useEffect(() => {
    if (!wanted || loaded?.version === version) return
    let current = true
    load(version)
      .then((keywords) => {
        if (current) setLoaded({ version, keywords })
      })
      .catch(() => {
        // Keyword filters match nothing until the file arrives; the panel says it is loading.
      })
    return () => {
      current = false
    }
  }, [version, wanted, loaded?.version])

  return loaded?.version === version ? loaded.keywords : undefined
}
