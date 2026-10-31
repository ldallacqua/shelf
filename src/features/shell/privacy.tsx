import { getFormatter, getTranslations } from 'next-intl/server'

import { Link } from '@/i18n/navigation'

/** When this page last changed what it says. */
const CHANGED = new Date('2026-10-25T00:00:00Z')

const SECTIONS = [
  'account',
  'shelf',
  'signIn',
  'steam',
  'nintendo',
  'desktop',
  'where',
  'delete',
  'trademarks',
] as const

/**
 * What Shelf keeps about a person, where, who sees it, and how to remove it.
 * Plain words, the same for everyone. Steam's terms ask a site that keeps
 * what Steam tells it to say so (ADR 003); change this page with what Shelf
 * keeps. It ends with whose names Steam, Nintendo, PlayStation and Xbox are,
 * as Valve asks beside its sign-in button and Microsoft beside its name.
 */
export async function Privacy() {
  const t = await getTranslations('Privacy')
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
          href="/account"
          className="underline decoration-1 underline-offset-4 hover:decoration-2"
        >
          {t('account')}
        </Link>
      </p>
    </div>
  )
}
