import { PlusIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { Eyebrow, Page } from '@/features/shell/page'
import { Ledge, ShelfLabel } from '@/ui/ledge'

import { CreateShelf } from './create-shelf'

const QUESTIONS = ['free', 'data', 'sync', 'hours', 'who', 'export'] as const

/**
 * The end of the page: an empty, lit shelf waiting for its first game, the
 * call to action once more, and the questions people ask before signing up.
 */
export function Closing() {
  const t = useTranslations('Landing')
  return (
    // As each part above: hydrated on its own, and drawn only once near.
    <Suspense>
      <section aria-labelledby="closing-title" className="landing-part py-16 sm:py-24">
        <Page className="reveal mx-auto max-w-3xl text-center">
          <Ledge
            itemsClassName="h-32 sm:h-44"
            label={<ShelfLabel count={0}>{t('closing.label')}</ShelfLabel>}
          />
          <h2 id="closing-title" className="mt-14 title text-4xl text-balance sm:text-6xl">
            {t('closing.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-[44ch] text-lg text-pretty text-muted">
            {t('closing.body')}
          </p>
          <div className="mt-8 flex justify-center">
            <CreateShelf />
          </div>
        </Page>
      </section>

      <section aria-labelledby="faq-title" className="landing-part pb-20 sm:pb-28">
        <Page className="faq reveal mx-auto max-w-3xl">
          <Eyebrow>{t('faq.eyebrow')}</Eyebrow>
          <h2 id="faq-title" className="mt-3 title text-3xl sm:text-4xl">
            {t('faq.title')}
          </h2>
          <div className="mt-8 border-t border-line">
            {QUESTIONS.map((question) => (
              <details key={question} className="border-b border-line">
                <summary className="flex items-center justify-between gap-6 rounded-control py-5 text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                  {t(`faq.${question}.q`)}
                  <PlusIcon aria-hidden="true" className="faq-mark size-5 flex-none text-muted" />
                </summary>
                <p className="max-w-[60ch] pb-6 text-pretty text-muted">{t(`faq.${question}.a`)}</p>
              </details>
            ))}
          </div>
        </Page>
      </section>
    </Suspense>
  )
}
