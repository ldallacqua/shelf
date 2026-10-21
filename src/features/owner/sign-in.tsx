'use client'

import { LogInIcon, LogOutIcon } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { type Ref, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { signOut, useOwner } from './owner'

type Trouble = 'wrong' | 'tooMany' | 'failed' | 'notSetUp'

const FIELD =
  'h-10 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-base text-text disabled:opacity-50 pointer-coarse:h-11'

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
 * Checks the email address and password. Signed in, it goes on to `from`,
 * or, for an assistant, to where Better Auth sends its request next: the
 * consent page. A whole new page either way, so all of it knows the owner
 * is here.
 */
const signInWithPassword = async (
  email: string,
  password: string,
  then: string,
  forAssistant?: string,
): Promise<Trouble> => {
  try {
    const response = await fetch('/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        rememberMe: true,
        ...(forAssistant ? { oauth_query: forAssistant } : {}),
      }),
    })
    if (response.status === 401) return 'wrong'
    if (response.status === 429) return 'tooMany'
    if (response.status === 503) return 'notSetUp'
    if (!response.ok) return 'failed'
    const answer = (await response.json()) as { redirect?: boolean; url?: string }
    window.location.assign(forAssistant && answer.redirect && answer.url ? answer.url : then)
    // The page is leaving; nothing more to say.
    return await new Promise<never>(() => {})
  } catch {
    return 'failed'
  }
}

/** Signing in (spec 11): one account, by email address and password. */
export function SignIn() {
  const t = useTranslations('Account')
  const locale = useLocale()
  const params = useSearchParams()
  const owner = useOwner()
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<Trouble>()
  const password = useRef<HTMLInputElement>(null)

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
      {trouble ? (
        <p role="alert" className="mt-6 rounded-control border border-line-strong px-4 py-3">
          {t(trouble)}
        </p>
      ) : null}
      <form
        className="mt-6 grid max-w-sm gap-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          setBusy(true)
          const answer = await signInWithPassword(
            String(form.get('email') ?? ''),
            String(form.get('password') ?? ''),
            destination(params.get('from'), locale),
            forAssistant,
          )
          // Drawn at once: the fields must be enabled again before one takes focus.
          flushSync(() => {
            setTrouble(answer)
            setBusy(false)
          })
          // Wrong: the address stays, and the password is typed again.
          if (answer === 'wrong' && password.current) {
            password.current.value = ''
            password.current.focus()
          }
        }}
      >
        <SignInFields disabled={busy} password={password} />
        <div>
          <Button type="submit" variant="primary" disabled={busy || owner.status === 'checking'}>
            <LogInIcon aria-hidden="true" />
            {busy ? t('signingIn') : t('submit')}
          </Button>
        </div>
      </form>
    </div>
  )
}

function SignInFields({
  disabled,
  password,
}: {
  disabled?: boolean
  password?: Ref<HTMLInputElement>
}) {
  const t = useTranslations('Account')
  return (
    <>
      <label className="grid gap-1.5 text-sm font-medium">
        {t('email')}
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          spellCheck={false}
          disabled={disabled}
          className={FIELD}
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">
        {t('password')}
        <input
          ref={password}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          disabled={disabled}
          className={FIELD}
        />
      </label>
    </>
  )
}

/** The page before it knows the address: the same words, and a form that waits. */
export function SignInWaiting() {
  const t = useTranslations('Account')
  return (
    <div className="mt-6 max-w-xl">
      <p className="text-pretty text-muted">{t('body')}</p>
      <div className="mt-6 grid max-w-sm gap-4">
        <SignInFields disabled />
        <div>
          <Button variant="primary" disabled>
            <LogInIcon aria-hidden="true" />
            {t('submit')}
          </Button>
        </div>
      </div>
    </div>
  )
}
