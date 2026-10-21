'use client'

import { CheckIcon, XIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { Button } from '@/ui/button'

import { callApi } from './call-api'
import { useOwner } from './owner'

type Client = { client_id: string; client_name?: string; client_uri?: string }

/** Where an assistant is from: the site its Client ID Metadata Document is on. */
const hostOf = (clientId: string): string | undefined => {
  try {
    return new URL(clientId).host
  } catch {
    return undefined
  }
}

/**
 * Letting an assistant in (architecture, section 16). Better Auth sends me
 * here, signed in, with the assistant's request in the address. Yes or no
 * goes back to Better Auth, which sends me on to the assistant.
 */
export function Consent() {
  const t = useTranslations('Consent')
  const params = useSearchParams()
  const owner = useOwner()
  const [client, setClient] = useState<Client>()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const clientId = params.get('client_id') ?? ''
  const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean)
  const signed = params.has('sig') && clientId !== ''

  useEffect(() => {
    if (!signed || owner.status !== 'owner') return
    let current = true
    void callApi<Client>(
      'GET',
      `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId)}`,
    ).then((answer) => {
      if (current && answer.ok) setClient(answer.value)
    })
    return () => {
      current = false
    }
  }, [signed, clientId, owner.status])

  if (!signed) return <p className="mt-6 max-w-xl text-pretty">{t('nothingAsked')}</p>
  if (owner.status === 'checking') return <p className="mt-6 text-muted">{t('checking')}</p>
  if (owner.status !== 'owner')
    return <p className="mt-6 max-w-xl text-pretty">{t('signInFirst')}</p>

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
      <p className="text-sm text-muted">{t('signedInAs', { name: owner.name })}</p>
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
