'use client'

import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { useShelf } from './shelf'
import { libraryHref } from './shelf-address'

/**
 * A private shelf, seen by anyone but its account (ADR 004): only that it is
 * private, by its handle. Nothing of its library is in the page. With
 * `missing`, one's own private shelf has no smart shelf by that name.
 */
export function PrivateShelf({ missing }: { missing?: boolean }) {
  const t = useTranslations('Library')
  const shelves = useTranslations('Shelves')
  const { handle } = useShelf()

  if (missing) {
    return (
      <>
        <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{shelves('label')}</h1>
        <EmptyLedge
          label={shelves('label')}
          title={shelves('notFound')}
          body={shelves('notFoundBody')}
          action={
            <Button variant="primary" asChild>
              <Link href={libraryHref(handle)}>{t('title')}</Link>
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('atHandle', { handle })}</h1>
      <EmptyLedge
        label={t('atHandle', { handle })}
        title={t('private.title')}
        body={t('private.body')}
        action={
          <Button variant="primary" asChild>
            <Link href="/sign-up">{t('makeYourOwn')}</Link>
          </Button>
        }
      />
    </>
  )
}
