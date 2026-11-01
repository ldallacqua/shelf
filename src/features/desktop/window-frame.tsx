'use client'

import { useEffect } from 'react'

import { framelessWindow, inDesktopApp } from './tauri'

/**
 * In Shelf for Windows' window without a bar, fetches what makes the header
 * the bar (`frame.ts`) and starts it, and whatever window of the app it is
 * in, what sends Shelf what the app counted (`send-played.ts`). Only there: a
 * visitor's page carries none of it.
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
  useEffect(() => {
    if (!inDesktopApp()) return
    let current = true
    let stop: (() => void) | undefined
    void import('./send-played').then(({ startSendingPlayed }) => {
      if (current) stop = startSendingPlayed()
    })
    return () => {
      current = false
      stop?.()
    }
  }, [])
  return null
}
