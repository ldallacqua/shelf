'use client'

import { ArrowDownCircleIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/ui/button'
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '@/ui/popover'

import { AppWords } from './app-words'
import { refusalOf } from './tauri'
import { downloads } from './sources'
import { updates, type Ready } from './updates'

/** How often the header asks whether an update is waiting: the app itself looks far less often. */
const LOOK_EVERY = 60 * 1000

/** Where a restart stands: not asked, under way, or refused because saves are being written, or failed. */
export type Installing = 'no' | 'yes' | 'busy' | 'failed'

/** The button and what it opens, drawn from what it is given. */
export function AppUpdateView({
  ready,
  downloading,
  installing,
  onInstall,
}: {
  ready: Ready
  /** Whether a download or an extraction is under way, which the restart pauses. */
  downloading: boolean
  installing: Installing
  onInstall: () => void
}) {
  const t = useTranslations('AppUpdate')
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="primary" size="sm" className="mx-1 self-center">
          <ArrowDownCircleIcon aria-hidden="true" />
          {t('button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="grid w-80 gap-3">
        <div className="grid gap-1">
          <p className="font-medium">{t('title', { version: ready.version })}</p>
          <p className="text-sm text-pretty text-muted">{t('body')}</p>
          {downloading ? <p className="text-sm text-pretty text-muted">{t('downloads')}</p> : null}
          {installing === 'busy' || installing === 'failed' ? (
            <p role="alert" className="text-sm text-pretty">
              {t(installing)}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <PopoverClose asChild>
            <Button variant="ghost" size="sm">
              {t('later')}
            </Button>
          </PopoverClose>
          <Button variant="primary" size="sm" disabled={installing === 'yes'} onClick={onInstall}>
            {installing === 'yes' ? t('restarting') : t('restart')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Asking() {
  const [ready, setReady] = useState<Ready | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [installing, setInstalling] = useState<Installing>('no')

  const look = useCallback(async () => {
    if (document.hidden) return
    const found = await updates.ready()
    setReady(found)
    if (found) {
      setDownloading(
        (await downloads.list()).some(
          (each) =>
            each.state === 'downloading' ||
            each.state === 'queued' ||
            each.state === 'remote' ||
            each.extraction?.state === 'waiting' ||
            each.extraction?.state === 'working',
        ),
      )
    }
  }, [])

  useEffect(() => {
    // An app older than this button refuses the question: nothing is drawn.
    const quietly = () => void look().catch(() => undefined)
    quietly()
    const timer = setInterval(quietly, LOOK_EVERY)
    document.addEventListener('visibilitychange', quietly)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', quietly)
    }
  }, [look])

  if (!ready) return null
  return (
    <AppUpdateView
      ready={ready}
      downloading={downloading}
      installing={installing}
      onInstall={() => {
        setInstalling('yes')
        // The app ends as the installer starts: coming back means it could not.
        updates.install().then(
          () => setInstalling('failed'),
          (error: unknown) => setInstalling(refusalOf(error) === 'busy' ? 'busy' : 'failed'),
        )
      }}
    />
  )
}

/** A newer Shelf for Windows, ready: in the header, in the app alone, until the owner restarts it. */
export default function AppUpdate() {
  return (
    <AppWords>
      <Asking />
    </AppWords>
  )
}
