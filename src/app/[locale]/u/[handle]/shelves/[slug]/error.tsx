'use client'

import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { Page } from '@/features/shell/page'
import { Button } from '@/ui/button'
import { Ledge } from '@/ui/ledge'

/**
 * The library could not be read (spec 3.10): say so plainly, and offer to
 * try again. The reason is logged for me; a visitor is not shown it.
 */
export default function LibraryError({ error, reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('Library')

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Page>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <div className="mx-auto w-full max-w-3xl pt-6 pb-16 sm:pt-10">
        <Ledge itemsClassName="h-40 sm:h-52" />
        <div role="alert" className="mt-14 text-center">
          <p className="title text-xl text-balance sm:text-2xl">{t('failed.title')}</p>
          <p className="mt-3 text-pretty text-muted">{t('failed.body')}</p>
          <div className="mt-6 flex justify-center">
            <Button variant="primary" onClick={reset}>
              {t('failed.retry')}
            </Button>
          </div>
        </div>
      </div>
    </Page>
  )
}
