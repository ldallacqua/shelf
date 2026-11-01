import { callApi } from '@/features/owner/call-api'
import { announceChange } from '@/features/owner/library-change'

import { desktop } from './bridge'

/** How often the page asks the app for what has ended, with the window open. */
const EVERY_MS = 60_000

/**
 * Sends Shelf what Shelf for Windows counted (ADR 005, section 12): the app has no way to Shelf
 * but its pages. What the server keeps the app lets go of; everything else it holds and offers
 * again, so a page closed or a network gone loses nothing. Returns what stops it.
 */
export const startSendingPlayed = (): (() => void) => {
  let sending = false
  const send = async () => {
    if (sending) return
    sending = true
    try {
      // An app older than these commands refuses, and there is nothing to send.
      const sessions = await desktop.playSessions().catch(() => [])
      if (sessions.length === 0) return
      const answer = await callApi<{ kept: string[]; version: number }>(
        'POST',
        '/api/v1/me/play/sessions',
        { sessions },
      )
      if (!answer.ok) return
      await desktop.playSessionsKept(answer.value.kept)
      if (answer.value.kept.length > 0) announceChange({ version: answer.value.version })
    } finally {
      sending = false
    }
  }
  const look = () => void send()
  look()
  const timer = setInterval(look, EVERY_MS)
  window.addEventListener('focus', look)
  return () => {
    clearInterval(timer)
    window.removeEventListener('focus', look)
  }
}
