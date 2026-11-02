'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'

import { DownloadSourcesGhost } from './download-sources-ghost'
import { inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const DownloadSources = dynamic(() => import('./download-sources'), {
  ssr: false,
  loading: () => <DownloadSourcesGhost />,
})

/**
 * Download sources (ADR 007), in Shelf for Windows alone. Its code is fetched only there, so a
 * browser's Settings pays for almost none of it and shows nothing of it. `data-device` leaves it
 * out of what `pnpm desktop:check` compares with a plain browser.
 */
export function DownloadSourcesInApp() {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  if (!app) return null
  return (
    <div data-device>
      <DownloadSources />
    </div>
  )
}
