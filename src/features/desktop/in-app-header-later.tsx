'use client'

import { type ComponentType, useEffect, useState } from 'react'

import { inDesktopApp } from './tauri'

/**
 * What the header draws in Shelf for Windows alone: where the saves go when it needs the person, an
 * update ready to go in, and the way to the
 * downloads. Their code and words are fetched only there (ADR 007, decision 4), as one file. Fetched
 * by hand, as every visitor's header carries this file, and `next/dynamic` would have the landing
 * page pay for what it never draws. `data-device` leaves it out of what `pnpm desktop:check` compares
 * with a plain browser, and `contents` leaves it out of the header's row.
 */
export function InAppHeader() {
  const [Fetched, setFetched] = useState<ComponentType>()
  useEffect(() => {
    if (!inDesktopApp()) return
    let current = true
    void import('./in-app-header').then((module) => {
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
