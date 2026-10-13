'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

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
  query?: Record<string, string>
}

function SwitchLink({ pathname = '/', query }: SwitchLinkProps) {
  const t = useTranslations('Language')
  const target = otherLocale(useLocale())
  const label = localeLabels[target]

  return (
    <Link
      href={{ pathname, query }}
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
function SwitchLinkWithQuery({ pathname }: { pathname: Pathname }) {
  return <SwitchLink pathname={pathname} query={Object.fromEntries(useSearchParams())} />
}

/** Knows the page. On an address that is not a page, it offers the home page. */
function SwitchLinkForPage() {
  const current = usePathname()
  const pathname = isPage(current) ? current : '/'

  return (
    <Suspense fallback={<SwitchLink pathname={pathname} />}>
      <SwitchLinkWithQuery pathname={pathname} />
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
