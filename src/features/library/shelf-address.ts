/**
 * The addresses of a shelf and its files (ADR 004), for pages drawn on the
 * server and in the browser alike. The shelf a page is part of comes from
 * `shelf.tsx`.
 */

import { libraryFilePath } from '@/domain/library/file-address'

/** Where a library's files come from: a public one's, cached by address, or one's own, fetched fresh. */
export type LibraryFiles = { kind: 'public'; key: string } | { kind: 'mine' }

export type ShelfInfo = {
  handle: string
  /** The account's name: "Ana's shelf". */
  name: string
  public: boolean
  files: LibraryFiles
}

/**
 * The library file's address, for this version and the file's revision. One's own is fetched
 * fresh, whatever the version.
 */
export const snapshotAddress = (files: LibraryFiles, version: number): string =>
  files.kind === 'public' ? libraryFilePath(files.key, version) : '/api/v1/me/library'

/** A game's facts' address, for this version. */
export const factsAddress = (files: LibraryFiles, version: number, slug: string): string =>
  files.kind === 'public'
    ? `/api/v1/libraries/${files.key}/games/${version}/${encodeURIComponent(slug)}`
    : `/api/v1/me/games/${encodeURIComponent(slug)}`

/** The keywords file's address, for this version. */
export const keywordsAddress = (files: LibraryFiles, version: number): string =>
  files.kind === 'public'
    ? `/api/v1/libraries/${files.key}/keywords/${version}`
    : '/api/v1/me/keywords'

/**
 * No shelf's pages are built ahead: each is built on its first visit, from
 * the frame built for this handle, and kept until its library changes. Cache
 * Components needs one handle to build that frame from, and `none` is no
 * shelf's: it is reserved.
 */
export const NO_HANDLE = 'none'

/* The addresses inside a shelf, for `Link` and the router. */

type Query = Record<string, string>

export const libraryHref = (handle: string, query?: Query) => ({
  pathname: '/u/[handle]' as const,
  params: { handle },
  ...(query ? { query } : {}),
})

export const gameHref = (handle: string, slug: string, query?: Query) => ({
  pathname: '/u/[handle]/game/[slug]' as const,
  params: { handle, slug },
  ...(query ? { query } : {}),
})

export const smartShelfHref = (handle: string, slug: string) => ({
  pathname: '/u/[handle]/shelves/[slug]' as const,
  params: { handle, slug },
})

export const trophiesHref = (handle: string, query?: Query) => ({
  pathname: '/u/[handle]/trophies' as const,
  params: { handle },
  ...(query && Object.keys(query).length > 0 ? { query } : {}),
})
