import { useTranslations } from 'next-intl'

import { cn } from '@/ui/cn'

/**
 * A game's page before it arrives: only for a game added since the site was
 * built, whose page is made on its first visit. The cover and title have the
 * place of what replaces them.
 */
export function GameSkeleton() {
  const t = useTranslations('Library')
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="game-hero" data-layout="page">
        <div className="game-backdrop" />
        <div className="game-hero-inner mx-auto w-full max-w-360 px-4 sm:px-6 lg:px-10">
          <span className="ghost h-4 w-20" />
          <div className="flex items-end gap-4 sm:gap-6">
            <span className="game-cover ghost aspect-[3/4]" />
            <div className="grid flex-1 gap-3 pb-1">
              <span className="ghost h-8 w-3/4 sm:h-12" />
              <span className={cn('ghost h-3 w-40')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
