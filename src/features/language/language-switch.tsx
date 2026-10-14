'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useParams, useSearchParams } from 'next/navigation'
import { Suspense, type ComponentProps } from 'react'

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

type SwitchLinkProps = {
  /** The page to open in the other language. Defaults to the home page. */
  pathname?: Pathname
  /** The page's own part of the address, such as a shelf's slug. */
  slug?: string
  query?: Record<string, string>
}

type Href = ComponentProps<typeof Link>['href']

/** A page's address, with its slug where it has one. Without the slug, the library. */
const hrefFor = (
  pathname: Pathname,
  slug: string | undefined,
  query?: Record<string, string>,
): Href => {
  if (pathname === '/shelves/[slug]') {
    return slug ? { pathname, params: { slug }, query } : { pathname: '/library', query }
  }
  return { pathname, query }
}

function SwitchLink({ pathname = '/', slug, query }: SwitchLinkProps) {
  const t = useTranslations('Language')
  const target = otherLocale(useLocale())
  const label = localeLabels[target]

  return (
    <Link
      href={hrefFor(pathname, slug, query)}
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
function SwitchLinkWithQuery({ pathname, slug }: { pathname: Pathname; slug?: string }) {
  return (
    <SwitchLink pathname={pathname} slug={slug} query={Object.fromEntries(useSearchParams())} />
  )
}

/** Knows the page. On an address that is not a page, it offers the home page. */
function SwitchLinkForPage() {
  const current = usePathname()
  const params = useParams<{ slug?: string }>()
  const pathname = isPage(current) ? current : '/'
  const slug = typeof params?.slug === 'string' ? params.slug : undefined

  return (
    <Suspense fallback={<SwitchLink pathname={pathname} slug={slug} />}>
      <SwitchLinkWithQuery pathname={pathname} slug={slug} />
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
