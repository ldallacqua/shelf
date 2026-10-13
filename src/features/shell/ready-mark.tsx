'use client'

import { useEffect } from 'react'

/**
 * Marks the page as live: `data-ready` on <html>, two frames after React has
 * taken over.
 *
 * A control that remembers a choice (the theme picker, for one) is drawn by
 * the server in its default state and corrected the moment React starts. The
 * stylesheet holds all transitions until this mark appears, so that correction
 * is never seen as an animation. The two frames let the corrected state paint
 * first. Tests wait for the mark before they click anything.
 */
export function ReadyMark() {
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        document.documentElement.dataset.ready = 'true'
      })
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [])

  return null
}
