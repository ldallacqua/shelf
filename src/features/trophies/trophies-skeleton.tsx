import { useTranslations } from 'next-intl'

import './trophies.css'

/** The trophy wall while it is on its way: the heading, and the shape of a row of trophies. */
export function TrophiesSkeleton() {
  const t = useTranslations('Trophies')
  return (
    <>
      <h1 className="pt-10 title text-3xl sm:pt-14 sm:text-5xl">{t('title')}</h1>
      <div aria-hidden="true" className="mt-8 h-24 border-y border-line" />
      <ul aria-hidden="true" className="trophy-grid mt-14">
        {Array.from({ length: 6 }, (_, index) => (
          <li key={index} className="trophy">
            <span className="trophy-niche">
              <span className="trophy-cover ghost" />
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
