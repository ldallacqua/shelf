'use client'

import { SearchIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { libraryHref } from '@/features/library/shelf-address'
import { getPathname } from '@/i18n/navigation'

import { useNavHandle, useOwnHandle } from './nav-handle'

function SearchForm({ handle }: { handle?: string }) {
  const t = useTranslations('Filters')
  const locale = useLocale()

  if (!handle) return null
  return (
    <form
      role="search"
      method="get"
      action={getPathname({ href: libraryHref(handle), locale })}
      className="site-search relative hidden w-56 items-center self-center lg:flex"
    >
      <label htmlFor="site-search" className="sr-only">
        {t('search.label')}
      </label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-3 size-4 text-muted"
      />
      <input
        id="site-search"
        name="q"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        placeholder={t('search.short')}
        className="h-9 w-full rounded-control border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
      />
    </form>
  )
}

function SearchForPage() {
  return <SearchForm handle={useNavHandle()} />
}

function SearchForAccount() {
  return <SearchForm handle={useOwnHandle()} />
}

/**
 * The search field in the header (spec 2), on every page of a shelf that is
 * not its library, and elsewhere for one's own: a plain form that opens the
 * library with the search in its address, so it works before any script has
 * loaded. On the library and on a smart shelf the library's own field, which
 * filters as you type, takes its place (`site-search` in globals.css).
 */
export function HeaderSearch() {
  return (
    <Suspense fallback={<SearchForAccount />}>
      <SearchForPage />
    </Suspense>
  )
}
