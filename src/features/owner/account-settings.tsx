'use client'

import { KeyRoundIcon, LogOutIcon, SaveIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { type ReactNode, useState } from 'react'

import { NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from '@/domain/accounts/account'
import { libraryHref } from '@/features/library/shelf-address'
import { PlatformCardGhosts, Platforms } from '@/features/platforms/platforms'
import { SECTIONS, SettingsSection } from '@/features/settings/settings-section'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'
import { Input } from '@/ui/field'
import { Ghost, GhostText, Loading } from '@/ui/ghost'
import { Ghosts } from '@/ui/ghosts'

import { accountChanged, forgetAccount, openAfresh, type SignedIn, useAccount } from './account'
import { AdultGames } from './adult-games'
import { HandleField, useHandleCheck } from './handle-field'
import { PasswordField } from './password-field'
import { VisibilityChoice } from './visibility-choice'

/** Said after an action, in the section it belongs to. */
type Said = { tone: 'done' | 'trouble'; text: string }

const post = async (path: string, body: unknown, method = 'POST') => {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await response.json().catch(() => undefined)) as
    { code?: string; error?: { code?: string } } | undefined
  return { response, code: json?.error?.code ?? json?.code, json }
}

/** A setting of the account's: the same wherever I sign in. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsSection title={title} scope="account">
      {children}
    </SettingsSection>
  )
}

function Message({ said }: { said?: Said }) {
  if (!said) return null
  return (
    <p
      role={said.tone === 'trouble' ? 'alert' : 'status'}
      className={
        said.tone === 'trouble'
          ? 'rounded-control border border-line-strong px-4 py-3'
          : 'text-sm text-muted'
      }
    >
      {said.text}
    </p>
  )
}

/** The shelf's name and handle, saved together. */
function ShelfSettings({ account }: { account: SignedIn }) {
  const t = useTranslations('AccountPage')
  const [name, setName] = useState(account.name)
  const [handle, setHandle] = useState(account.handle)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>()
  const status = useHandleCheck(handle, account.handle)

  const changed = name.trim() !== account.name || handle !== account.handle
  const blocked = status.state === 'problem' || status.state === 'empty' || name.trim() === ''

  return (
    <Section title={t('shelf')}>
      <form
        className="grid max-w-md gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!changed || blocked) return
          setBusy(true)
          setSaid(undefined)
          try {
            const { response, code, json } = await post(
              '/api/v1/me',
              {
                ...(name.trim() === account.name ? {} : { name: name.trim() }),
                ...(handle === account.handle ? {} : { handle }),
              },
              'PATCH',
            )
            if (response.ok) {
              const next = json as unknown as Omit<SignedIn, 'status'>
              accountChanged(next)
              setSaid({ tone: 'done', text: t('saved') })
            } else {
              setSaid({
                tone: 'trouble',
                text: code === 'handle-taken' ? t('errors.handleTaken') : t('errors.failed'),
              })
            }
          } catch {
            setSaid({ tone: 'trouble', text: t('errors.failed') })
          }
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
        <HandleField value={handle} onChange={setHandle} status={status} disabled={busy} />
        {handle !== account.handle ? (
          <p className="text-sm text-pretty text-muted">{t('handleMoves')}</p>
        ) : null}
        <Message said={said} />
        <div>
          <Button type="submit" variant="primary" disabled={busy || !changed || blocked}>
            <SaveIcon aria-hidden="true" />
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** Who may see the shelf: anyone, or only its account (ADR 004). */
function VisibilitySettings({ account }: { account: SignedIn }) {
  const t = useTranslations('AccountPage')
  const [shelfPublic, setShelfPublic] = useState(account.shelfPublic)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>()
  const changed = shelfPublic !== account.shelfPublic

  return (
    <Section title={t('visibility')}>
      <form
        className="grid max-w-md gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!changed) return
          setBusy(true)
          setSaid(undefined)
          try {
            const { response, json } = await post('/api/v1/me', { shelfPublic }, 'PATCH')
            if (response.ok) {
              accountChanged(json as unknown as Omit<SignedIn, 'status'>)
              setSaid({ tone: 'done', text: t('saved') })
            } else setSaid({ tone: 'trouble', text: t('errors.failed') })
          } catch {
            setSaid({ tone: 'trouble', text: t('errors.failed') })
          }
          setBusy(false)
        }}
      >
        <VisibilityChoice
          name="visibility"
          shelfPublic={shelfPublic}
          onChange={setShelfPublic}
          disabled={busy}
        />
        {account.shelfPublic && !shelfPublic ? (
          <p className="text-sm text-pretty text-muted">{t('goingPrivate')}</p>
        ) : null}
        <Message said={said} />
        <div>
          <Button type="submit" variant="primary" disabled={busy || !changed}>
            <SaveIcon aria-hidden="true" />
            {busy ? t('saving') : t('save')}
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** A new password, given the current one. Every other device is signed out. */
function PasswordSettings() {
  const t = useTranslations('AccountPage')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>()

  return (
    <Section title={t('password')}>
      <form
        className="grid max-w-md gap-5"
        onSubmit={async (event) => {
          event.preventDefault()
          const form = event.currentTarget
          const fields = new FormData(form)
          setBusy(true)
          setSaid(undefined)
          try {
            const { response, code } = await post('/api/auth/change-password', {
              currentPassword: String(fields.get('current') ?? ''),
              newPassword: String(fields.get('new') ?? ''),
              revokeOtherSessions: true,
            })
            if (response.ok) {
              form.reset()
              setSaid({ tone: 'done', text: t('passwordChanged') })
            } else {
              setSaid({
                tone: 'trouble',
                text:
                  code === 'INVALID_PASSWORD'
                    ? t('errors.wrongPassword')
                    : code === 'PASSWORD_TOO_SHORT' || code === 'PASSWORD_TOO_LONG'
                      ? t('errors.passwordLength', { min: PASSWORD_MIN })
                      : response.status === 429
                        ? t('errors.tooMany')
                        : t('errors.failed'),
              })
            }
          } catch {
            setSaid({ tone: 'trouble', text: t('errors.failed') })
          }
          setBusy(false)
        }}
      >
        <PasswordField
          label={t('currentPassword')}
          name="current"
          autoComplete="current-password"
          disabled={busy}
        />
        <PasswordField
          label={t('newPassword')}
          name="new"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          maxLength={PASSWORD_MAX}
          disabled={busy}
          hint={t('passwordHint', { min: PASSWORD_MIN })}
        />
        <Message said={said} />
        <div>
          <Button type="submit" variant="secondary" disabled={busy}>
            <KeyRoundIcon aria-hidden="true" />
            {t('changePassword')}
          </Button>
        </div>
      </form>
    </Section>
  )
}

/** Every session ended, this one too: home, signed out. */
function SignOutEverywhere() {
  const t = useTranslations('AccountPage')
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>()

  return (
    <Section title={t('devices')}>
      <p className="max-w-xl text-pretty text-muted">{t('devicesBody')}</p>
      <Message said={said} />
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setSaid(undefined)
            try {
              const { response } = await post('/api/auth/revoke-sessions', {})
              if (response.ok) {
                forgetAccount()
                openAfresh(`/${locale}`)
                return
              }
            } catch {
              // Said below.
            }
            setSaid({ tone: 'trouble', text: t('errors.failed') })
            setBusy(false)
          }}
        >
          <LogOutIcon aria-hidden="true" />
          {t('signOutEverywhere')}
        </Button>
      </div>
    </Section>
  )
}

/** The account and everything on its shelf, gone, after the password is typed once more. */
function DeleteAccount() {
  const t = useTranslations('AccountPage')
  const locale = useLocale()
  const [asked, setAsked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said>()

  return (
    <Section title={t('delete')}>
      <div className="grid max-w-xl gap-5 rounded-panel border border-line-strong p-5">
        <p className="flex gap-3 text-pretty">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-5 flex-none" />
          {t('deleteBody')}
        </p>
        {asked ? (
          <form
            className="grid max-w-md gap-5"
            onSubmit={async (event) => {
              event.preventDefault()
              const fields = new FormData(event.currentTarget)
              setBusy(true)
              setSaid(undefined)
              try {
                const { response, code } = await post('/api/auth/delete-user', {
                  password: String(fields.get('password') ?? ''),
                })
                if (response.ok) {
                  forgetAccount()
                  openAfresh(`/${locale}`)
                  return
                }
                setSaid({
                  tone: 'trouble',
                  text:
                    code === 'INVALID_PASSWORD' ? t('errors.wrongPassword') : t('errors.failed'),
                })
              } catch {
                setSaid({ tone: 'trouble', text: t('errors.failed') })
              }
              setBusy(false)
            }}
          >
            <PasswordField
              label={t('deletePassword')}
              name="password"
              autoComplete="current-password"
              disabled={busy}
            />
            <Message said={said} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" variant="primary" disabled={busy}>
                <Trash2Icon aria-hidden="true" />
                {t('deleteForGood')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  setAsked(false)
                  setSaid(undefined)
                }}
              >
                {t('keep')}
              </Button>
            </div>
          </form>
        ) : (
          <div>
            <Button variant="secondary" onClick={() => setAsked(true)}>
              <Trash2Icon aria-hidden="true" />
              {t('deleteStart')}
            </Button>
          </div>
        )}
      </div>
    </Section>
  )
}

/** A form's fields on their way, with the button under them. */
function FieldGhosts({ fields }: { fields: number }) {
  return (
    <div className="grid max-w-md gap-5">
      {Array.from({ length: fields }, (_, field) => (
        <span key={field} className="grid gap-1.5 text-sm">
          <GhostText order={field} className="w-24" />
          <Ghost order={field} className="h-10 rounded-control pointer-coarse:h-11" />
        </span>
      ))}
      <Ghost order={fields} className="h-10 w-28 rounded-control pointer-coarse:h-11" />
    </div>
  )
}

/** For someone not signed in, on any of the account's pages, coming back to it afterwards. */
function SignInFirst({ from }: { from: string }) {
  const t = useTranslations('AccountPage')
  const locale = useLocale()
  return (
    <div className="max-w-xl">
      <p className="text-pretty">{t('signInFirst')}</p>
      <div className="mt-6">
        <Button variant="primary" asChild>
          <Link href={{ pathname: '/sign-in', query: { from: `/${locale}${from}` } }}>
            {t('signIn')}
          </Link>
        </Button>
      </div>
    </div>
  )
}

/**
 * A page of the account's settings (issue 152): built ahead as its ghosts, which `ghost` draws in
 * the page's exact shape, and filled in the browser for the account signed in.
 */
function ForAccount({
  from,
  ghost,
  children,
}: {
  from: string
  ghost: ReactNode
  children: (account: SignedIn) => ReactNode
}) {
  const t = useTranslations('AccountPage')
  const account = useAccount('checking')
  if (account.status === 'checking') {
    return (
      <Loading label={t('checking')} className={SECTIONS}>
        {ghost}
      </Loading>
    )
  }
  if (account.status !== 'signed-in') return <SignInFirst from={from} />
  return <div className={SECTIONS}>{children(account)}</div>
}

/** Profile: what the shelf is called and where it is. */
export function ProfileSettings() {
  const t = useTranslations('AccountPage')
  return (
    <ForAccount
      from="/settings/profile"
      ghost={
        <>
          <Ghosts lines={1} className="max-w-xl" />
          <Section title={t('shelf')}>
            <FieldGhosts fields={2} />
          </Section>
        </>
      }
    >
      {(account) => (
        <>
          <p className="max-w-xl text-pretty text-muted">
            {t.rich('intro', {
              link: (chunks) => (
                <Link
                  href={libraryHref(account.handle)}
                  className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
          {/* Saved, the fields already hold what the account now is: kept, with what was said. */}
          <ShelfSettings account={account} />
        </>
      )}
    </ForAccount>
  )
}

/** Privacy and content: who sees the shelf (the account's), and adult games (this device's). */
export function PrivacySettings() {
  const t = useTranslations('AccountPage')
  return (
    <ForAccount
      from="/settings/privacy"
      ghost={
        <>
          <Section title={t('visibility')}>
            <div className="grid max-w-md gap-2">
              <GhostText className="mb-2 w-32 text-sm" />
              {[0, 1].map((choice) => (
                <Ghost key={choice} order={choice} className="h-[4.25rem] rounded-control" />
              ))}
              <Ghost order={2} className="mt-3 h-10 w-28 rounded-control pointer-coarse:h-11" />
            </div>
          </Section>
          <AdultGames />
        </>
      }
    >
      {(account) => (
        <>
          <VisibilitySettings account={account} />
          <AdultGames />
        </>
      )}
    </ForAccount>
  )
}

/** Platforms: the stores and consoles the shelf syncs from (ADR 003). */
export function PlatformSettings() {
  const sync = useTranslations('Sync')
  return (
    <ForAccount
      from="/settings/platforms"
      ghost={
        <SettingsSection title={sync('sectionTitle')} scope="account">
          <Ghosts lines={1} className="max-w-xl" />
          <PlatformCardGhosts />
        </SettingsSection>
      }
    >
      {(account) => <Platforms handle={account.handle} />}
    </ForAccount>
  )
}

/** Security: the password, the devices signed in, and the way out for good, last. */
export function SecuritySettings() {
  const t = useTranslations('AccountPage')
  return (
    <ForAccount
      from="/settings/security"
      ghost={
        <>
          <Section title={t('password')}>
            <FieldGhosts fields={2} />
          </Section>
          <Section title={t('devices')}>
            <Ghosts lines={1} className="max-w-xl" />
            <Ghost className="h-10 w-48 rounded-control pointer-coarse:h-11" />
          </Section>
          <Section title={t('delete')}>
            <Ghost className="h-36 max-w-xl rounded-panel" />
          </Section>
        </>
      }
    >
      {() => (
        <>
          <PasswordSettings />
          <SignOutEverywhere />
          <DeleteAccount />
        </>
      )}
    </ForAccount>
  )
}
