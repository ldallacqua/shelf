'use client'

import dynamic from 'next/dynamic'
import { type ComponentProps, useEffect, useState, useSyncExternalStore } from 'react'

import { call, inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const FindDownload = dynamic(() => import('./find-download'), { ssr: false })

/** Its place in Play's menu. Its code and words are fetched only in the app, which alone draws that. */
export const FindDownloadItem = dynamic(
  () => import('./find-download').then((module) => module.FindDownloadItem),
  { ssr: false },
)

/**
 * Finding a download for a game (ADR 007), in Shelf for Windows alone. Its code and words are fetched
 * only there, and only once it is asked for.
 */
export function FindDownloadLater(props: ComponentProps<typeof FindDownload>) {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  return app ? <FindDownload {...props} /> : null
}

/**
 * Whether there is anything to look through. Nothing is offered for what may never come: most people
 * here have no source. It can't be told without asking, so it starts as no.
 */
export function useHasSources() {
  const [has, setHas] = useState(false)
  useEffect(() => {
    if (!inDesktopApp()) return
    let current = true
    call('download_sources')
      .then((kept) => {
        if (current) setHas(Array.isArray(kept) && kept.length > 0)
      })
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])
  return has
}
