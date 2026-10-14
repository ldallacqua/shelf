import { useTranslations } from 'next-intl'

import { EmptyLedge } from '@/features/shell/empty-ledge'
import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

/** A smart shelf's address with no shelf behind it: it may have been removed or renamed. */
export function ShelfMissing() {
  const t = useTranslations('Shelves')
  const library = useTranslations('Library')

  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('label')}</h1>
      <EmptyLedge
        label={t('label')}
        title={t('notFound')}
        body={t('notFoundBody')}
        action={
          <Button variant="primary" asChild>
            <Link href="/library">{library('title')}</Link>
          </Button>
        }
      />
    </>
  )
}
