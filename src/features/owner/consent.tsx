'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/ui/button'
import { Ghost, GhostText, Loading } from '@/ui/ghost'

import { callApi } from './call-api'
import { useAccount } from './account'

type Client = { client_id: string; client_name?: string; client_uri?: string }

/** Where an assistant is from: the site its Client ID Metadata Document is on. */
const hostOf = (clientId: string): string | undefined => {
  try {
    return new URL(clientId).host
  } catch {
    return undefined
  }
}

/** The question on its way: who asks, for what, and the two answers. */
export function ConsentGhosts() {
  const t = useTranslations('Consent')
  return (
    <Loading label={t('checking')} className="mt-6 grid max-w-xl gap-6">
      <span className="text-lg">
        <GhostText className="w-4/5" />
      </span>
      <span className="grid gap-2">
        <GhostText order={1} className="w-3/5" />
        <GhostText order={2} className="w-2/3" />
      </span>
      <span className="text-sm">
        <GhostText order={3} className="w-48" />
      </span>
      <span className="flex flex-wrap gap-3">
        <Ghost order={4} className="h-10 w-28 rounded-control pointer-coarse:h-11" />
        <Ghost order={4} className="h-10 w-28 rounded-control pointer-coarse:h-11" />
      </span>
    </Loading>
  )
}

/**
 * Letting an assistant in (architecture, section 16). Better Auth sends me
 * here, signed in, with the assistant's request in the address. Yes or no
 * goes back to Better Auth, which sends me on to the assistant.
 */
export function Consent() {
  const t = useTranslations('Consent')
  const params = useSearchParams()
  const account = useAccount('checking')
  // Its name, once asked for; null: not known, and its address will do.
  const [client, setClient] = useState<Client | null>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const clientId = params.get('client_id') ?? ''
  const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean)
  const signed = params.has('sig') && clientId !== ''

  useEffect(() => {
    if (!signed || account.status !== 'signed-in') return
    let current = true
    void callApi<Client>(
      'GET',
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    ).then((answer) => {
      if (current) setClient(answer.ok ? answer.value : null)
    })
    return () => {
      current = false
    }
  }, [signed, clientId, account.status])

  if (!signed) return <p className="mt-6 max-w-xl text-pretty">{t('nothingAsked')}</p>
  if (account.status === 'visitor') {
    return <p className="mt-6 max-w-xl text-pretty">{t('signInFirst')}</p>
  }
  if (account.status === 'checking' || client === undefined) return <ConsentGhosts />

  const name = client?.client_name ?? hostOf(clientId) ?? clientId
  const from = hostOf(clientId)

  const answer = async (accept: boolean) => {
    setBusy(true)
    setFailed(false)
    const result = await callApi<{ redirect_uri?: string; url?: string }>(
      'POST',
      '/api/auth/oauth2/consent',
      { accept, oauth_query: params.toString() },
    )
    const next = result.ok ? (result.value.redirect_uri ?? result.value.url) : undefined
    if (!next) {
      setBusy(false)
      setFailed(true)
      return
    }
    window.location.assign(next)
  }

  return (
    <div className="mt-6 grid max-w-xl gap-6">
      <p className="text-lg text-pretty">{t('asks', { name })}</p>
      {from && from !== name ? (
        <p className="text-sm text-muted">{t('from', { host: from })}</p>
      ) : null}
      <ul className="grid gap-2">
        <li>{t('read')}</li>
        <li>{t('change')}</li>
        {scopes.includes('offline_access') ? <li>{t('stay')}</li> : null}
      </ul>
      <p className="text-sm text-muted">{t('signedInAs', { name: account.name })}</p>
      {failed ? (
        <p role="alert" className="rounded-control border border-line-strong px-4 py-3">
          {t('failed')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" disabled={busy} onClick={() => void answer(true)}>
          <CheckIcon aria-hidden="true" />
          {t('allow')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => void answer(false)}>
          <XIcon aria-hidden="true" />
          {t('deny')}
        </Button>
      </div>
    </div>
  )
}
