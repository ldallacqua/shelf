'use client'

import { UserPlusIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from '@/domain/accounts/account'
import { handleFrom } from '@/domain/accounts/handle'
import { libraryHref } from '@/features/library/shelf-address'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'

import { openAfresh, useAccount } from './account'
import { HandleField, useHandleCheck } from './handle-field'
import { PasswordField } from './password-field'
import { VisibilityChoice } from './visibility-choice'

type Trouble =
  | 'handleTaken'
  | 'handleInvalid'
  | 'emailTaken'
  | 'emailInvalid'
  | 'passwordLength'
  | 'tooMany'
  | 'notSetUp'
  | 'failed'

/** What Better Auth's refusal codes mean here. */
const TROUBLE_BY_CODE: Record<string, Trouble> = {
  USERNAME_IS_ALREADY_TAKEN: 'handleTaken',
  INVALID_USERNAME: 'handleInvalid',
  USERNAME_TOO_SHORT: 'handleInvalid',
  USERNAME_TOO_LONG: 'handleInvalid',
  USER_ALREADY_EXISTS: 'emailTaken',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'emailTaken',
  INVALID_EMAIL: 'emailInvalid',
  PASSWORD_TOO_SHORT: 'passwordLength',
  PASSWORD_TOO_LONG: 'passwordLength',
}

type NewAccount = {
  name: string
  handle: string
  email: string
  password: string
  shelfPublic: boolean
}

/**
 * Makes the account, and signs it in: a new, empty shelf at its handle,
 * opened as a whole new page so all of it knows who is here.
 */
const createAccount = async (fields: NewAccount, locale: string): Promise<Trouble> => {
  try {
    const response = await fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fields.name,
        username: fields.handle,
        email: fields.email,
        password: fields.password,
        shelfPublic: fields.shelfPublic,
        rememberMe: true,
      }),
    })
    if (response.status === 429) return 'tooMany'
    if (response.status === 503) return 'notSetUp'
    if (!response.ok) {
      const answer = (await response.json().catch(() => undefined)) as { code?: string } | undefined
      return TROUBLE_BY_CODE[answer?.code ?? ''] ?? 'failed'
    }
    openAfresh(`/${locale}/u/${fields.handle}`)
    // The page is leaving; nothing more to say.
    return await new Promise<never>(() => {})
  } catch {
    return 'failed'
  }
}

const LINK = 'rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/**
 * Creating a shelf (ADR 004): a name, a handle checked as it is typed, an
 * email address and a password, and whether the shelf is public, which it
 * is unless you say otherwise.
 */
export function SignUp() {
  const t = useTranslations('SignUp')
  const locale = useLocale()
  const account = useAccount()
  const formId = useId()
  const [name, setName] = useState('')
  const [chosenHandle, setChosenHandle] = useState<string>()
  const [shelfPublic, setShelfPublic] = useState(true)
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<Trouble>()

  // Until one is typed, the handle follows the name.
  const handle = chosenHandle ?? handleFrom(name)
  const status = useHandleCheck(handle)

  if (account.status === 'signed-in') {
    return (
      <div className="mt-6 max-w-xl">
        <p className="text-pretty">{t('already', { name: account.name })}</p>
        <div className="mt-6">
          <Button variant="primary" asChild>
            <Link href={libraryHref(account.handle)}>{t('toShelf')}</Link>
          </Button>
        </div>
      </div>
    )
  }

  const blocked = status.state === 'problem' || status.state === 'empty'

  return (
    <div className="mt-6 max-w-md">
      <p className="text-lg text-pretty text-muted">{t('body')}</p>
      {trouble ? (
        <p role="alert" className="mt-6 rounded-control border border-line-strong px-4 py-3">
          {trouble === 'passwordLength'
            ? t('errors.passwordLength', { min: PASSWORD_MIN })
            : t(`errors.${trouble}`)}
        </p>
      ) : null}
      <form
        className="mt-8 grid gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (blocked) return
          const form = new FormData(event.currentTarget)
          setBusy(true)
          setTrouble(undefined)
          const answer = await createAccount(
            {
              name: name.trim(),
              handle,
              email: String(form.get('email') ?? '').trim(),
              password: String(form.get('password') ?? ''),
              shelfPublic,
            },
            locale,
          )
          setTrouble(answer)
          setBusy(false)
        }}
      >
        <label className="grid gap-1.5 text-sm font-medium">
          {t('name')}
          <Input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={NAME_MAX}
            autoComplete="name"
            disabled={busy}
            className="font-normal"
          />
        </label>
        <HandleField value={handle} onChange={setChosenHandle} status={status} disabled={busy} />
        <div className="grid gap-1.5">
          <label htmlFor={`${formId}-email`} className="text-sm font-medium">
            {t('email')}
          </label>
          <Input
            id={`${formId}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            spellCheck={false}
            disabled={busy}
            aria-describedby={`${formId}-email-hint`}
            className="font-normal"
          />
          <p id={`${formId}-email-hint`} className="text-sm text-muted">
            {t('emailHint')}
          </p>
        </div>
        <PasswordField
          label={t('password')}
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          disabled={busy}
          hint={t('passwordHint', { min: PASSWORD_MIN })}
        />
        <VisibilityChoice
          name="visibility"
          shelfPublic={shelfPublic}
          onChange={setShelfPublic}
          disabled={busy}
        />
        <p className="rounded-control border border-dashed border-line-strong px-4 py-3 text-sm text-pretty text-muted">
          {t('noReset')}
        </p>
        <div>
          <Button
            type="submit"
            variant="primary"
            disabled={busy || blocked || account.status === 'checking'}
          >
            <UserPlusIcon aria-hidden="true" />
            {busy ? t('creating') : t('submit')}
          </Button>
        </div>
      </form>
      <p className="mt-8 text-sm text-muted">
        {t.rich('haveOne', {
          link: (chunks) => (
            <Link href="/sign-in" className={LINK}>
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  )
}
