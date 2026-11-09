'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { MouseEvent } from 'react'

import { libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'

/** The browser's list of this tab's pages, where it has one (`window.navigation`). */
type Entries = { currentEntry: { index: number } | null; entries: () => { url: string | null }[] }

/**
 * A shelf's library or one of its smart shelves, in any language, and whose:
 * `/en/u/ana`, `/en/u/ana/shelves/rpgs`.
 */
const LIBRARY = /^\/[^/]+\/u\/([^/]+)(?:\/shelves\/[^/]+)?\/?$/

/**
 * Whether the page before this one in the tab is this shelf's library. Back
 * then shows it as it was left, kept by the router with its arrangement, its
 * scroll and its focus; a new visit would draw it again from the top.
 */
const backIsLibrary = (handle: string): boolean => {
  const navigation = (window as { navigation?: Entries }).navigation
  const index = navigation?.currentEntry?.index
  if (!navigation || index === undefined || index < 1) return false
  const before = navigation.entries()[index - 1]?.url
  if (!before) return false
  const { origin, pathname } = new URL(before)
  return origin === window.location.origin && LIBRARY.exec(pathname)?.[1] === handle
}

/** A plain click goes back when it can; one asking for a new tab or window is the link's. */
const goBack = (handle: string) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  if (!backIsLibrary(handle)) return
  event.preventDefault()
  window.history.back()
}

/**
 * The way back to the shelf's library, from a game's page: Back, when the
 * library is the page before; otherwise the library, which draws itself as
 * this device last arranged it (issue 149). A game's address carries none of
 * the library's arrangement (ADR 009, phase 1).
 */
export function LibraryLink({ handle }: { handle: string }) {
  const t = useTranslations('Game')
  return (
    <Link
      href={libraryHref(handle)}
      className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-control text-sm text-muted transition-colors duration-quick ease-settle hover:text-text pointer-coarse:min-h-11"
      onClick={goBack(handle)}
    >
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {t('backToLibrary')}
    </Link>
  )
}
