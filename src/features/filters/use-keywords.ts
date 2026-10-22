'use client'

import { useEffect, useState } from 'react'

import { decodeKeywords, type KeywordsFile } from '@/domain/library/snapshot'
import type { GameKeywords } from '@/domain/query/evaluate'
import { keywordsAddress, type LibraryFiles } from '@/features/library/shelf-address'

/**
 * The keywords file: fetched the first time it is wanted (a filter asks for
 * a keyword, or the keyword list is opened), then kept for the visit. Like
 * the library file, its address carries the library's version; one's own
 * private library's is fetched fresh.
 */

const fetched = new Map<string, Promise<GameKeywords>>()

const load = (files: LibraryFiles, version: number): Promise<GameKeywords> => {
  const id = `${files.kind === 'public' ? files.key : 'mine'}:${version}`
  let file = fetched.get(id)
  if (!file) {
    file = fetch(keywordsAddress(files, version), {
      cache: files.kind === 'mine' ? 'no-store' : 'default',
    })
      .then((response) => {
        if (!response.ok) throw new Error(`The keywords file answered ${response.status}`)
        return response.json() as Promise<KeywordsFile>
      })
      .then(decodeKeywords)
    fetched.set(id, file)
    // A failed attempt is forgotten, so wanting it again tries again.
    file.catch(() => fetched.delete(id))
  }
  return file
}

export function useKeywords(
  files: LibraryFiles,
  version: number,
  wanted: boolean,
): GameKeywords | undefined {
  const [loaded, setLoaded] = useState<{ version: number; keywords: GameKeywords }>()

  useEffect(() => {
    if (!wanted || loaded?.version === version) return
    let current = true
    load(files, version)
      .then((keywords) => {
        if (current) setLoaded({ version, keywords })
      })
      .catch(() => {
        // Keyword filters match nothing until the file arrives; the panel says it is loading.
      })
    return () => {
      current = false
    }
    // A shelf's files are the same for as long as its page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, wanted, loaded?.version])

  return loaded?.version === version ? loaded.keywords : undefined
}
