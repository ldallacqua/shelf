'use client'

import { LogInIcon, LogOutIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { signOut, useOwner } from './owner'

/** The reason Better Auth gives when the GitHub account is not the owner's. */
const NOT_THE_OWNER = 'not_the_owner'

type Trouble = 'notOwner' | 'failed' | 'notSetUp'

/** Where to go back to after signing in: a page of this site, or the library. */
const destination = (from: string | null, locale: string): string =>
  from && from.startsWith(`/${locale}/`) && !from.startsWith('//') ? from : `/${locale}/library`

/**
 * An assistant's sign-in, when this page is part of one: Better Auth sends
 * the person here with the assistant's request in the address, signed.
 * Handed back with the sign-in, it carries on to the consent page.
 */
const assistantRequest = (params: URLSearchParams): string | undefined =>
  params.has('sig') && params.has('client_id') ? params.toString() : undefined

/**
 * Leaves for GitHub. Better Auth answers with GitHub's address, and comes
 * back to `from` once GitHub has said who this is, or to this page with the
 * reason it would not.
 */
const leaveForGithub = async (
  locale: string,
  from: string | null,
  forAssistant?: string,
): Promise<Trouble> => {
  try {
    const response = await fetch('/api/auth/sign-in/social', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'github',
        callbackURL: destination(from, locale),
        errorCallbackURL: `/${locale}/sign-in`,
        ...(forAssistant ? { oauth_query: forAssistant } : {}),
      }),
    })
    if (response.status === 503) return 'notSetUp'
    const answer = (await response.json()) as { url?: string }
    if (!response.ok || !answer.url) return 'failed'
    window.location.assign(answer.url)
    // The page is leaving; nothing more to say.
    return await new Promise<never>(() => {})
  } catch {
    return 'failed'
  }
}

/** Signing in (spec 11): GitHub only, and only the owner gets in. */
export function SignIn() {
  const t = useTranslations('Account')
  const locale = useLocale()
  const params = useSearchParams()
  const owner = useOwner()
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<Trouble>()

  const error = params.get('error')
  const shown: Trouble | undefined =
    trouble ?? (error === NOT_THE_OWNER ? 'notOwner' : error ? 'failed' : undefined)
  const forAssistant = assistantRequest(new URLSearchParams(params.toString()))

  // Signed in already, and not here for an assistant: nothing to do but go on.
  if (owner.status === 'owner' && !forAssistant) {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('signedIn', { name: owner.name })}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" asChild>
            <Link href="/library">{t('toLibrary')}</Link>
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              if (!(await signOut())) setTrouble('failed')
              setBusy(false)
            }}
          >
            <LogOutIcon aria-hidden="true" />
            {t('signOut')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 max-w-xl">
      <p className="text-pretty text-muted">{t(forAssistant ? 'forAssistant' : 'body')}</p>
      {shown ? (
        <p role="alert" className="mt-6 rounded-control border border-line-strong px-4 py-3">
          {t(shown)}
        </p>
      ) : null}
      <div className="mt-6">
        <Button
          variant="primary"
          disabled={busy || owner.status === 'checking'}
          onClick={async () => {
            setBusy(true)
            setTrouble(await leaveForGithub(locale, params.get('from'), forAssistant))
            setBusy(false)
          }}
        >
          <LogInIcon aria-hidden="true" />
          {busy ? t('leaving') : t('withGithub')}
        </Button>
      </div>
    </div>
  )
}

/** The page before it knows the address: the same words, and a button that waits. */
export function SignInWaiting() {
  const t = useTranslations('Account')
  return (
    <div className="mt-6 max-w-xl">
      <p className="text-pretty text-muted">{t('body')}</p>
      <div className="mt-6">
        <Button variant="primary" disabled>
          <LogInIcon aria-hidden="true" />
          {t('withGithub')}
        </Button>
      </div>
    </div>
  )
}
