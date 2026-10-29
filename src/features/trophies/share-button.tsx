'use client'

import { useTranslations } from 'next-intl'
import { useState, useSyncExternalStore } from 'react'

import { Button } from '@/ui/button'

const nothing = () => () => undefined

/** Whether this browser can hand a link to the device's own sharing: a phone's, mostly. */
const useCanShare = () =>
  useSyncExternalStore(
    nothing,
    () => typeof navigator.share === 'function',
    () => false,
  )

/**
 * The page's link, handed to the device's sharing where it has one and copied
 * otherwise, with what happened said aloud. The page's own address, so a
 * year's page is shared as that year.
 */
export function ShareButton() {
  const t = useTranslations('Trophies.share')
  const canShare = useCanShare()
  const [said, setSaid] = useState<'copied' | 'failed'>()

  const share = async () => {
    const url = window.location.href
    if (canShare) {
      // Closing the device's sheet is a choice, not a failure.
      await navigator.share({ title: document.title, url }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setSaid('copied')
    } catch {
      setSaid('failed')
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={share}>
        {canShare ? t('share') : t('copy')}
      </Button>
      <span role="status" className="readout text-[0.625rem] text-muted">
        {said ? t(said) : null}
      </span>
    </>
  )
}
