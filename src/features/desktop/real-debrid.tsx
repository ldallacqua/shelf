'use client'

import { ExternalLinkIcon, LogInIcon, LogOutIcon, XIcon } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/ui/button'
import { Confirm } from '@/ui/confirm'

import { type RealDebridAccount, realDebrid } from './sources'

/** How often a page asks whether the code has been entered. The app is what asks Real-Debrid. */
const LOOK_EVERY = 2000

/** The section, drawn from what it is given: every state of it, for Storybook too. */
export function RealDebridView({
  account,
  busy = false,
  said,
  onSignIn,
  onCancel,
  onSignOut,
}: {
  /** Undefined while the app is asked. */
  account: RealDebridAccount | undefined
  busy?: boolean
  said?: string | undefined
  onSignIn: () => void
  onCancel: () => void
  onSignOut: () => void
}) {
  const t = useTranslations('RealDebrid')
  const format = useFormatter()
  const until = account?.state === 'in' && account.until ? new Date(account.until) : undefined

  return (
    <section className="grid gap-5 border-t border-line pt-8">
      <h2 className="title text-xl sm:text-2xl">{t('title')}</h2>
      <p className="max-w-xl text-pretty text-muted">{t('intro')}</p>
      {said ? (
        <p
          role="alert"
          className="max-w-xl rounded-control border border-line-strong px-4 py-3 text-sm"
        >
          {said}
        </p>
      ) : null}
      {account?.state === 'out' ? (
        <div>
          <Button variant="secondary" disabled={busy} onClick={onSignIn}>
            <LogInIcon aria-hidden="true" />
            {t('signIn')}
          </Button>
        </div>
      ) : null}
      {account?.state === 'waiting' ? (
        <div className="grid max-w-xl gap-4 rounded-panel border border-line bg-surface p-5">
          <p className="text-sm text-pretty">{t('enterCode')}</p>
          <p className="readout text-2xl tracking-widest" aria-label={t('code')}>
            {account.code}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" variant="primary">
              <a href={account.url} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon aria-hidden="true" />
                {t('openPage')}
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
              <XIcon aria-hidden="true" />
              {t('cancel')}
            </Button>
          </div>
          <p role="status" className="text-sm text-muted">
            {t('waiting')}
          </p>
        </div>
      ) : null}
      {account?.state === 'in' ? (
        <div className="grid max-w-xl gap-4 rounded-panel border border-line bg-surface p-5">
          <div className="grid gap-1">
            <p className="text-sm font-medium wrap-anywhere">
              {t('signedInAs', { name: account.username })}
            </p>
            <p className="text-sm text-muted">
              {account.premium
                ? until
                  ? t('premiumUntil', { date: format.dateTime(until, { dateStyle: 'medium' }) })
                  : t('premium')
                : t('notPremium')}
            </p>
          </div>
          <div>
            <Confirm
              title={t('signOutTitle')}
              description={t('signOutBody')}
              confirm={t('signOutConfirm')}
              cancel={t('signOutCancel')}
              onConfirm={onSignOut}
            >
              <Button size="sm" variant="ghost" disabled={busy}>
                <LogOutIcon aria-hidden="true" />
                {t('signOut')}
              </Button>
            </Confirm>
          </div>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Real-Debrid's sign-in, on the account page, in Shelf for Windows alone (ADR 007, phase 3): a code the
 * person enters on Real-Debrid's own page. A page never holds what that gives, and is only told who it is.
 */
export function RealDebrid() {
  const t = useTranslations('RealDebrid')
  const [account, setAccount] = useState<RealDebridAccount>()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()

  const look = useCallback(async () => {
    try {
      const now = await realDebrid.account()
      // A code that ran out goes back to the start by itself, and says why.
      setAccount((before) => {
        if (before?.state === 'waiting' && now.state === 'out') setSaid(t('errors.expired'))
        return now
      })
    } catch {
      setAccount({ state: 'out' })
      setSaid(t('errors.failed'))
    }
  }, [t])

  useEffect(() => {
    void Promise.resolve().then(look)
  }, [look])

  const waiting = account?.state === 'waiting'
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void look(), LOOK_EVERY)
    return () => clearInterval(timer)
  }, [waiting, look])

  const act = async (work: () => Promise<void>) => {
    setBusy(true)
    setSaid(undefined)
    try {
      await work()
    } catch {
      setSaid(t('errors.failed'))
    }
    setBusy(false)
  }

  return (
    <RealDebridView
      account={account}
      busy={busy}
      said={said}
      onSignIn={() =>
        void act(async () => {
          setAccount(await realDebrid.signIn())
        })
      }
      onCancel={() =>
        void act(async () => {
          await realDebrid.cancelSignIn()
          setAccount({ state: 'out' })
        })
      }
      onSignOut={() =>
        void act(async () => {
          await realDebrid.signOut()
          setAccount({ state: 'out' })
        })
      }
    />
  )
}
