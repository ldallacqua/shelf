'use client'

import { ChevronLeftIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

/** What a game's address may carry over from the library it was opened on. */
const KEPT = ['q', 'sort', 'group', 'view', 'seed'] as const

/** The library's filter, sort and view in an address, as a query to carry on. */
export const keptQuery = (params: Pick<URLSearchParams, 'get'>): Record<string, string> =>
  Object.fromEntries(
    KEPT.flatMap((name) => {
      const value = params.get(name)
      return value ? [[name, value]] : []
    }),
  )

const CLASS =
  'inline-flex min-h-10 items-center gap-1.5 self-start rounded-control text-sm text-muted transition-colors duration-quick ease-settle hover:text-text pointer-coarse:min-h-11'

/** The way back to the library, from a game's own page. */
export function LibraryLink() {
  const t = useTranslations('Game')
  return (
    <Link href="/library" className={CLASS}>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {t('backToLibrary')}
    </Link>
  )
}

/**
 * The way back to the library, to the filter, sort and view a game was
 * opened on: a game opened over the shelf keeps the library's query string
 * in its address, so a shared address leads back to the same shelf. It reads
 * the address, so the page built ahead holds `LibraryLink` in its place.
 */
export function BackToLibrary() {
  const t = useTranslations('Game')
  const query = keptQuery(useSearchParams())
  return (
    <Link href={{ pathname: '/library', query }} className={CLASS}>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {t('backToLibrary')}
    </Link>
  )
}
