import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

/**
 * A shelf's address with no account behind it (ADR 004): it may have been
 * renamed or deleted, or mistyped. Said in the page, which is marked not to
 * be indexed; the address has a route, so the proxy cannot answer it with a
 * 404.
 */
export function NoShelf() {
  const t = useTranslations('Library')
  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('noShelf.heading')}</h1>
      <EmptyLedge
        label={t('noShelf.heading')}
        title={t('noShelf.title')}
        body={t('noShelf.body')}
        action={
          <Button variant="primary" asChild>
            <Link href="/sign-up">{t('makeYourOwn')}</Link>
          </Button>
        }
      />
    </>
  )
}
