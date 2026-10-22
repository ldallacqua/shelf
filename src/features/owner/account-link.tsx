'use client'

import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { Link, useRouter } from '@/i18n/navigation'

import { signOut, useAccount } from './account'

/** Not in a sentence, so its own target: 24 pixels tall at least. */
const LINK =
  'inline-flex min-h-6 items-center rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** The way in, back to `from` once signed in, or, signed in, who is in and the way out. */
function AccountLinkFrom({ from }: { from?: string }) {
  const t = useTranslations('Account')
  const account = useAccount()
  const router = useRouter()

  if (account.status === 'signed-in') {
    return (
      <span>
        {t('footerSignedIn', { name: account.name })}
        {' · '}
        <button
          type="button"
          className={LINK}
          onClick={async () => {
            if (await signOut()) router.refresh()
          }}
        >
          {t('signOut')}
        </button>
      </span>
    )
  }
  return (
    <Link href={from ? { pathname: '/sign-in', query: { from } } : '/sign-in'} className={LINK}>
      {t('footerSignIn')}
    </Link>
  )
}

function AccountLinkForPage() {
  // Back to this page once signed in: its real address, language and all.
  return <AccountLinkFrom from={usePathname()} />
}

/**
 * The footer's way in, or, once signed in, who is in and the way out. Until
 * the address is known, the way in leads back to one's own shelf.
 */
export function AccountLink() {
  return (
    <Suspense fallback={<AccountLinkFrom />}>
      <AccountLinkForPage />
    </Suspense>
  )
}
