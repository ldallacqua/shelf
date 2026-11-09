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

/** One of a shelf's games, in any language, and whose: `/en/u/ana/game/hades`. */
const GAME = /^\/[^/]+\/u\/([^/]+)\/game\/[^/]+\/?$/

/**
 * How many steps back this shelf's library is in the tab, past the shelf's
 * games opened on the way from it (from the list beside them): none when
 * anything else stands between. Back then shows it as it was left, kept by
 * the router with its arrangement, its scroll and its focus; a new visit
 * would draw it again from the top.
 */
const stepsToLibrary = (handle: string): number | undefined => {
  const navigation = (window as { navigation?: Entries }).navigation
  const index = navigation?.currentEntry?.index
  if (!navigation || index === undefined) return undefined
  const entries = navigation.entries()
  for (let at = index - 1; at >= 0; at -= 1) {
    const url = entries[at]?.url
    if (!url) return undefined
    const { origin, pathname } = new URL(url)
    if (origin !== window.location.origin) return undefined
    if (LIBRARY.exec(pathname)?.[1] === handle) return index - at
    if (GAME.exec(pathname)?.[1] !== handle) return undefined
  }
  return undefined
}

/** A plain click goes back when it can; one asking for a new tab or window is the link's. */
const goBack = (handle: string) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const steps = stepsToLibrary(handle)
  if (steps === undefined) return
  event.preventDefault()
  window.history.go(-steps)
}

/**
 * The way back to the shelf's library, from a game's page: Back, when the
 * library is where the tab came from, through this shelf's games only;
 * otherwise the library, which draws itself as this device last arranged it
 * (issue 149). A game's address carries none of the library's arrangement
 * (ADR 009, phase 1).
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
