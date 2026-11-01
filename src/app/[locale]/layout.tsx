import type { Metadata, Viewport } from 'next'
import { hasLocale, NextIntlClientProvider } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'

import {
  addGameAction,
  groupingAction,
  addSteamGameAction,
  searchGamesAction,
  steamLinkAction,
  undoAddAction,
} from '@/app/actions/games'
import { WindowScript } from '@/features/desktop/window-script'
import { PreferenceScript } from '@/features/library/preference-script'
import { Footer } from '@/features/shell/footer'
import { Header } from '@/features/shell/header'
import { NavigationProgress } from '@/features/shell/navigation-progress'
import { Notices } from '@/features/shell/notices'
import { ReadyMark } from '@/features/shell/ready-mark'
import { MAIN_ID, SkipLink } from '@/features/shell/skip-link'
import { ZodScript } from '@/features/shell/zod-script'
import { ThemeScript } from '@/features/theme/theme-script'
import { AccountHintScript } from '@/features/owner/account-hint'
import { routing } from '@/i18n/routing'
import { siteUrl } from '@/server/site-url'
import { fontVariables } from '@/ui/fonts'
import { TipProvider } from '@/ui/tooltip'

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
    // Open to search engines since the landing page (step 8). A page that must
    // not be listed, such as a private shelf, says so in its own metadata.
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
        <AccountHintScript />
        <PreferenceScript />
        <WindowScript />
        <ZodScript />
      </head>
      <body>
        <ReadyMark />
        <NextIntlClientProvider>
          <TipProvider>
            <SkipLink />
            <Header
              // Handed to everyone, shown only once the browser knows the owner is
              // here, and checked again on the server whoever calls them.
              add={{
                search: searchGamesAction,
                grouping: groupingAction,
                add: addGameAction,
                undo: undoAddAction,
                steamLink: steamLinkAction,
                addSteam: addSteamGameAction,
              }}
            />
            <main id={MAIN_ID} tabIndex={-1} className="flex-1 outline-none">
              {children}
            </main>
            <Footer />
            <Notices />
            {/* Over everything, sheets too: a link in one can lead to a page that takes a while. */}
            <NavigationProgress />
          </TipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
