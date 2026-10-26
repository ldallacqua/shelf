'use client'

import { useEffect } from 'react'

import { framelessWindow } from './tauri'

/**
 * In Shelf for Windows' window without a bar, fetches what makes the header
 * the bar (`frame.ts`) and starts it. Only there: a visitor's page carries
 * none of it.
 */
export function WindowFrame() {
  useEffect(() => {
    if (!framelessWindow()) return
    let current = true
    let stop: (() => void) | undefined
    void import('./frame').then(({ startWindowFrame }) => {
      if (current) stop = startWindowFrame()
    })
    return () => {
      current = false
      stop?.()
    }
  }, [])
  return null
}
