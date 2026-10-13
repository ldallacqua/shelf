import { useTranslations } from 'next-intl'

/** The footer on every page. IGDB's terms ask for this credit wherever its data is shown. */
export function Footer() {
  const t = useTranslations('Shell')

  return (
    <footer className="mt-auto border-t border-line/70">
      <div className="mx-auto w-full max-w-360 px-4 py-6 text-sm text-muted sm:px-6 lg:px-10">
        <p>
          {t.rich('igdbCredit', {
            link: (chunks) => (
              <a
                href="https://www.igdb.com"
                rel="noreferrer"
                className="rounded-[2px] text-text underline decoration-1 underline-offset-4 hover:decoration-2"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </footer>
  )
}
