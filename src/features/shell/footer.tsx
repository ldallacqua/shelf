import { useTranslations } from 'next-intl'

import { AccountLink } from '@/features/owner/account-link'

/**
 * The footer on every page: the credit IGDB's terms ask for wherever its
 * data is shown, and the way to sign in.
 */
export function Footer() {
  const t = useTranslations('Shell')

  return (
    <footer className="mt-auto border-t border-line/70">
      <div className="mx-auto flex w-full max-w-360 flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted sm:px-6 lg:px-10">
        <p>
          {t.rich('igdbCredit', {
            link: (chunks) => (
              <a
                href="https://www.igdb.com"
                rel="noreferrer"
                className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
        <AccountLink />
      </div>
    </footer>
  )
}
