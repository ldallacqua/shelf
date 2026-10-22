'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, type ComponentProps } from 'react'

import { libraryHref } from '@/features/library/shelf-address'
import { Link, usePathname } from '@/i18n/navigation'
import { localeLabels, routing, type Locale, type Pathname } from '@/i18n/routing'
import { buttonVariants } from '@/ui/button'
import { cn } from '@/ui/cn'

function otherLocale(current: Locale): Locale {
  return routing.locales.find((locale) => locale !== current) ?? routing.defaultLocale
}

function isPage(pathname: string): pathname is Pathname {
  return pathname in routing.pathnames
}

/** The page's own parts of the address: a shelf's handle, and a game's or smart shelf's slug. */
type Params = { handle?: string; slug?: string }

type SwitchLinkProps = {
  /** The page to open in the other language. Defaults to the home page. */
  pathname?: Pathname
  params?: Params
  query?: Record<string, string>
}

type Href = ComponentProps<typeof Link>['href']

/**
 * A page's address, with its handle and slug where it has them. Without the
 * slug, the shelf's library; without the handle, the home page.
 */
const hrefFor = (
  pathname: Pathname,
  { handle, slug }: Params,
  query?: Record<string, string>,
): Href => {
  if (pathname === '/u/[handle]/shelves/[slug]' || pathname === '/u/[handle]/game/[slug]') {
    if (handle && slug) return { pathname, params: { handle, slug }, query }
    return handle ? libraryHref(handle, query) : { pathname: '/', query }
  }
  if (pathname === '/u/[handle]' || pathname === '/u/[handle]/trophies') {
    return handle ? { pathname, params: { handle }, query } : { pathname: '/', query }
  }
  return { pathname, query }
}

function SwitchLink({ pathname = '/', params = {}, query }: SwitchLinkProps) {
  const t = useTranslations('Language')
  const target = otherLocale(useLocale())
  const label = localeLabels[target]

  return (
    <Link
      href={hrefFor(pathname, params, query)}
      locale={target}
      // Stay where the visitor is on the page.
      scroll={false}
      hrefLang={target}
      lang={target}
      title={t('label')}
      aria-label={`${label.short}: ${label.name}`}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'font-semibold')}
    >
      {label.short}
    </Link>
  )
}

/** Knows the page and its filters. */
function SwitchLinkWithQuery({ pathname, params }: { pathname: Pathname; params: Params }) {
  return (
    <SwitchLink pathname={pathname} params={params} query={Object.fromEntries(useSearchParams())} />
  )
}

const paramOf = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

/** Knows the page. On an address that is not a page, it offers the home page. */
function SwitchLinkForPage() {
  const current = usePathname()
  const found = useParams<{ handle?: string; slug?: string }>()
  const pathname = isPage(current) ? current : '/'
  const params = { handle: paramOf(found?.handle), slug: paramOf(found?.slug) }

  return (
    <Suspense fallback={<SwitchLink pathname={pathname} params={params} />}>
      <SwitchLinkWithQuery pathname={pathname} params={params} />
    </Suspense>
  )
}

/**
 * A link to this same page in the other language, with the same filters.
 *
 * It is a real link, so it works before JavaScript loads and a crawler can
 * follow it. What it knows arrives in layers: the page is known when the page
 * is built, the filters only in the browser. Each layer has a plainer link to
 * show until the next one is ready.
 */
export function LanguageSwitch() {
  return (
    <Suspense fallback={<SwitchLink />}>
      <SwitchLinkForPage />
    </Suspense>
  )
}
