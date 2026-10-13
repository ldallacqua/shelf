import type { Metadata, Viewport } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import { Footer } from '@/features/shell/footer'
import { Header } from '@/features/shell/header'
import { ReadyMark } from '@/features/shell/ready-mark'
import { MAIN_ID, SkipLink } from '@/features/shell/skip-link'
import { ThemeScript } from '@/features/theme/theme-script'
import { routing } from '@/i18n/routing'
import { siteUrl } from '@/server/site-url'
import { fontVariables } from '@/ui/fonts'

import '../globals.css'

// Both languages are built ahead of time for every page under this layout.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: LayoutProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'Meta' })

  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t('siteName'), template: `%s · ${t('siteName')}` },
    description: t('description'),
    applicationName: t('siteName'),
    // The site opens to search engines with the landing page, at build step 8.
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
}

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  return (
    // The theme script sets data-theme on <html> before React starts, which
    // React would otherwise report as a mismatch.
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <ReadyMark />
        <NextIntlClientProvider>
          <SkipLink />
          <Header />
          <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <Footer />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
