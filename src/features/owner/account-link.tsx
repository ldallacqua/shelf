'use client'

import { useLocale, useTranslations } from 'next-intl'

import { Link, usePathname, useRouter } from '@/i18n/navigation'

import { signOut, useOwner } from './owner'

/** Not in a sentence, so its own target: 24 pixels tall at least. */
const LINK =
  'inline-flex min-h-6 items-center rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2'

/** The footer's way in, or, once signed in, who is in and the way out. */
export function AccountLink() {
  const t = useTranslations('Account')
  const owner = useOwner()
  const router = useRouter()
  const locale = useLocale()
  // Back to this page once signed in.
  const from = `/${locale}${usePathname()}`

  if (owner.status === 'owner') {
    return (
      <span>
        {t('footerSignedIn', { name: owner.name })}
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
    <Link href={{ pathname: '/sign-in', query: { from } }} className={LINK}>
      {t('footerSignIn')}
    </Link>
  )
}
