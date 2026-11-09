import { getFormatter, getTranslations } from 'next-intl/server'

import { Link } from '@/i18n/navigation'

/** When this page last changed what it says. */
const CHANGED = new Date('2026-11-08T00:00:00Z')

const SECTIONS = [
  'account',
  'shelf',
  'use',
  'services',
  'desktop',
  'downloads',
  'saves',
  'warranty',
  'changes',
] as const

/**
 * The terms for using Shelf, its API and Shelf for Windows, in plain words and
 * the same for everyone, beside Privacy. Google asks an app published to its
 * users for a link to them (ADR 008). Change this page with what Shelf does.
 */
export async function Terms() {
  const t = await getTranslations('Terms')
  const format = await getFormatter()
  return (
    <div className="mt-6 grid max-w-2xl gap-8">
      <div className="grid gap-2">
        <p className="text-pretty">{t('intro')}</p>
        <p className="text-sm text-muted">
          {t('updated', { date: format.dateTime(CHANGED, { dateStyle: 'long', timeZone: 'UTC' }) })}
        </p>
      </div>
      {SECTIONS.map((section) => (
        <section key={section} className="grid gap-2">
          <h2 className="title text-xl">{t(`sections.${section}.title`)}</h2>
          <p className="text-pretty">{t(`sections.${section}.body`)}</p>
        </section>
      ))}
      <p>
        <Link
          href="/privacy"
          className="underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t('privacy')}
        </Link>
      </p>
    </div>
  )
}
