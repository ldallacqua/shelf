'use client'

import dynamic from 'next/dynamic'
import { type ComponentProps, useEffect, useState, useSyncExternalStore } from 'react'

import { call, inDesktopApp } from './tauri'

const unchanging = () => () => undefined

const SavesPanel = dynamic(() => import('./saves-panel'), { ssr: false })

/** Its place in Play's menu. Its code and words are fetched only in the app, which alone draws that. */
export const SavesItem = dynamic(() => import('./saves-panel').then((module) => module.SavesItem), {
  ssr: false,
})

/**
 * A game's saves (ADR 008), in Shelf for Windows alone. Its code and words are fetched only there, and
 * only once it is asked for.
 */
export function SavesLater(props: ComponentProps<typeof SavesPanel>) {
  const app = useSyncExternalStore(unchanging, inDesktopApp, () => false)
  return app ? <SavesPanel {...props} /> : null
}

/**
 * Whether this app keeps saves at all: one older than 0.13.0 has no such commands, and nothing is
 * offered for what may never come. It can't be told without asking, so it starts as no.
 */
export function useSavesAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    if (!inDesktopApp()) return
    let current = true
    call('save_caps')
      .then(() => current && setAvailable(true))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [])
  return available
}
