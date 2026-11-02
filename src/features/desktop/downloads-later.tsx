'use client'

import dynamic from 'next/dynamic'
import { useEffect, useSyncExternalStore } from 'react'

import { useRouter } from '@/i18n/navigation'
import { Ghosts } from '@/ui/ghosts'

import { inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const DownloadsLink = dynamic(() => import('./downloads-link'), { ssr: false })
const DownloadsPage = dynamic(() => import('./downloads-page'), {
  ssr: false,
  loading: () => <Ghosts lines={3} className="mt-14 max-w-xl" />,
})

/**
 * The way to the downloads, in the header, in Shelf for Windows alone. Its code and words are fetched only
 * there (ADR 007, decision 4). `data-device` leaves it out of what `pnpm desktop:check` compares with a
 * plain browser, and `contents` leaves it out of the header's row.
 */
export function DownloadsLinkInApp() {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  if (!app) return null
  return (
    <div data-device className="contents">
      <DownloadsLink />
    </div>
  )
}

/** The page. In a browser there is nothing here to download with, and nowhere to say so: it goes home. */
export function DownloadsPageInApp() {
  const router = useRouter()
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => true)
  useEffect(() => {
    if (!inDesktopApp()) router.replace('/')
  }, [router])
  return app ? <DownloadsPage /> : null
}
