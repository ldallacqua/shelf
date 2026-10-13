import { useTranslations } from 'next-intl'

export const MAIN_ID = 'main'

/** The first stop for a keyboard: jumps past the header to the page's content. */
export function SkipLink() {
  const t = useTranslations('Shell')

  return (
    <a
      href={`#${MAIN_ID}`}
      className="sr-only rounded-control bg-accent px-4 py-2 text-sm font-medium text-on-accent focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-50"
    >
      {t('skipToContent')}
    </a>
  )
}
