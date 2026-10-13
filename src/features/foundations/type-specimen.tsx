import { useTranslations } from 'next-intl'

function Caption({ children }: { children: string }) {
  return <p className="text-sm text-muted">{children}</p>
}

/** Both families, set the way Shelf uses them. */
export function TypeSpecimen() {
  const t = useTranslations('Foundations.type')

  return (
    <div className="grid gap-10">
      <div>
        <Caption>{t('display')}</Caption>
        <p className="mt-3 title text-4xl text-balance sm:text-6xl">{t('displaySample')}</p>
      </div>

      <div>
        <Caption>{t('sans')}</Caption>
        <p className="mt-2 max-w-[48ch] text-lg text-pretty">{t('sansSample')}</p>
      </div>

      <div>
        <Caption>{t('mono')}</Caption>
        <p className="mt-2 readout text-sm tabular-nums sm:text-base">{t('monoSample')}</p>
      </div>
    </div>
  )
}
