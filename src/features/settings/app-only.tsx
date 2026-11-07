'use client'

import { ChevronLeftIcon } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { type ComponentType, type ReactNode, useSyncExternalStore } from 'react'

import { SourceCardGhost, ThisComputerGhost } from '@/features/desktop/download-sources-ghost'
import { inDesktopApp } from '@/features/desktop/tauri'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Ghost, GhostText, Loading } from '@/ui/ghost'

import type { AppPage } from './pages'
import { SECTIONS, titleClass } from './settings-section'

const unchanging = () => () => undefined
const yes = () => true
const no = () => false

/** A section on its way: its title, a line of what it says, and what it holds. */
function SectionGhost({ children }: { children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <GhostText className="w-48 text-xl sm:text-2xl" />
      <GhostText className="w-full max-w-xl" />
      {children}
    </section>
  )
}

/**
 * A page of Shelf for Windows before its code and words are here: the title, then each section's
 * shape. Even the title is a ghost, as its words come with that code (`messages/app`).
 */
export function AppPageGhost({ page }: { page: AppPage }) {
  const t = useTranslations('Settings')
  return (
    <Loading label={t('loading')}>
      <div className={titleClass}>
        <GhostText className="w-56 text-3xl sm:text-5xl" />
      </div>
      <div className={`mt-8 ${SECTIONS}`}>
        {page === 'app' ? (
          <>
            <SectionGhost>
              <div className="flex items-center gap-3">
                <Ghost className="h-6 w-10 rounded-full" />
                <GhostText className="w-40 text-sm" />
              </div>
            </SectionGhost>
            <ThisComputerGhost />
          </>
        ) : (
          <SectionGhost>
            {page === 'download-sources' ? (
              <SourceCardGhost />
            ) : (
              <Ghost className="h-44 rounded-panel" />
            )}
          </SectionGhost>
        )}
      </div>
    </Loading>
  )
}

const inApp: Record<AppPage, ComponentType> = {
  app: dynamic(() => import('@/features/desktop/app-settings'), {
    ssr: false,
    loading: () => <AppPageGhost page="app" />,
  }),
  'download-sources': dynamic(() => import('@/features/desktop/download-sources'), {
    ssr: false,
    loading: () => <AppPageGhost page="download-sources" />,
  }),
  'download-services': dynamic(() => import('@/features/desktop/download-services'), {
    ssr: false,
    loading: () => <AppPageGhost page="download-services" />,
  }),
}

/** In a browser: whose page this is, and the way back to the rest of Settings. */
function NotInApp() {
  const t = useTranslations('Settings.appOnly')
  return (
    <div className="frameless:hidden">
      <h1 className={titleClass}>{t('title')}</h1>
      <div className="mt-8 grid max-w-xl justify-items-start gap-6">
        <p className="text-pretty">{t('body')}</p>
        <Button variant="secondary" asChild>
          <Link href="/settings">
            <ChevronLeftIcon aria-hidden="true" />
            {t('back')}
          </Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * One of Shelf for Windows' pages in Settings (issue 152). Its code and words are fetched only in
 * the app (ADR 007, decision 4); a browser that opens its address is told whose page it is rather
 * than shown "not found". The app's mark on `<html>` (`frameless`) chooses between the two before
 * the first paint. `data-device` leaves it out of what `pnpm desktop:check` compares.
 */
export function AppOnly({ page }: { page: AppPage }) {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  const alive = useSyncExternalStore(unchanging, yes, no)
  const Page = inApp[page]
  return (
    <div data-device>
      {app ? (
        <Page />
      ) : (
        <>
          <NotInApp />
          {/* Alive in a browser, the place held for the app is let go: nothing of it is coming. */}
          {alive ? null : (
            <div className="hidden frameless:block">
              <AppPageGhost page={page} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
