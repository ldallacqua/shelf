/**
 * The addresses of a shelf and its files (ADR 004), for pages drawn on the
 * server and in the browser alike. The shelf a page is part of comes from
 * `shelf.tsx`.
 */

/** Where a library's files come from: a public one's, cached by address, or one's own, fetched fresh. */
export type LibraryFiles = { kind: 'public'; key: string } | { kind: 'mine' }

export type ShelfInfo = {
  handle: string
  /** The account's name: "Ana's shelf". */
  name: string
  public: boolean
  files: LibraryFiles
}

/** The library file's address, for this version. One's own is fetched fresh, whatever the version. */
export const snapshotAddress = (files: LibraryFiles, version: number): string =>
  files.kind === 'public'
    ? `/api/v1/libraries/${files.key}/snapshot/${version}`
    : '/api/v1/me/library'

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

/** The handle of the shelf an address is in, `/u/{handle}/…`, without the language. */
export const handleIn = (pathname: string | undefined): string | undefined =>
  pathname?.match(/^(?:\/[a-zA-Z-]+)?\/u\/([^/?#]+)/)?.[1]
