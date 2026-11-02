'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'

import { inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const FindDownload = dynamic(() => import('./find-download'), { ssr: false })

/**
 * Finding a download for a game (ADR 007), in Shelf for Windows alone. Its code and words are fetched
 * only there, and nothing stands in for it while they come: most people will have no source to search.
 */
export function FindDownloadLater({ title, entryId }: { title: string; entryId: string }) {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  return app ? <FindDownload title={title} entryId={entryId} /> : null
}
