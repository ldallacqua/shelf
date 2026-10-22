import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'
import { Button } from '@/ui/button'

import { Page } from './page'

/** What a visitor sees at an address with no page behind it. */
export function NotFound() {
  const t = useTranslations('NotFound')

  return (
    <Page className="py-20 text-center sm:py-28">
      <h1 className="title text-3xl text-balance sm:text-5xl">{t('title')}</h1>
      <p className="mx-auto mt-5 max-w-[46ch] text-pretty text-muted">{t('body')}</p>
      <div className="mt-8 flex justify-center">
        <Button variant="primary" asChild>
          <Link href="/">{t('action')}</Link>
        </Button>
      </div>
    </Page>
  )
}
