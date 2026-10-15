import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Page } from '@/features/shell/page'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

/**
 * A game's address with no game behind it: it may have been taken off the
 * shelf, or mistyped. Said in the page, which is marked not to be indexed;
 * the address has a route, so the proxy cannot answer it with a 404.
 */
export function GameMissing() {
  const t = useTranslations('Game')
  const library = useTranslations('Library')

  return (
    <Page>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{library('title')}</h1>
      <EmptyLedge
        label={library('title')}
        title={t('notFound')}
        body={t('notFoundBody')}
        action={
          <Button variant="primary" asChild>
            <Link href="/library">{t('notFoundAction')}</Link>
          </Button>
        }
      />
    </Page>
  )
}
