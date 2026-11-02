'use client'

import { type ComponentType, useEffect, useState } from 'react'

import { inDesktopApp } from './tauri'

/**
 * The way to the downloads, in the header, in Shelf for Windows alone. Its code and words are fetched only
 * there (ADR 007, decision 4). Fetched by hand, as every visitor's header carries this file, and `next/dynamic`
 * would have the landing page pay for what it never draws. `data-device` leaves it out of what
 * `pnpm desktop:check` compares with a plain browser, and `contents` leaves it out of the header's row.
 */
export function DownloadsLinkInApp() {
  const [Fetched, setFetched] = useState<ComponentType>()
  useEffect(() => {
    if (!inDesktopApp()) return
    let current = true
    void import('./downloads-link').then((module) => {
      if (current) setFetched(() => module.default)
    })
    return () => {
      current = false
    }
  }, [])
  if (!Fetched) return null
  return (
    <div data-device className="contents">
      <Fetched />
    </div>
  )
}
