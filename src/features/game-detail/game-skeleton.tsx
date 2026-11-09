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
    <div aria-busy="true" className="game @container">
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <div aria-hidden="true" className="game-hero">
        <div className="game-backdrop" />
        <div className="game-hero-inner mx-auto w-full max-w-360 px-4 @min-[39rem]:px-6 @min-[63rem]:px-10">
          <span className="flex min-h-10 items-center pointer-coarse:min-h-11">
            <span className="game-back">
              <span className="ghost block h-4 w-20" />
            </span>
          </span>
          <div className="flex items-end gap-4 @min-[39rem]:gap-6">
            <span className="game-cover ghost aspect-[3/4]" />
            <div className="grid flex-1 gap-3 pb-1">
              <span className="ghost h-8 w-3/4 @min-[39rem]:h-12" />
              <span className={cn('ghost h-3 w-40')} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
